#!/bin/zsh
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_PATH="$BASE_DIR/dispatch-daemon.mjs"
PID_PATH="$BASE_DIR/DISPATCHER.pid"
LOG_PATH="$BASE_DIR/DISPATCHER.stdout.log"

if [[ -f "$PID_PATH" ]]; then
  PID="$(cat "$PID_PATH" 2>/dev/null || true)"
  if [[ -n "${PID:-}" ]] && kill -0 "$PID" 2>/dev/null; then
    echo "dispatcher already running: pid=$PID"
    exit 0
  fi
fi

nohup node "$SCRIPT_PATH" >> "$LOG_PATH" 2>&1 &
echo $! > "$PID_PATH"
echo "dispatcher started: pid=$(cat "$PID_PATH")"
