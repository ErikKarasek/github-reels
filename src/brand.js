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

function ghost(expression, x, y, size) {
  const g = mascotFrame(WISP, stillPose(EXPRESSIONS[expression]));
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${g.width} ${g.height}"><g transform="rotate(${g.tilt} ${g.pivot.x} ${g.pivot.y})">${g.primitives.map(primitiveSvg).join("")}</g></svg>`;
}

const backdrop = (S) => `<defs><radialGradient id="bg" cx="50%" cy="55%" r="70%"><stop offset="0" stop-color="#2a3a7a"/><stop offset="1" stop-color="#0d1117"/></radialGradient>
<radialGradient id="halo"><stop offset="0" stop-color="#e4dffb" stop-opacity="0.4"/><stop offset="1" stop-color="#e4dffb" stop-opacity="0"/></radialGradient></defs>
<rect width="${S}" height="${S}" fill="url(#bg)"/>`;

// Instagram and TikTok crop the picture to a circle, so Wisp sits well inside it.
function avatar() {
  const S = 1080, size = 700;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${backdrop(S)}
<circle cx="540" cy="560" r="400" fill="url(#halo)"/>
${ghost("happy", (S - size) / 2, 170, size)}</svg>`;
}

// Story highlight covers: a mood plus a short label.
const COVERS = [["repa", "happy"], ["ai", "curious"], ["tipy", "proud"], ["o mně", "love"]];
function cover(label, mood) {
  const S = 1080, size = 520;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${backdrop(S)}
<circle cx="540" cy="450" r="320" fill="url(#halo)"/>
${ghost(mood, (S - size) / 2, 160, size)}
<text x="540" y="860" text-anchor="middle" font-family="${HEAVY}" font-weight="800" font-size="110" fill="#fff">${label}</text></svg>`;
}

await mkdir("brand", { recursive: true });
await sharp(Buffer.from(avatar())).png().toFile("brand/avatar.png");
for (const [label, mood] of COVERS) await sharp(Buffer.from(cover(label, mood))).png().toFile(`brand/highlight-${label.replace(/\s/g, "-")}.png`);
console.log("brand/avatar.png + highlight covers");
