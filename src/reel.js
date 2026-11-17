#!/usr/bin/env node
// Turns one reel spec (reels/*.json) into a finished vertical video: ElevenLabs voiceover,
// the Wisp Buddy mascot talking along, captions and cards about the repo.
//
//   npm run reel -- reels/rea.json                   voice + video
//   npm run reel -- reels/rea.json --voice Daniel    another voice (name or id)
//   npm run reel -- reels/rea.json --stills 1,10,20  a few PNG frames, to check the look
//
// Voice clips are cached, so running it again only pays for lines that changed.
import { readFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { voiceover, DEFAULT_MODEL } from "./voice.js";
import { render } from "./render.js";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!file) {
  console.error("usage: npm run reel -- <reels/name.json> [--voice <name|id>] [--model <id>] [--stills 1,10]");
  process.exit(1);
}

const reel = JSON.parse(await readFile(file, "utf8"));
const slug = basename(file, ".json");
const dir = join("out", "reels", slug);
await mkdir(dir, { recursive: true });

if (!process.env.ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY is missing. Run `npx -y @elevenlabs/cli@latest onboard init` in this folder, it stores a key in .env.");
  process.exit(1);
}

const model = opt("model") ?? reel.model ?? DEFAULT_MODEL;
console.log(`Voice (${model})…`);
const { durations, wav, spent } = await voiceover(reel.lines, dir, { voice: opt("voice") ?? reel.voice, model });
console.log(`  ${durations.length} lines, ${durations.reduce((a, b) => a + b, 0).toFixed(1)} s, ${spent ? `~${spent} characters billed` : "all from cache"}`);

const out = join(dir, `${slug}.mp4`);
const stills = opt("stills")?.split(",").map(Number);
console.log(stills ? "Stills…" : "Video…");
await render(reel, durations, wav, out, { stills });
console.log(stills ? `  ${dir}/` : `  ${out}`);
