#!/usr/bin/env node
// Turns a day's scripts (reels.md) into reel specs that `npm run reel` renders.
//
// Claude only splits the spoken text into lines and picks a mood and a card for each; the
// facts on the cards (stars, language, licence, description) come from data.json and the
// GitHub API, never from the model.
//
//   npm run specs -- out/2026-10-14        reels.md → out/2026-10-14/reels/*.json
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EXPRESSIONS } from "./mascot/mascot.ts";
import { runClaude } from "./scripts.js";

export const CARDS = ["stars", "growth", "name", "desc", "hex", "meta", "cta"];
const MOODS = Object.keys(EXPRESSIONS).filter((m) => m !== "sleepy");
const CTA = "Napiš do komentáře REPO a pošlu ti odkaz.";
/** The look and voice every generated reel starts with; edit a spec to change one. */
const DEFAULTS = { voice: "Liam", keyword: "REPO", character: { shape: "ghost", color: "#e4dffb", eyeColor: "#1c1638" } };

function specPrompt(reelsMd) {
  return `Níže jsou scénáře na reels. Převeď každý scénář REEL (ne "rychlovku" ani poznámky) na data pro animované video, kde postavička mluví a nad ní se střídají karty.

Vrať POUZE JSON pole, žádný Markdown, žádný text okolo. Jeden objekt na reel:
{"repo": "owner/name" nebo null, "title": "krátký název", "lines": [{"text": "...", "say": "...", "mood": "...", "card": "..."}]}

Pravidla:
- "repo": GitHub repo, o kterém reel je, přesně jako owner/name z odkazu ve scénáři. Když reel není o jednom repu (novinka, článek), dej null.
- "lines": mluvený text scénáře od hooku přes tělo po CTA, v pořadí. Jen to, co se říká nahlas: bez [záběrů], bez uvozovek, bez titulků a popisků. Neměň smysl ani fakta, jen můžeš větu zkrátit.
- Jeden řádek je jedna krátká věta, nejvýš 60 znaků. Delší větu rozděl. Celkem 6 až 10 řádků.
- Poslední řádek je vždy přesně: "${CTA}" s kartou "cta".
- "say" vyplň jen tam, kde se má řádek vyslovit jinak, než se píše: čísla napiš slovy ve správném pádě ("208 tisíc" → "dvě stě osm tisíc"). Jinak "say" vynech.
- "mood" je jedno z: ${MOODS.join(", ")}. Hook bývá surprised, vysvětlování curious nebo happy, otrava s dnešním stavem tired, chlubení proud, CTA love.
- "card" je jedno z:
  stars (celkový počet hvězd), growth (kolik hvězd přibylo za den), name (název repa, když se poprvé jmenuje),
  desc (co repo dělá), hex (jen když jde o binárky, nízkou úroveň nebo kód), meta (jazyk, licence, open source), cta (jen poslední řádek).
  Karta zůstává, dokud ji další řádek nezmění, takže sousední řádky můžou mít stejnou.

Scénáře:

${reelsMd}`;
}

/** The JSON array out of the model's answer, even if it wrapped it in a fence anyway. */
function parseArray(text) {
  const start = text.indexOf("["), end = text.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("no JSON array in the answer");
  const value = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(value)) throw new Error("the answer is not an array");
  return value;
}

function githubToken() {
  try {
    return execFileSync("gh", ["auth", "token"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

async function repoInfo(name, token) {
  const res = await fetch(`https://api.github.com/repos/${name}`, {
    headers: { "User-Agent": "github-reels", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return res.ok ? res.json() : null;
}

/** Keep only what the renderer understands, and make the ending what the ManyChat flow expects. */
function cleanLines(lines) {
  const out = (Array.isArray(lines) ? lines : [])
    .filter((l) => typeof l?.text === "string" && l.text.trim())
    .map((l) => ({
      text: l.text.trim(),
      ...(typeof l.say === "string" && l.say.trim() && l.say.trim() !== l.text.trim() ? { say: l.say.trim() } : {}),
      mood: MOODS.includes(l.mood) ? l.mood : "happy",
      card: CARDS.includes(l.card) && l.card !== "cta" ? l.card : "desc",
    }));
  while (out.length && /koment/i.test(out[out.length - 1].text)) out.pop();
  out.push({ text: CTA, mood: "love", card: "cta" });
  return out;
}

const slugOf = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Writes `<day>/reels/<n>-<name>.json` for every repo reel in `<day>/reels.md`. */
/**
 * Trending lists give stars gained today or this week. A repo found through search only
 * has its total since creation, so it gets the per-day rate the script talks about.
 */
function growthOf(known) {
  if (!known?.starsGained) return {};
  if (known.period === "daily" || known.period === "weekly") return { starsGained: known.starsGained, period: known.period };
  return known.velocity ? { starsGained: known.velocity, period: "daily" } : {};
}

export async function writeSpecs(dayDir, { model } = {}) {
  const reelsMd = await readFile(join(dayDir, "reels.md"), "utf8");
  const { repos } = JSON.parse(await readFile(join(dayDir, "data.json"), "utf8"));
  const answer = await runClaude(specPrompt(reelsMd), { model });
  let reels;
  try {
    reels = parseArray(answer);
  } catch (e) {
    await writeFile(join(dayDir, "specs-answer.txt"), answer);
    throw new Error(`${e.message}; the raw answer is in ${join(dayDir, "specs-answer.txt")}`);
  }

  const dir = join(dayDir, "reels");
  if (existsSync(dir)) for (const f of await readdir(dir)) if (f.endsWith(".json")) await rm(join(dir, f));
  await mkdir(dir, { recursive: true });
  const token = githubToken();
  const written = [], skipped = [];

  for (const [i, reel] of reels.entries()) {
    const name = typeof reel.repo === "string" ? reel.repo.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "") : null;
    if (!name || !/^[\w.-]+\/[\w.-]+$/.test(name)) {
      skipped.push(reel.title ?? `reel ${i + 1}`);
      continue;
    }
    const known = repos.find((r) => r.name.toLowerCase() === name.toLowerCase());
    const live = await repoInfo(name, token);
    if (!known && !live) {
      skipped.push(`${name} (not on GitHub)`);
      continue;
    }
    const license = live?.license?.spdx_id;
    const spec = {
      repo: live?.full_name ?? known.name,
      title: reel.title ?? name,
      // The numbers the script was written from, so the cards match what the voice says.
      description: known?.description || live?.description || "",
      stars: known?.stars ?? live?.stargazers_count ?? 0,
      ...growthOf(known),
      language: known?.language ?? live?.language ?? null,
      ...(license && license !== "NOASSERTION" ? { license } : {}),
      ...DEFAULTS,
      lines: cleanLines(reel.lines),
    };
    if (!spec.starsGained) spec.lines.forEach((l) => l.card === "growth" && (l.card = "stars"));
    const file = join(dir, `${written.length + 1}-${slugOf(name.split("/")[1])}.json`);
    await writeFile(file, JSON.stringify(spec, null, 2) + "\n");
    written.push(file);
  }
  return { written, skipped };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  const day = process.argv[2];
  if (!day || !existsSync(join(day, "reels.md"))) {
    console.error("usage: npm run specs -- out/<date>   (the folder needs reels.md and data.json)");
    process.exit(1);
  }
  const i = process.argv.indexOf("--model");
  console.log("Dělám ze scénářů data pro video…");
  const { written, skipped } = await writeSpecs(day, { model: i > 0 ? process.argv[i + 1] : undefined });
  for (const f of written) console.log(`  ✓ ${f}`);
  for (const s of skipped) console.log(`  – přeskočeno, není o jednom repu: ${s}`);
}
