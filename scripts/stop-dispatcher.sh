#!/bin/zsh
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_PATH="$BASE_DIR/DISPATCHER.pid"

if [[ ! -f "$PID_PATH" ]]; then
  echo "dispatcher not running"
  exit 0
fi

PID="$(cat "$PID_PATH" 2>/dev/null || true)"
if [[ -z "${PID:-}" ]]; then
  rm -f "$PID_PATH"
  echo "dispatcher pid file was empty"
  exit 0
fi

if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "dispatcher stopped: pid=$PID"
else
  echo "dispatcher process not found: pid=$PID"
fi

rm -f "$PID_PATH"
