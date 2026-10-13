import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Potomek běží mimo repo. V něm si Claude Code přečte AGENTS.md a scénáře pak začínaly
// úvahou o pravidlech pro issues. Složka je stálá, ať se v /tmp nekupí prázdné adresáře.
const CLAUDE_CWD = join(tmpdir(), "github-reels-claude");
// Ranní běh nesmí viset do nekonečna, když CLI neodpoví.
const CLAUDE_TIMEOUT_MIN = 10;

export function buildPrompt({ repos, news, count }) {
  const repoLines = repos
    .map(
      (r, i) =>
        `${i + 1}. ${r.name} — ${r.description || "(bez popisu)"}\n` +
        `   ${r.url} | ${r.language ?? "?"} | ⭐ ${r.stars.toLocaleString("cs")} (+${r.velocity}/den)` +
        `${r.ai ? " | AI" : ""}${r.fresh ? " | NOVÉ" : ""}`,
    )
    .join("\n");
  const newsLines = news
    .map((n, i) => `${i + 1}. [${n.source}] ${n.title}${n.points ? ` (${n.points} bodů)` : ""}\n   ${n.url}`)
    .join("\n");

  return `Jsi scenárista krátkých vertikálních videí (Instagram Reels / TikTok / YouTube Shorts) o AI a open-source pro české publikum.

Tady jsou dnešní data.

## Nejzajímavější GitHub repa (seřazeno podle potenciálu)
${repoLines}

## AI novinky za poslední 2 dny
${newsLines}

## Úkol
1. Vyber ${count} nejlepší témata na reels (mix: nejvíc virální repo, praktický "tohle si nainstaluj" tool, a jedna velká AI novinka). U každého jednou větou řekni, proč zrovna tohle.
2. Ke každému napiš scénář na 30–45 s v češtině, hovorově, tykání, bez korporátních frází:
   - **HOOK (0–3 s)** – jedna věta, která zastaví scrollování. Žádné "Ahoj, dneska vám ukážu".
   - **Tělo** – 3–5 krátkých vět, co to je, proč to lidi řeší, konkrétní číslo (hvězdy, rychlost růstu, cena…).
   - **Payoff / CTA** – co si z toho má divák odnést + výzva: „Napiš do komentáře REPO a pošlu ti odkaz do DM.“ (odkaz posílá ManyChat automaticky, jen followerům – nikdy neříkej, že odkaz je v bio).
   - Ke každé větě v hranatých závorkách **[záběr]** – co ukázat na obrazovce (screen recording repa, demo, README, graf hvězd…).
   - **Text na obrazovce** – 3–5 krátkých titulků.
   - **Popisek + 5 hashtagů** – popisek končí „💬 Napiš REPO a pošlu ti odkaz“.
   - **ManyChat** – odkaz, který má jít do DM (URL repa), a jedna věta, co v DM k odkazu napsat.
3. Na konec dej jednu "rychlovku" – 15s reel "3 repa tohoto týdne" ve stylu výčtu.

Drž se jen faktů z dat výše. Když něco nevíš jistě (co repo přesně dělá), napiš to jako poznámku pro autora, ať si to ověří, a nevymýšlej si.
Výstup v Markdownu.`;
}

/** Pustí prompt přes Claude Code CLI (`claude -p`) – jede na tvém předplatném, žádný API klíč. */
export function runClaude(prompt, { model } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "text"];
    if (model) args.push("--model", model);
    mkdirSync(CLAUDE_CWD, { recursive: true });
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], cwd: CLAUDE_CWD });
    let out = "";
    let err = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, CLAUDE_TIMEOUT_MIN * 60_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    // Claude CLI píše důvod (limit, přihlášení) často na stdout, ne na stderr. Brát jen
    // stderr znamenalo hlášku "skončil s kódem 1: " a žádnou šanci zjistit, co se stalo.
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`claude -p neodpověděl do ${CLAUDE_TIMEOUT_MIN} minut, ukončeno`));
      if (code === 0) return resolve(out.trim());
      const why = [err.trim(), out.trim()].filter(Boolean).join(" | ").slice(0, 500);
      reject(new Error(`claude -p skončil s kódem ${code}: ${why || "bez výstupu"}`));
    });
    child.stdin.end(prompt);
  });
}
