# GitHub Reels

Scrapes GitHub Trending and AI news, ranks repos by reel potential, has Claude write Czech reel scripts, and ships a mobile web app each morning.

Instructions for coding agents working in this repo. `CLAUDE.md` points here, so this file is the single source of truth.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `ErikKarasek/github-reels` (public, so issue bodies are public), managed with the `gh` CLI. The conventions live in the `gh-issue-conventions` skill: **load it before any issue operation.** Repo-specific notes are in `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. All five exist on the repo, so apply them rather than creating any. See the `gh-issue-conventions` skill, and `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root, neither of which exists yet. Load the `agent-domain-docs` skill; see `docs/agents/domain.md`.
