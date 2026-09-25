#!/bin/zsh
# Pouští launchd každé ráno. launchd má holý PATH, proto ho nastavujeme ručně.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "${0:A:h}/.." || exit 1

day=$(date +%Y-%m-%d)
if node src/index.js; then
  osascript -e "display notification \"Scénáře jsou v out/$day/reels.md\" with title \"GitHub Reels\" sound name \"Glass\""
  open "out/$day/reels.md"
else
  osascript -e "display notification \"Běh selhal – mrkni do out/daily.log\" with title \"GitHub Reels\""
fi
