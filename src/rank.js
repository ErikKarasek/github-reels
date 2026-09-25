const AI_RE =
  /\b(ai|llm|llms|gpt|agents?|agentic|claude|openai|anthropic|gemini|mcp|rag|diffusion|transformers?|inference|copilot|embeddings?|neural|whisper|llama|mistral|ollama|qwen|deepseek|fine-?tun\w*|prompt\w*|vibe|chatbot|voice|tts|speech)\b/i;

export const isAI = (r) => AI_RE.test(`${r.name} ${r.description} ${(r.topics ?? []).join(" ")}`);

/**
 * Spojí repa z více zdrojů a seřadí je podle "reels potenciálu":
 * rychlost růstu (hvězdy za den), AI téma, a jestli je repo nové (novinka > evergreen).
 */
export function rankRepos(lists) {
  const byName = new Map();
  for (const r of lists.flat()) {
    const key = r.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev) byName.set(key, { ...r, sources: [r.source] });
    else {
      prev.sources.push(r.source);
      prev.starsGained = Math.max(prev.starsGained, r.starsGained);
      prev.createdAt ??= r.createdAt;
      prev.topics ??= r.topics;
    }
  }

  const perDay = (r) => {
    if (r.period === "daily") return r.starsGained;
    if (r.period === "weekly") return r.starsGained / 7;
    if (r.period === "monthly") return r.starsGained / 30;
    const days = r.createdAt ? Math.max(1, (Date.now() - Date.parse(r.createdAt)) / 864e5) : 7;
    return r.starsGained / days;
  };

  return [...byName.values()]
    .map((r) => {
      const velocity = perDay(r);
      const ai = isAI(r);
      const fresh = r.createdAt && Date.now() - Date.parse(r.createdAt) < 14 * 864e5;
      const score =
        Math.log10(1 + velocity) * 10 +
        (ai ? 6 : 0) +
        (fresh ? 4 : 0) +
        (r.sources.length - 1) * 2; // objevilo se ve víc žebříčcích
      return { ...r, velocity: Math.round(velocity), ai, fresh: Boolean(fresh), score: +score.toFixed(1) };
    })
    .sort((a, b) => b.score - a.score);
}
