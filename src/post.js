#!/usr/bin/env node
// Posts a rendered reel to Instagram (published right away, with the AI label) and to
// TikTok (sent to the TikTok inbox as a draft, which you finish in the app).
//
//   npm run post -- auth instagram                    once: turn the token from .env into a lasting one
//   npm run post -- auth tiktok                       once: sign in to TikTok in the browser
//   npm run post -- out/2026-11-25/reels/1-victory    post that reel (asks before posting)
//   npm run post -- out/2026-11-25/reels/1-victory --ig --dry-run
//
// Credentials come from .env (see README); the lasting tokens land in .tokens.json,
// which is git-ignored. Nothing here runs on a schedule: posting is always this command.
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync, chmodSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { createInterface } from "node:readline/promises";

const GRAPH = "https://graph.facebook.com/v27.0";
const TIKTOK = "https://open.tiktokapis.com/v2";
const TOKENS = ".tokens.json";
const TIKTOK_REDIRECT = "http://127.0.0.1:3455/callback/";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const positional = args.filter((a) => !a.startsWith("--"));

const loadTokens = () => (existsSync(TOKENS) ? JSON.parse(readFileSync(TOKENS, "utf8")) : {});
function saveTokens(patch) {
  writeFileSync(TOKENS, JSON.stringify({ ...loadTokens(), ...patch }, null, 2) + "\n");
  chmodSync(TOKENS, 0o600);
}
function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(", ")}. See "Posting" in the README.`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(res) {
  const body = await res.json().catch(() => ({}));
  const err = body.error && (body.error.message ?? (body.error.code !== "ok" && body.error.code));
  if (!res.ok || err) throw new Error(`${res.status} ${err || JSON.stringify(body)}`);
  return body;
}

// ---------- Instagram (Instagram API with Facebook Login) ----------

async function authInstagram() {
  need("META_APP_ID", "META_APP_SECRET", "META_USER_TOKEN");
  const q = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: process.env.META_USER_TOKEN,
  });
  const { access_token: userToken } = await json(await fetch(`${GRAPH}/oauth/access_token?${q}`));
  const pages = await json(await fetch(`${GRAPH}/me/accounts?${new URLSearchParams({
    fields: "name,access_token,instagram_business_account{id,username}",
    access_token: userToken,
  })}`));
  const page = pages.data.find((p) => p.instagram_business_account);
  if (!page) throw new Error("None of your Facebook Pages has an Instagram professional account linked. Link it in the Instagram app: Settings → Accounts Center, or on the Page's settings.");
  // A Page token made from a long-lived user token does not expire.
  saveTokens({ instagram: { userId: page.instagram_business_account.id, username: page.instagram_business_account.username, page: page.name, token: page.access_token } });
  console.log(`Instagram ready: @${page.instagram_business_account.username} (through the Page "${page.name}"). You can delete META_USER_TOKEN from .env now.`);
}

async function postInstagram(video, caption, dryRun) {
  const ig = loadTokens().instagram;
  if (!ig) throw new Error("Instagram is not set up. Run: npm run post -- auth instagram");
  if (dryRun) return console.log(`  [dry run] would publish to @${ig.username}`);

  const create = await json(await fetch(`${GRAPH}/${ig.userId}/media?${new URLSearchParams({
    media_type: "REELS",
    upload_type: "resumable",
    caption,
    share_to_feed: "true",
    is_ai_generated: "true", // the voice is ElevenLabs
    access_token: ig.token,
  })}`, { method: "POST" }));

  const size = statSync(video).size;
  const up = await json(await fetch(create.uri, {
    method: "POST",
    headers: { Authorization: `OAuth ${ig.token}`, offset: "0", file_size: String(size) },
    body: readFileSync(video),
  }));
  if (!up.success) throw new Error(`upload failed: ${JSON.stringify(up)}`);

  // Instagram processes the video before it can be published.
  for (let i = 0; ; i++) {
    const { status_code } = await json(await fetch(`${GRAPH}/${create.id}?fields=status_code&access_token=${ig.token}`));
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`Instagram could not process the video (${status_code})`);
    if (i >= 30) throw new Error("Instagram is still processing after 5 minutes; try again later");
    process.stdout.write(i ? "." : "  processing");
    await sleep(10_000);
  }
  const { id } = await json(await fetch(`${GRAPH}/${ig.userId}/media_publish?${new URLSearchParams({ creation_id: create.id, access_token: ig.token })}`, { method: "POST" }));
  const { permalink } = await json(await fetch(`${GRAPH}/${id}?fields=permalink&access_token=${ig.token}`)).catch(() => ({}));
  console.log(`\n  Instagram: published ${permalink ?? id}`);
  return { id, permalink };
}

// ---------- TikTok (Content Posting API, upload to inbox) ----------

async function authTiktok() {
  need("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET");
  const verifier = randomBytes(48).toString("base64url").slice(0, 64);
  const state = randomBytes(16).toString("hex");
  const url = `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    scope: "user.info.basic,video.upload",
    response_type: "code",
    redirect_uri: TIKTOK_REDIRECT,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("hex"), // TikTok desktop wants hex, not base64url
    code_challenge_method: "S256",
  })}`;

  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const q = new URL(req.url, TIKTOK_REDIRECT).searchParams;
      if (!q.has("code") && !q.has("error")) return res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("Hotovo, můžeš zavřít tohle okno.");
      server.close();
      if (q.get("state") !== state) reject(new Error("state did not match, try again"));
      else if (q.get("error")) reject(new Error(`${q.get("error")}: ${q.get("error_description")}`));
      else resolve(q.get("code"));
    }).listen(3455, "127.0.0.1", () => {
      console.log("Opening TikTok sign-in in the browser…");
      execFileSync("open", [url]);
    });
  });

  const t = await json(await fetch(`${TIKTOK}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: TIKTOK_REDIRECT,
      code_verifier: verifier,
    }),
  }));
  saveTiktok(t);
  console.log(`TikTok ready (scopes: ${t.scope}).`);
}

function saveTiktok(t) {
  saveTokens({ tiktok: { openId: t.open_id, access: t.access_token, accessExpires: Date.now() + t.expires_in * 1000, refresh: t.refresh_token, refreshExpires: Date.now() + t.refresh_expires_in * 1000 } });
}

/** An access token lives about a day, the refresh token half a year and changes on every use. */
async function tiktokToken() {
  need("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET");
  const tk = loadTokens().tiktok;
  if (!tk) throw new Error("TikTok is not set up. Run: npm run post -- auth tiktok");
  if (Date.now() < tk.accessExpires - 60_000) return tk.access;
  if (Date.now() > tk.refreshExpires) throw new Error("TikTok sign-in expired. Run: npm run post -- auth tiktok");
  const t = await json(await fetch(`${TIKTOK}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: tk.refresh }),
  }));
  saveTiktok(t);
  return t.access_token;
}

async function postTiktok(video, dryRun) {
  const token = await tiktokToken();
  if (dryRun) return console.log("  [dry run] would send to the TikTok inbox");
  const size = statSync(video).size;
  // Up to 64 MB goes in one chunk; above that, 10 MB chunks with the remainder in the last one.
  const MB = 1024 * 1024;
  const chunk = size <= 64 * MB ? size : 10 * MB;
  const count = size <= 64 * MB ? 1 : Math.floor(size / chunk);

  const init = await json(await fetch(`${TIKTOK}/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunk, total_chunk_count: count } }),
  }));
  const data = readFileSync(video);
  for (let i = 0; i < count; i++) {
    const from = i * chunk, to = i === count - 1 ? size - 1 : from + chunk - 1;
    const res = await fetch(init.data.upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(to - from + 1), "Content-Range": `bytes ${from}-${to}/${size}` },
      body: data.subarray(from, to + 1),
    });
    if (res.status !== 201 && res.status !== 206) throw new Error(`TikTok upload failed at chunk ${i + 1}: ${res.status} ${await res.text()}`);
  }

  for (let i = 0; i < 20; i++) {
    const { data: s } = await json(await fetch(`${TIKTOK}/post/publish/status/fetch/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ publish_id: init.data.publish_id }),
    }));
    if (s.status === "SEND_TO_USER_INBOX" || s.status === "PUBLISH_COMPLETE") {
      console.log("  TikTok: in your inbox. Open TikTok, tap the notification, paste the caption (it is on the clipboard) and turn on \"AI-generated content\".");
      return { publishId: init.data.publish_id };
    }
    if (s.status === "FAILED") throw new Error(`TikTok rejected the video: ${s.fail_reason}`);
    await sleep(3000);
  }
  console.log("  TikTok: uploaded, still processing. The draft will show up in your inbox.");
  return { publishId: init.data.publish_id };
}

// ---------- main ----------

async function post(dir) {
  const video = readdirSync(dir).find((f) => f.endsWith(".mp4"));
  if (!video) throw new Error(`No video in ${dir}. Render it first: npm run reel -- …`);
  const path = join(dir, video);
  const caption = existsSync(join(dir, "caption.txt")) ? readFileSync(join(dir, "caption.txt"), "utf8").trim() : null;
  if (!caption) throw new Error(`No caption.txt in ${dir}. Render the reel again, or write one by hand.`);

  const logFile = join(dir, "posted.json");
  const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, "utf8")) : {};
  const both = !flag("ig") && !flag("tiktok");
  const targets = [(both || flag("ig")) && "instagram", (both || flag("tiktok")) && "tiktok"].filter(Boolean)
    .filter((t) => !log[t] || flag("again") || (console.log(`  ${t}: already posted ${log[t].at}, skipping (--again to repeat)`), false));
  if (!targets.length) return;

  const dryRun = flag("dry-run");
  console.log(`\n${basename(dir)} (${(statSync(path).size / 1e6).toFixed(1)} MB) → ${targets.join(" + ")}${dryRun ? " [dry run]" : ""}\n\n${caption}\n`);
  if (!dryRun && !flag("yes")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ok = (await rl.question("Post it? [y/N] ")).trim().toLowerCase() === "y";
    rl.close();
    if (!ok) return console.log("Nothing posted.");
  }

  for (const t of targets) {
    try {
      const result = t === "instagram" ? await postInstagram(path, caption, dryRun) : (dryRun || execFileSync("pbcopy", { input: caption }), await postTiktok(path, dryRun));
      if (!dryRun) {
        log[t] = { at: new Date().toISOString(), ...result };
        writeFileSync(logFile, JSON.stringify(log, null, 2) + "\n");
      }
    } catch (e) {
      console.log(`  ${t}: ${e.message}`);
      process.exitCode = 1;
    }
  }
}

try {
  if (positional[0] === "auth") {
    if (positional[1] === "instagram") await authInstagram();
    else if (positional[1] === "tiktok") await authTiktok();
    else throw new Error("usage: npm run post -- auth instagram|tiktok");
  } else if (positional[0] && existsSync(positional[0]) && statSync(positional[0]).isDirectory()) {
    await post(positional[0]);
  } else {
    throw new Error("usage: npm run post -- <out/<date>/reels/<reel>> [--ig] [--tiktok] [--dry-run] [--yes] [--again]\n       npm run post -- auth instagram|tiktok");
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
