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
- `reels/*.json` – one video spec per repo reel, made from `reels.md` (see below)

## Rendering a reel

After the scripts are written, a second, short `claude -p` call turns every reel that is about one repo into a spec in `out/<date>/reels/`. `npm run reel` then makes the finished 1080×1920 videos: an ElevenLabs voiceover, the Wisp mascot talking along to it, captions, and cards about the repo.

```bash
npm run specs -- out/2026-10-14                   # specs from an existing day's reels.md
npm run reel -- out/2026-10-14                    # every reel of that day → out/2026-10-14/reels/<n>-<name>/<n>-<name>.mp4
npm run reel -- reels/rea.json                    # one hand-written spec → out/reels/rea/rea.mp4
npm run reel -- reels/rea.json --voice Daniel     # another voice, by name or id
npm run reel -- reels/rea.json --stills 1,10,20   # a few PNG frames to check the look
```

- **Key:** `npx -y @elevenlabs/cli@latest onboard init` in this folder signs in and stores `ELEVENLABS_API_KEY` in `.env` (git-ignored). The script loads it through `node --env-file-if-exists=.env`.
- **Spec:** the repo facts (`repo`, `description`, `stars`, `starsGained`, `period`, `language`, `license`), the `voice`, the mascot `character`, and the `lines`. Each line has the caption `text`, an optional `say` when it should be pronounced differently (numbers in words), a `mood` (any expression from the mascot: `happy`, `surprised`, `curious`, `proud`, `tired`, `love`…) and a `card`: `stars`, `growth`, `name`, `desc`, `hex`, `meta` or `cta`.
- **Who decides what:** Claude only splits the spoken text into lines and picks moods and cards. The facts come from `data.json` (the numbers the script was written from) and the GitHub API (licence), never from the model. Reels that are not about one repo, like a news story, are skipped.
- **Cost:** each line is one request to `eleven_v4` with `language_code: cs`, billed per character (a 30 s reel is about 400). Clips are cached in `out/.voice-cache`, so re-rendering only pays for lines that changed. The daily run never renders on its own; rendering is always a deliberate `npm run reel`.
- **Mascot:** `src/mascot/mascot.ts` is copied as-is from `wisp-buddy`; Node 24 runs it directly by stripping the types.
- **Caption:** next to every video lands `caption.txt`, the post text and hashtags from that day's `reels.md` plus the ElevenLabs credit the free plan asks for.
- **Account graphics:** `npm run brand` draws the profile picture and story highlight covers into `brand/`; `brand/bio.txt` holds the profile name and bio.

## Posting

`npm run post` sends a rendered reel to Instagram and TikTok. It always shows the caption and asks before posting, and it notes what went out in `posted.json` next to the video, so a reel is never posted twice by accident.

```bash
npm run post -- out/2026-11-25/reels/1-victory             # both, asks first
npm run post -- out/2026-11-25/reels/1-victory --ig        # only Instagram
npm run post -- out/2026-11-25/reels/1-victory --dry-run   # check everything is set up, post nothing
```

- **Instagram** is published right away, with the "AI info" label on (`is_ai_generated`). It goes through the Instagram API with Facebook Login, because that path is the only one that takes the video straight from disk; the Instagram Login path needs the video at a public URL.
- **TikTok** lands in your TikTok inbox as a draft. Posting straight to the profile needs an audited app, and the draft lets you add a sound anyway. The caption is copied to the clipboard; turn on "AI-generated content" before posting.

### One-time setup

Instagram:
1. Switch the Instagram account to Creator or Business and link it to a Facebook Page (both free).
2. At developers.facebook.com create an app (type Business) and add the Instagram product with Facebook Login.
3. In the Graph API Explorer pick the app, add the permissions `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, and generate a user token.
4. Put `META_APP_ID`, `META_APP_SECRET` and that token as `META_USER_TOKEN` into `.env`, then run `npm run post -- auth instagram`. It swaps the token for a Page token that does not expire and stores it in `.tokens.json` (git-ignored); `META_USER_TOKEN` can go after that.

TikTok:
1. At developers.tiktok.com create an app, platform Desktop, add Login Kit and Content Posting API, scope `video.upload`.
2. Register the redirect URI `http://127.0.0.1:3455/callback/`.
3. Put `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` into `.env`, then run `npm run post -- auth tiktok` and sign in in the browser. The sign-in lasts about half a year and renews itself while you use it.

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
