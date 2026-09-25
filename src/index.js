#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scrapeTrending, searchNewRepos } from "./github.js";
import { hackerNews, rssFeeds } from "./news.js";
import { rankRepos } from "./rank.js";
import { buildPrompt, runClaude } from "./scripts.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const TOP = Number(opt("top", 15));
const COUNT = Number(opt("count", 3));
const onlyAI = flag("ai-only");

const settle = async (label, p) => {
  try {
    const v = await p;
    console.log(`  ✓ ${label}: ${v.length}`);
    return v;
  } catch (e) {
    console.log(`  ✗ ${label}: ${e.message}`);
    return [];
  }
};

console.log("Stahuju data…");
const [daily, weekly, fresh, hn, rss] = await Promise.all([
  settle("GitHub Trending (dnes)", scrapeTrending("daily")),
  settle("GitHub Trending (týden)", scrapeTrending("weekly")),
  settle("Nová repa (7 dní)", searchNewRepos()),
  settle("Hacker News AI", hackerNews()),
  settle("RSS feedy", rssFeeds()),
]);

let repos = rankRepos([daily, weekly, fresh]);
if (onlyAI) repos = repos.filter((r) => r.ai);
repos = repos.slice(0, TOP);
const news = [...hn.slice(0, 12), ...rss.slice(0, 10)];

const day = new Date().toISOString().slice(0, 10);
const dir = join("out", day);
await mkdir(dir, { recursive: true });

const digest = [
  `# GitHub + AI digest – ${day}`,
  "",
  "## Top repa",
  "",
  "| # | Repo | ⭐ | +/den | Jazyk | Tagy | Skóre |",
  "|---|---|---|---|---|---|---|",
  ...repos.map(
    (r, i) =>
      `| ${i + 1} | [${r.name}](${r.url}) – ${r.description.replace(/\|/g, "/").slice(0, 110)} | ` +
      `${r.stars.toLocaleString("cs")} | ${r.velocity} | ${r.language ?? ""} | ` +
      `${[r.ai && "AI", r.fresh && "nové"].filter(Boolean).join(", ")} | ${r.score} |`,
  ),
  "",
  "## AI novinky",
  "",
  ...news.map((n) => `- **${n.source}** – [${n.title}](${n.url})${n.points ? ` · ${n.points} b.` : ""}`),
  "",
].join("\n");

await writeFile(join(dir, "digest.md"), digest);
await writeFile(join(dir, "data.json"), JSON.stringify({ repos, news }, null, 2));

const prompt = buildPrompt({ repos, news, count: COUNT });
await writeFile(join(dir, "prompt.md"), prompt);

console.log(`\nTop 5:`);
repos.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. ${r.name}  (+${r.velocity}/den${r.ai ? ", AI" : ""})`));

if (flag("no-scripts")) {
  console.log(`\nHotovo → ${dir}/digest.md (prompt pro scénáře: ${dir}/prompt.md)`);
  process.exit(0);
}

console.log("\nPíšu scénáře přes Claude…");
try {
  const reels = await runClaude(prompt, { model: opt("model") });
  await writeFile(join(dir, "reels.md"), reels);
  console.log(`Hotovo → ${dir}/reels.md`);
} catch (e) {
  console.log(`Scénáře se nepovedly (${e.message}).\nPrompt je v ${dir}/prompt.md – vlož ho do Claude ručně.`);
  process.exitCode = 1;
}
