import { spawn } from "node:child_process";

export function buildPrompt({ repos, news, count }) {
  const repoLines = repos
    .map(
      (r, i) =>
        `${i + 1}. ${r.name} — ${r.description || "(bez popisu)"}\n` +
        `   ${r.url} | ${r.language ?? "?"} | ⭐ ${r.stars.toLocaleString("cs")} (+${r.velocity}/den)` +
        `${r.ai ? " | AI" : ""}${r.fresh ? " | NOVÉ" : ""}`,
    )
    .join("\n");
  const newsLines = news
    .map((n, i) => `${i + 1}. [${n.source}] ${n.title}${n.points ? ` (${n.points} bodů)` : ""}\n   ${n.url}`)
    .join("\n");

  return `Jsi scenárista krátkých vertikálních videí (Instagram Reels / TikTok / YouTube Shorts) o AI a open-source pro české publikum.

Tady jsou dnešní data.

## Nejzajímavější GitHub repa (seřazeno podle potenciálu)
${repoLines}

## AI novinky za poslední 2 dny
${newsLines}

## Úkol
1. Vyber ${count} nejlepší témata na reels (mix: nejvíc virální repo, praktický "tohle si nainstaluj" tool, a jedna velká AI novinka). U každého jednou větou řekni, proč zrovna tohle.
2. Ke každému napiš scénář na 30–45 s v češtině, hovorově, tykání, bez korporátních frází:
   - **HOOK (0–3 s)** – jedna věta, která zastaví scrollování. Žádné "Ahoj, dneska vám ukážu".
   - **Tělo** – 3–5 krátkých vět, co to je, proč to lidi řeší, konkrétní číslo (hvězdy, rychlost růstu, cena…).
   - **Payoff / CTA** – co si z toho má divák odnést + výzva: „Napiš do komentáře REPO a pošlu ti odkaz do DM.“ (odkaz posílá ManyChat automaticky, jen followerům – nikdy neříkej, že odkaz je v bio).
   - Ke každé větě v hranatých závorkách **[záběr]** – co ukázat na obrazovce (screen recording repa, demo, README, graf hvězd…).
   - **Text na obrazovce** – 3–5 krátkých titulků.
   - **Popisek + 5 hashtagů** – popisek končí „💬 Napiš REPO a pošlu ti odkaz“.
   - **ManyChat** – odkaz, který má jít do DM (URL repa), a jedna věta, co v DM k odkazu napsat.
3. Na konec dej jednu "rychlovku" – 15s reel "3 repa tohoto týdne" ve stylu výčtu.

Drž se jen faktů z dat výše. Když něco nevíš jistě (co repo přesně dělá), napiš to jako poznámku pro autora, ať si to ověří, a nevymýšlej si.
Výstup v Markdownu.`;
}

/** Pustí prompt přes Claude Code CLI (`claude -p`) – jede na tvém předplatném, žádný API klíč. */
export function runClaude(prompt, { model } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "text"];
    if (model) args.push("--model", model);
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(`claude -p skončil s kódem ${code}: ${err.trim()}`)),
    );
    child.stdin.end(prompt);
  });
}
