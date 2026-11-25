#!/usr/bin/env node
// Turns reel specs into finished vertical videos: ElevenLabs voiceover, the Wisp mascot
// talking along, captions and cards about the repo.
//
//   npm run reel -- out/2026-10-14                   every spec of that day (out/<day>/reels/*.json)
//   npm run reel -- reels/rea.json                   one spec
//   npm run reel -- reels/rea.json --voice Daniel    another voice (name or id)
//   npm run reel -- reels/rea.json --stills 1,10,20  a few PNG frames, to check the look
//
// Voice clips are cached, so running it again only pays for lines that changed.
import { existsSync, statSync } from "node:fs";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { voiceover, DEFAULT_MODEL } from "./voice.js";
import { render } from "./render.js";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!target || !existsSync(target)) {
  console.error("usage: npm run reel -- <out/<date> | reels/name.json> [--voice <name|id>] [--model <id>] [--stills 1,10]");
  process.exit(1);
}

let files = [target];
if (statSync(target).isDirectory()) {
  const dir = existsSync(join(target, "reels")) ? join(target, "reels") : target;
  files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort().map((f) => join(dir, f));
  if (!files.length) {
    console.error(`No specs in ${dir}. Make them from the day's scripts first: npm run specs -- ${target}`);
    process.exit(1);
  }
}

if (!process.env.ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY is missing. Run `npx -y @elevenlabs/cli@latest onboard init` in this folder, it stores a key in .env.");
  process.exit(1);
}

const stills = opt("stills")?.split(",").map(Number);
for (const file of files) {
  const reel = JSON.parse(await readFile(file, "utf8"));
  const slug = basename(file, ".json");
  // A day's reels land next to their specs; a hand-written one under out/reels/.
  const dir = file.startsWith("out/") || file.startsWith("out\\") ? join(dirname(file), slug) : join("out", "reels", slug);
  await mkdir(dir, { recursive: true });

  const model = opt("model") ?? reel.model ?? DEFAULT_MODEL;
  console.log(`\n${reel.repo} → voice (${model})…`);
  const { durations, wav, spent } = await voiceover(reel.lines, dir, { voice: opt("voice") ?? reel.voice, model });
  console.log(`  ${durations.length} lines, ${durations.reduce((a, b) => a + b, 0).toFixed(1)} s, ${spent ? `~${spent} characters billed` : "all from cache"}`);

  const out = join(dir, `${slug}.mp4`);
  console.log(stills ? "  stills…" : "  video…");
  await render(reel, durations, wav, out, { stills });
  console.log(`  ${stills ? dir + "/" : out}`);
  if (!stills) {
    const caption = await captionFor(reel, file);
    if (caption) await writeFile(join(dir, "caption.txt"), caption);
  }
}

/**
 * The post text from the day's reels.md (the section that links this repo), with the
 * credit the ElevenLabs free plan asks for. Hand-written specs can carry `caption`.
 */
async function captionFor(reel, file) {
  let text = reel.caption;
  const md = join(dirname(dirname(file)), "reels.md");
  if (!text && existsSync(md)) {
    const section = (await readFile(md, "utf8")).split(/\n## /).find((s) => s.includes(`github.com/${reel.repo}`));
    text = section?.match(/### Popisek[^\n]*\n([\s\S]*?)(?=\n###|\n> |\n---|$)/)?.[1].replace(/`/g, "").trim();
  }
  return text ? `${text}\n\nHlas: ElevenLabs (AI)\n` : null;
}
