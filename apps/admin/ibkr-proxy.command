#!/bin/bash
# STW Companion — start the local IBKR pricing proxy, then open its status page.
#
# Portable launcher: resolves its own location (= apps/admin), so it works wherever
# the repo lives and on any machine. Double-click it in Finder, or run from a shell.
# Idempotent — if the proxy is already running (e.g. the login LaunchAgent started it),
# this just opens the status page instead of starting a second copy.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"   # apps/admin
PYTHON="$(command -v python3)"
LOG="$HOME/Library/Logs/stw-ibkr-proxy.log"
PORT=8765

echo "STW IBKR Proxy launcher"
echo "-----------------------"

if [ -z "$PYTHON" ]; then
  echo "ERROR: python3 not found on PATH."
  exit 1
fi

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Already running on port $PORT — nothing to start."
else
  echo "Starting proxy from $DIR ..."
  cd "$DIR" || { echo "ERROR: cannot cd to $DIR"; exit 1; }
  # nohup + disown so the proxy survives this Terminal window closing.
  nohup "$PYTHON" ibkr_proxy.py >> "$LOG" 2>&1 &
  disown
  for _ in $(seq 1 20); do
    lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 0.5
  done
  if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Started."
  else
    echo "ERROR: proxy did not come up — see $LOG"
    exit 1
  fi
fi

echo "Opening https://localhost:$PORT/status ..."
open "https://localhost:$PORT/status"
echo "Done. You can close this window."
