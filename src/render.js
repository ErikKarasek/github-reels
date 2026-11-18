// Draws a 1080×1920 reel frame by frame as SVG (sharp turns each into pixels) and pipes the
// frames to ffmpeg next to the voiceover. The mascot hops and squashes with the voice.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { blendExpressions, EXPRESSIONS, mascotFrame, mascotPose } from "./mascot/mascot.ts";
import { GAP } from "./voice.js";

const W = 1080, H = 1920, FPS = 30;
const SANS = "Helvetica Neue, Arial", HEAVY = "Avenir Next, Helvetica Neue", MONO = "Menlo";
const STAR = "M0 -1 L0.29 -0.31 L0.95 -0.31 L0.47 0.12 L0.59 0.81 L0 0.45 L-0.59 0.81 L-0.47 0.12 L-0.95 -0.31 L-0.29 -0.31 Z";
const LANG_COLOR = { TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572a5", Rust: "#dea584", Go: "#00add8", Swift: "#f05138", Kotlin: "#a97bff", "C++": "#f34b7d", C: "#555555", Java: "#b07219", Ruby: "#701516", Zig: "#ec915c" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

function primitiveSvg(p) {
  if (p.kind === "ellipse") return `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${p.fill}"/>`;
  if (p.kind === "path") return `<path d="${p.d}" fill="${p.fill}"/>`;
  return `<path d="${p.d}" fill="none" stroke="${p.stroke}" stroke-width="${p.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Greedy word wrap to `max` characters, at most `rows` rows. */
function wrap(text, max, rows) {
  const out = [];
  for (const w of text.split(/\s+/)) {
    const last = out[out.length - 1];
    if (last !== undefined && (last + " " + w).length <= max) out[out.length - 1] = last + " " + w;
    else out.push(w);
  }
  if (out.length > rows) {
    // Cut the last row at a word, not in the middle of one, and drop a dangling dash or comma.
    const rest = out.slice(rows - 1).join(" ").slice(0, max);
    const cut = rest.slice(0, Math.max(rest.lastIndexOf(" "), 1)).replace(/[\s,;:–-]+$/, "");
    out.splice(rows - 1, out.length, cut + "…");
  }
  return out;
}

/** Loudness per video frame from a 16-bit mono WAV, smoothed: quick attack, slow release. */
function loudness(file, frames) {
  const wav = readFileSync(file);
  const at = wav.indexOf("data") + 8;
  const rate = wav.readUInt32LE(24);
  const samples = new Int16Array(wav.buffer, wav.byteOffset + at, Math.floor((wav.length - at) / 2));
  const loud = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const a = Math.floor((f / FPS) * rate), b = Math.min(samples.length, a + Math.floor(rate / FPS));
    let sum = 0;
    for (let i = a; i < b; i++) sum += samples[i] * samples[i];
    loud[f] = b > a ? Math.sqrt(sum / (b - a)) / 32768 : 0;
  }
  const peak = Math.max(...loud) || 1;
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    const v = Math.min(1, (loud[f] / peak) * 1.6);
    prev += (v - prev) * (v > prev ? 0.7 : 0.25);
    loud[f] = prev;
  }
  return loud;
}

/** Captions in chunks of up to ~19 characters, each timed by its share of the line's letters. */
function chunkAt(line, t) {
  const chunks = wrap(line.text, 19, 99);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const voiced = line.dur - GAP;
  let at = 0;
  for (const [i, c] of chunks.entries()) {
    const d = (c.length / total) * voiced;
    if (t < at + d || i === chunks.length - 1) return { text: c, age: t - at };
    at += d;
  }
  return { text: "", age: 0 };
}

/** White text on a dark accent, near-black on a light one (a pale ghost-white Wisp). */
function onAccent(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? "#16132f" : "#fff";
}

function makeScene(reel, accent) {
  const [owner, name] = reel.repo.split("/");
  // Four rows fit the card. A long description gives way to its first sentence before it is cut.
  const firstSentence = reel.description.split(/(?<=[.!?])\s/)[0];
  const desc = wrap(reel.description.length > 104 && firstSentence.length >= 20 ? firstSentence : reel.description, 26, 4);
  const hexRows = Array.from({ length: 9 }, (_, r) =>
    `${(0x1000 + r * 16).toString(16).padStart(8, "0")}  ` +
    Array.from({ length: 8 }, (_, c) => ((r * 73 + c * 151 + 29) % 256).toString(16).padStart(2, "0")).join(" "));
  const chips = [
    reel.language && [LANG_COLOR[reel.language] ?? "#8b949e", reel.language],
    reel.license && ["#e3b341", `licence ${reel.license}`],
    ["#3fb950", "open source"],
  ].filter(Boolean);
  const panel = (fill = "#161b22") => `<rect x="70" y="380" width="940" height="460" rx="36" fill="${fill}" stroke="#30363d" stroke-width="3"/>`;

  return (card, age, t) => {
    const pop = ease(age / 0.35);
    const box = (inner) => `<g transform="translate(540 610) scale(${0.9 + 0.1 * pop}) translate(-540 -610)" opacity="${pop}">${inner}</g>`;
    switch (card) {
      case "stars": {
        const n = Math.round(reel.stars * ease(age / 1.0)).toLocaleString("cs-CZ").replace(/ /g, " ");
        return box(panel() + `<g transform="translate(540 500) scale(62)"><path d="${STAR}" fill="#e3b341"/></g>` +
          `<text x="540" y="690" text-anchor="middle" font-family="${HEAVY}" font-weight="800" font-size="150" fill="#fff">${n}</text>` +
          `<text x="540" y="780" text-anchor="middle" font-family="${SANS}" font-size="52" fill="#8b949e">hvězd na GitHubu</text>`);
      }
      case "growth": {
        const n = Math.round((reel.starsGained ?? 0) * ease(age / 1.0)).toLocaleString("cs-CZ").replace(/ /g, " ");
        const per = reel.period === "weekly" ? "za týden" : "za den";
        return box(panel() + `<g transform="translate(540 500) scale(62)"><path d="${STAR}" fill="#e3b341"/></g>` +
          `<text x="540" y="690" text-anchor="middle" font-family="${HEAVY}" font-weight="800" font-size="150" fill="#3fb950">+${n}</text>` +
          `<text x="540" y="780" text-anchor="middle" font-family="${SANS}" font-size="52" fill="#8b949e">hvězd ${per}</text>`);
      }
      case "name": {
        const size = Math.min(230, Math.floor(1500 / Math.max(3, name.length)));
        return box(panel() + `<text x="540" y="560" text-anchor="middle" font-family="${SANS}" font-size="60" fill="#8b949e">${esc(owner)} /</text>` +
          `<text x="540" y="${690 + size * 0.3}" text-anchor="middle" font-family="${HEAVY}" font-weight="800" font-size="${size}" fill="#58a6ff">${esc(name)}</text>`);
      }
      case "desc":
        return box(panel() + `<text x="130" y="480" font-family="${SANS}" font-size="44" fill="#58a6ff">${esc(owner)} / <tspan font-weight="bold">${esc(name)}</tspan></text>` +
          desc.map((s, i) => `<text x="130" y="${580 + i * 64}" font-family="${SANS}" font-weight="bold" font-size="54" fill="#e6edf3">${esc(s)}</text>`).join(""));
      case "hex": {
        const shown = Math.min(hexRows.length, 1 + Math.floor(age * 6));
        return box(panel("#010409") + hexRows.slice(0, shown).map((s, i) =>
          `<text x="120" y="${452 + i * 46}" font-family="${MONO}" font-size="36" fill="${i === shown - 1 ? "#7ee787" : "#3fb950"}" opacity="${i === shown - 1 ? 1 : 0.6}">${s}</text>`).join(""));
      }
      case "meta":
        return box(panel() + chips.map(([dot, label], i) => {
          const p = ease((age - i * 1.5) / 0.3), y = 410 + i * 145;
          return `<g opacity="${p}" transform="translate(${(1 - p) * 60} 0)"><rect x="150" y="${y}" width="780" height="110" rx="55" fill="#21262d" stroke="#30363d" stroke-width="3"/>` +
            `<circle cx="215" cy="${y + 55}" r="20" fill="${dot}"/><text x="265" y="${y + 74}" font-family="${SANS}" font-weight="bold" font-size="56" fill="#e6edf3">${esc(label)}</text></g>`;
        }).join(""));
      case "cta":
      default: {
        const beat = 1 + 0.03 * Math.sin(t * 7);
        const word = reel.keyword ?? "REPO";
        return box(panel() + `<text x="540" y="520" text-anchor="middle" font-family="${SANS}" font-size="56" fill="#8b949e">napiš do komentáře</text>` +
          `<g transform="translate(540 670) scale(${beat})"><rect x="-300" y="-105" width="600" height="210" rx="40" fill="${accent}"/>` +
          `<text x="0" y="52" text-anchor="middle" font-family="${HEAVY}" font-weight="800" font-size="150" fill="${onAccent(accent)}">${esc(word)}</text></g>`);
      }
    }
  };
}

/**
 * `reel`: the spec (repo, description, stars, language, license, character, lines).
 * `durations`: seconds per line, gap included. Writes `out` (MP4) or, with `stills`,
 * PNGs at those seconds next to it.
 */
export async function render(reel, durations, voiceWav, out, { stills } = {}) {
  let t0 = 0;
  const lines = reel.lines.map((l, i) => { const line = { ...l, start: t0, dur: durations[i] }; t0 += durations[i]; return line; });
  const total = t0 + 0.6;
  const frames = Math.ceil(total * FPS);
  const loud = loudness(voiceWav, frames);
  const character = reel.character ?? {};
  const accent = character.color ?? "#6d7fe0"; // the CTA and progress bar take the mascot's colour
  const scene = makeScene(reel, accent);
  // The address pill grows with the repo name; Menlo is about 0.6 em per character.
  const url = `github.com/${reel.repo}`;
  const urlSize = Math.min(30, Math.floor(900 / (url.length * 0.6)));
  const urlW = Math.round(url.length * urlSize * 0.6 + 70);

  const frameSvg = (t, f) => {
    let li = lines.findIndex((l) => t < l.start + l.dur);
    if (li < 0) li = lines.length - 1;
    const l = lines[li];
    const local = t - l.start;
    let cardStart = l.start; // a card only "changes" when its kind does
    for (let i = li; i > 0 && lines[i - 1].card === l.card; i--) cardStart = lines[i - 1].start;

    const from = EXPRESSIONS[lines[Math.max(0, li - 1)].mood] ?? EXPRESSIONS.neutral;
    const pose = mascotPose(blendExpressions(from, EXPRESSIONS[l.mood] ?? EXPRESSIONS.neutral, ease(local / 0.3)), t * 1000, 7);
    const v = loud[Math.min(frames - 1, f)];
    pose.lift += v * 5;
    pose.squash += v * 0.07;
    pose.lookY -= 0.25; // glancing up at the card
    const g = mascotFrame(character, pose);
    const SIZE = 560, my = 1090;

    const cap = chunkAt(l, local);
    const s = 0.92 + 0.08 * ease(cap.age / 0.12);
    const capText = `text-anchor="middle" font-family="${HEAVY}" font-weight="800" font-size="84" fill="#fff"`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="glow" cx="50%" cy="68%" r="60%"><stop offset="0" stop-color="#1f2a5c"/><stop offset="1" stop-color="#0d1117"/></radialGradient>
<radialGradient id="halo"><stop offset="0" stop-color="${accent}" stop-opacity="0.35"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<rect x="${540 - urlW / 2}" y="268" width="${urlW}" height="64" rx="32" fill="#21262d"/>
<text x="540" y="312" text-anchor="middle" font-family="${MONO}" font-size="${urlSize}" fill="#8b949e">${esc(url)}</text>
${scene(l.card, t - cardStart, t)}
<g transform="translate(540 990) scale(${s}) translate(-540 -990)">
<text x="540" y="1010" ${capText} stroke="#0d1117" stroke-width="14" stroke-linejoin="round" paint-order="stroke">${esc(cap.text)}</text>
<text x="540" y="1010" ${capText}>${esc(cap.text)}</text></g>
<circle cx="540" cy="${my + SIZE * 0.5}" r="${SIZE * 0.55}" fill="url(#halo)" opacity="${0.5 + v * 0.35}"/>
<ellipse cx="540" cy="${my + SIZE * 0.93}" rx="${150 - v * 14}" ry="18" fill="#000" opacity="0.35"/>
<svg x="${(W - SIZE) / 2}" y="${my}" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${g.width} ${g.height}"><g transform="rotate(${g.tilt} ${g.pivot.x} ${g.pivot.y})">${g.primitives.map(primitiveSvg).join("")}</g></svg>
<rect x="0" y="${H - 10}" width="${W * Math.min(1, t / t0)}" height="10" fill="${accent}"/>
</svg>`;
  };

  if (stills) {
    for (const s of stills) await sharp(Buffer.from(frameSvg(s, Math.round(s * FPS)))).png().toFile(out.replace(/\.mp4$/, `-${s}s.png`));
    return;
  }
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
    "-i", voiceWav, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    // Reels play loud; -14 LUFS is about where Instagram sits.
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-t", String(total), out], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
  for (let f = 0; f < frames; f++) {
    const raw = await sharp(Buffer.from(frameSvg(f / FPS, f))).removeAlpha().raw().toBuffer();
    if (!ff.stdin.write(raw)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  return { frames, seconds: total };
}
