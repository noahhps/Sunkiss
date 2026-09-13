#!/usr/bin/env bash
# Starts the Sunkiss server and the desktop app together, with labeled output.
# Ctrl+C stops both; closing the app window stops the server too.
#   ./dev.sh
set -uo pipefail
cd "$(dirname "$0")"

[ -d node_modules ] || npm install

pids=()

# run <label> <color> <command...>: runs a command in the background, prefixing its output.
run() {
  local label=$1 color=$2
  shift 2
  "$@" > >(awk -v prefix="$(printf '\033[%sm[%s]\033[0m ' "$color" "$label")" '{ print prefix $0; fflush() }') 2>&1 &
  pids+=($!)
}

# Stops a process and everything it started (npm → tsx → node; npm → vite, cargo → the app).
kill_tree() {
  local child
  for child in $(pgrep -P "$1"); do kill_tree "$child"; done
  kill -TERM "$1" 2>/dev/null
}

stop() {
  trap - INT TERM
  echo
  echo "Stopping server and app..."
  for pid in "${pids[@]}"; do kill_tree "$pid"; done
  wait 2>/dev/null
  exit 0
}
trap stop INT TERM

run server 35 npm run server  # magenta
run app 36 npm run tauri dev  # cyan

# Stop everything as soon as either side exits (e.g. you close the app window).
while :; do
  for pid in "${pids[@]}"; do
    kill -0 "$pid" 2>/dev/null || stop
  done
  sleep 1
done
