// AI novinky: Hacker News (Algolia API) + pár RSS/Atom feedů.

const HN_QUERIES = ["AI", "LLM", "OpenAI", "Anthropic", "Claude", "Gemini", "GPT", "agent", "open source model"];

const RSS_FEEDS = [
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml" },
  { name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
];

export async function hackerNews({ hours = 48, minPoints = 80 } = {}) {
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const seen = new Map();
  await Promise.all(
    HN_QUERIES.map(async (q) => {
      const url =
        `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=30` +
        `&query=${encodeURIComponent(q)}` +
        `&numericFilters=created_at_i>${since},points>${minPoints}`;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const { hits } = await res.json();
        for (const h of hits) {
          if (seen.has(h.objectID)) continue;
          seen.set(h.objectID, {
            title: h.title,
            url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
            discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
            points: h.points,
            comments: h.num_comments,
            date: h.created_at,
            source: "Hacker News",
          });
        }
      } catch {
        /* jeden dotaz selže, ostatní pořád platí */
      }
    }),
  );
  return [...seen.values()].sort((a, b) => b.points - a.points);
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
};

export async function rssFeeds({ hours = 48 } = {}) {
  const cutoff = Date.now() - hours * 3600e3;
  const out = [];
  await Promise.all(
    RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, { headers: { "User-Agent": "github-reels/0.1" } });
        if (!res.ok) return;
        const xml = await res.text();
        const items = xml.split(/<item[\s>]|<entry[\s>]/).slice(1);
        for (const it of items) {
          const link = it.match(/<link[^>]*href="([^"]+)"/)?.[1] || tag(it, "link");
          const date = new Date(tag(it, "pubDate") || tag(it, "updated") || tag(it, "published"));
          if (isNaN(date) || date.getTime() < cutoff) continue;
          out.push({
            title: tag(it, "title"),
            url: link,
            summary: (tag(it, "description") || tag(it, "summary")).slice(0, 300),
            date: date.toISOString(),
            source: feed.name,
          });
        }
      } catch {
        /* feed nedostupný – přeskočit */
      }
    }),
  );
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
