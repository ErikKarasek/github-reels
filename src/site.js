#!/usr/bin/env node
// Postaví statický web ze složky out/ do site/ (pak jde na Cloudflare Pages).
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const OUT = "out";
const SITE = "site";

await rm(SITE, { recursive: true, force: true });
await mkdir(join(SITE, "d"), { recursive: true });
await cp("web", SITE, { recursive: true });

const dates = (await readdir(OUT)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
const days = [];
for (const date of dates) {
  const src = join(OUT, date);
  if (!existsSync(join(src, "data.json"))) continue;
  const dst = join(SITE, "d", date);
  await mkdir(dst, { recursive: true });
  for (const f of ["reels.md", "digest.md", "data.json"]) {
    if (existsSync(join(src, f))) await cp(join(src, f), join(dst, f));
  }
  const { repos } = JSON.parse(await readFile(join(src, "data.json"), "utf8"));
  days.push({ date, hasReels: existsSync(join(src, "reels.md")), top: repos.slice(0, 3).map((r) => r.name) });
}
await writeFile(join(SITE, "days.json"), JSON.stringify(days));
console.log(`Web: ${days.length} dní → ${SITE}/`);
