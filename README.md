# github-reels

Scrapne GitHub Trending + nová repa, stáhne AI novinky (Hacker News + RSS), seřadí repa podle „reels potenciálu“ a nechá Claude napsat scénáře na reels v češtině.

```bash
npm run reels            # data + scénáře (přes `claude -p`, žádný API klíč)
npm run scout            # jen data, bez scénářů
node src/index.js --ai-only --top 20 --count 5 --model sonnet
```

Výstup jde do `out/<datum>/`:

- `digest.md` – tabulka top rep + AI novinky
- `reels.md` – scénáře (hook, tělo se záběry, titulky, popisek, hashtagy)
- `prompt.md` – prompt, kdyby sis to chtěl pustit ručně
- `data.json` – surová data

## Appka

**https://github-reels.erikkarasek2005.workers.dev**: scénáře, repa a novinky pro každý den, dělané pro mobil. Na iPhonu: Safari → Sdílet → **Přidat na plochu**.

Web se staví ze složky `out/` (`src/site.js` + `web/`) a každé ráno se sám nahraje na Cloudflare (Workers static assets, `wrangler.jsonc`). Ručně: `npm run deploy`. Adresa je veřejná, ale nikde odkázaná a `noindex`.

## Zdroje

- `github.com/trending` (dnes + týden) – scrape HTML
- GitHub Search API – repa založená za posledních 7 dní, podle hvězd (token přes `gh auth token`)
- Hacker News (Algolia API) – AI příběhy za 48 h s 80+ body
- RSS: Simon Willison, Hugging Face, The Verge AI, TechCrunch AI

## Skóre

`log10(hvězdy za den) × 10` + 6 za AI téma + 4 za repo mladší než 14 dní + 2 za každý další žebříček, ve kterém se objeví. Laď v `src/rank.js`.

## Každé ráno samo

launchd agent spustí `scripts/daily.sh` každý den v 7:00 (když Mac spí, doběhne po probuzení). Po doběhnutí se web nahraje, přijde notifikace a otevře se appka. Log: `out/daily.log`.

```bash
cp scripts/com.erikkarasek.github-reels.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.erikkarasek.github-reels.plist   # zapnout
launchctl bootout gui/$(id -u)/com.erikkarasek.github-reels                                  # vypnout
launchctl kickstart gui/$(id -u)/com.erikkarasek.github-reels                                # pustit hned
```
