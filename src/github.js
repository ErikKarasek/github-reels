import { execFileSync } from "node:child_process";

const UA = { "User-Agent": "github-reels/0.1 (+https://github.com)" };

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const num = (s) => Number(String(s ?? "0").replace(/[^\d]/g, "")) || 0;

/** Scrapne github.com/trending. since = daily | weekly | monthly */
export async function scrapeTrending(since = "daily", language = "") {
  const url = `https://github.com/trending/${encodeURIComponent(language)}?since=${since}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Trending ${since}: HTTP ${res.status}`);
  const html = await res.text();

  const articles = html.split('<article class="Box-row">').slice(1);
  return articles.map((a) => {
    const href = a.match(/<h2[^>]*>\s*<a[^>]*href="\/([^"]+)"/)?.[1] ?? "";
    const desc = a.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/)?.[1];
    const lang = a.match(/itemprop="programmingLanguage">([^<]+)</)?.[1];
    const stars = a.match(/href="\/[^"]+\/stargazers"[\s\S]*?<\/svg>\s*([\d,]+)/)?.[1];
    const forks = a.match(/href="\/[^"]+\/forks"[\s\S]*?<\/svg>\s*([\d,]+)/)?.[1];
    const gained = a.match(/([\d,]+)\s+stars?\s+(today|this week|this month)/)?.[1];
    return {
      name: href,
      url: `https://github.com/${href}`,
      description: desc ? decode(desc) : "",
      language: lang?.trim() ?? null,
      stars: num(stars),
      forks: num(forks),
      starsGained: num(gained),
      period: since,
      source: `trending:${since}`,
    };
  }).filter((r) => r.name);
}

function ghToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** Nová repa za posledních N dní seřazená podle hvězd (GitHub Search API). */
export async function searchNewRepos({ days = 7, minStars = 100, limit = 30 } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const q = encodeURIComponent(`created:>=${since} stars:>=${minStars}`);
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`;
  const token = ghToken();
  const res = await fetch(url, {
    headers: {
      ...UA,
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Search API: HTTP ${res.status}`);
  const data = await res.json();
  return data.items.map((r) => ({
    name: r.full_name,
    url: r.html_url,
    description: r.description ?? "",
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    starsGained: r.stargazers_count, // celé je nové, takže všechny hvězdy jsou "získané"
    createdAt: r.created_at,
    topics: r.topics ?? [],
    period: `${days}d`,
    source: "new-repos",
  }));
}
