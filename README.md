# github-reels

Scrapes GitHub Trending plus freshly created repos, pulls AI news (Hacker News + RSS), ranks the repos by "reel potential" and has Claude write reel scripts in Czech.

```bash
npm run reels            # data + scripts (through `claude -p`, no API key)
npm run scout            # data only, no scripts
node src/index.js --ai-only --top 20 --count 5 --model sonnet
```

Output lands in `out/<date>/`:

- `digest.md` – table of top repos + AI news
- `reels.md` – the scripts (hook, body with shots, captions, description, hashtags)
- `prompt.md` – the prompt, in case you want to run it by hand
- `data.json` – raw data

## Rendering a reel

`npm run reel` turns one reel spec into a finished 1080×1920 video: an ElevenLabs voiceover, the Wisp Buddy mascot talking along to it, captions, and cards about the repo.

```bash
npm run reel -- reels/rea.json                    # voice + video → out/reels/rea/rea.mp4
npm run reel -- reels/rea.json --voice Daniel     # another voice, by name or id
npm run reel -- reels/rea.json --stills 1,10,20   # a few PNG frames to check the look
```

- **Key:** `npx -y @elevenlabs/cli@latest onboard init` in this folder signs in and stores `ELEVENLABS_API_KEY` in `.env` (git-ignored). The script loads it through `node --env-file-if-exists=.env`.
- **Spec:** `reels/*.json` holds the repo facts (`repo`, `description`, `stars`, `language`, `license`), the mascot `character`, and the `lines`. Each line has the caption `text`, an optional `say` when it should be pronounced differently, a `mood` (any expression from the mascot: `happy`, `surprised`, `curious`, `proud`, `tired`, `love`…) and a `card`: `stars`, `name`, `desc`, `hex`, `meta` or `cta`.
- **Cost:** each line is one request to `eleven_v4` with `language_code: cs`, billed per character (a 30 s reel is about 370). Clips are cached in `out/reels/.voice-cache`, so re-rendering only pays for lines that changed.
- **Mascot:** `src/mascot/mascot.ts` is copied as-is from `wisp-buddy`; Node 24 runs it directly by stripping the types.

## The app

**https://github-reels.erikkarasek2005.workers.dev**: scripts, repos and news for each day, built for the phone. On an iPhone: Safari → Share → **Add to Home Screen**.

The site is built from `out/` (`src/site.js` + `web/`) and uploads itself to Cloudflare every morning (Workers static assets, `wrangler.jsonc`). By hand: `npm run deploy`. The address is public but linked from nowhere and `noindex`.

## Sources

- `github.com/trending` (today + this week) – HTML scrape
- GitHub Search API – repos created in the last 7 days, by stars (token via `gh auth token`)
- Hacker News (Algolia API) – AI stories from the last 48 h with 80+ points
- RSS: Simon Willison, Hugging Face, The Verge AI, TechCrunch AI

## Score

`log10(stars per day) × 10` + 6 for an AI topic + 4 for a repo younger than 14 days + 2 for every further list it shows up in. Tune it in `src/rank.js`.

## Every morning on its own

A launchd agent runs `scripts/daily.sh` at 7:00 every day (if the Mac is asleep, it catches up on wake). When it finishes, the site is uploaded, a notification arrives and the app opens. Log: `out/daily.log`.

```bash
cp scripts/com.erikkarasek.github-reels.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.erikkarasek.github-reels.plist   # on
launchctl bootout gui/$(id -u)/com.erikkarasek.github-reels                                  # off
launchctl kickstart gui/$(id -u)/com.erikkarasek.github-reels                                # run now
```
