# GitHub Reels

Scrapes GitHub Trending and AI news, ranks repos by reel potential, has Claude write Czech reel scripts, and ships a mobile web app each morning.

Instructions for coding agents working in this repo. `CLAUDE.md` points here, so this file is the single source of truth.

## Status: paused on purpose

The daily `launchd` job (`com.erikkarasek.github-reels`, 7:00) has been **disabled since 2026-09-30** and must stay that way. Two reasons:

1. Erik is not making reels right now, so the generated scripts have nowhere to go.
2. The daily run burned Claude and Gemini quota that is needed elsewhere (job hunt, Wisp).

The `~/Library/LaunchAgents/com.erikkarasek.github-reels.plist` file is kept so the job can come back in one command, but the agent is `disabled` in launchd and unloaded. Do **not** run `launchctl load`, `launchctl enable`, or `bootstrap` on it, do not "fix" the pipeline because the last log shows a failed `claude -p`, and do not add a Worker cron or a GitHub Actions schedule as a replacement. Erik turns it back on himself when he starts making reels again.

Code changes to the repo itself are fine. Just leave the scheduling alone.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `ErikKarasek/github-reels` (public, so issue bodies are public), managed with the `gh` CLI. The conventions live in the `gh-issue-conventions` skill: **load it before any issue operation.** Repo-specific notes are in `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. All five exist on the repo, so apply them rather than creating any. See the `gh-issue-conventions` skill, and `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root, neither of which exists yet. Load the `agent-domain-docs` skill; see `docs/agents/domain.md`.
