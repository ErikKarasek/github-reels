#!/bin/zsh
# Pouští launchd každé ráno. launchd má holý PATH, proto ho nastavujeme ručně.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "${0:A:h}/.." || exit 1

day=$(date +%Y-%m-%d)
if node src/index.js; then
  # Výstup deploye do logu, ať je vidět proč selhal. Bez úspěšného nahrání web ukazuje
  # včerejšek, takže ho neotvírat, jako by byl čerstvý.
  if npm run -s deploy; then
    osascript -e "display notification \"Nové scénáře jsou v appce\" with title \"GitHub Reels\" sound name \"Glass\""
    open "https://github-reels.erikkarasek2005.workers.dev/"
  else
    osascript -e "display notification \"Scénáře hotové, ale nahrání webu selhalo – jsou v out/$day/, detail v out/daily.log\" with title \"GitHub Reels\""
    open "out/$day/reels.md"
  fi
else
  osascript -e "display notification \"Běh selhal – mrkni do out/daily.log\" with title \"GitHub Reels\""
fi
