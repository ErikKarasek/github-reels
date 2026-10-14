#!/bin/zsh
# Run by launchd every morning. launchd has a bare PATH, so we set it by hand.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "${0:A:h}/.." || exit 1

day=$(date +%Y-%m-%d)
if node src/index.js; then
  # Deploy output goes to the log, so a failure says why. Without a successful upload the site
  # still shows yesterday, so do not open it as if it were fresh.
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
