#!/usr/bin/env node
// Account graphics: the profile picture (Wisp on the reels' night-blue background) and
// highlight covers. Everything lands in brand/.
//
//   npm run brand
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { EXPRESSIONS, mascotFrame, stillPose } from "./mascot/mascot.ts";
import { primitiveSvg } from "./render.js";

const WISP = { shape: "ghost", color: "#e4dffb", eyeColor: "#1c1638" };
const HEAVY = "Avenir Next, Helvetica Neue";

/**
 * Wisp the way the app icon draws him: lit from the top left, darker lavender on the
 * far side, leaning a little. `id` keeps the gradient ids apart when one SVG has several.
 */
function ghost(expression, x, y, size, id = "w") {
  const g = mascotFrame(WISP, stillPose(EXPRESSIONS[expression]));
  const { cx, cy, rx, count } = g.body;
  const shade = `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx - rx * 0.4}" cy="${cy - rx * 0.45}" r="${rx * 1.75}">
<stop offset="0" stop-color="#fdfcff"/><stop offset="0.4" stop-color="#e7e2fc"/><stop offset="0.72" stop-color="#d8d1f6"/><stop offset="1" stop-color="#a49bd6"/></radialGradient>`;
  const parts = g.primitives.map((p, i) => primitiveSvg(i < count ? { ...p, fill: `url(#${id})` } : p)).join("");
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${g.width} ${g.height}"><defs>${shade}</defs><g transform="rotate(${g.tilt + 5} ${g.pivot.x} ${g.pivot.y})">${parts}</g></svg>`;
}

// The app icon's night: indigo in the top left fading to near black, a soft glow behind Wisp.
const backdrop = (S, glowY) => `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2566"/><stop offset="0.55" stop-color="#17143a"/><stop offset="1" stop-color="#0a0915"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#3b3590" stop-opacity="0.9"/><stop offset="1" stop-color="#3b3590" stop-opacity="0"/></radialGradient></defs>
<rect width="${S}" height="${S}" fill="url(#bg)"/><circle cx="${S / 2}" cy="${glowY}" r="${S * 0.42}" fill="url(#glow)"/>`;

// Instagram and TikTok crop the picture to a circle, so Wisp sits well inside it.
function avatar() {
  const S = 1080, size = 700;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${backdrop(S, 560)}
${ghost("neutral", (S - size) / 2, 175, size)}</svg>`;
}

// Story highlight covers: a mood plus a short label.
const COVERS = [["repa", "neutral"], ["ai", "curious"], ["tipy", "proud"], ["o mně", "love"]];
function cover(label, mood) {
  const S = 1080, size = 520;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${backdrop(S, 450)}
${ghost(mood, (S - size) / 2, 160, size)}
<text x="540" y="860" text-anchor="middle" font-family="${HEAVY}" font-weight="800" font-size="110" fill="#fff">${label}</text></svg>`;
}

await mkdir("brand", { recursive: true });
await sharp(Buffer.from(avatar())).png().toFile("brand/avatar.png");
for (const [label, mood] of COVERS) await sharp(Buffer.from(cover(label, mood))).png().toFile(`brand/highlight-${label.replace(/\s/g, "-")}.png`);
console.log("brand/avatar.png + highlight covers");
