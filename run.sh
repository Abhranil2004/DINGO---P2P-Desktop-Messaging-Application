#!/usr/bin/env bash
set -e

# ─── Dingo Project Runner (macOS / Linux / Windows Git Bash) ────
# Usage:  ./run.sh                # normal dev
#         ./run.sh --relay        # also start relay server

RELAY="${1:-}"

echo "═══════════════════════════════════════"
echo "  Dingo P2P Messaging And Sharing App"
echo "═══════════════════════════════════════"

# Ensure Rust is in PATH (common location: ~/.cargo/bin)
export PATH="$HOME/.cargo/bin:$PATH"

# Kill any stale Vite dev server on port 1420
if command -v taskkill &>/dev/null; then
  # Windows: kill any node process holding the port
  netstat -ano 2>/dev/null | grep ":1420 " | awk '{print $5}' | while read pid; do
    taskkill /F /PID "$pid" 2>/dev/null || true
  done
elif command -v lsof &>/dev/null; then
  # macOS/Linux
  lsof -ti:1420 | xargs kill -9 2>/dev/null || true
fi

# Check Dependencies
command -v node  >/dev/null 2>&1 || { echo "ERROR: Node.js is required (v18+). Install from https://nodejs.org"; exit 1; }
command -v rustc >/dev/null 2>&1 || { echo "ERROR: Rust is required. Run: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "Installing pnpm globally..."; npm install -g pnpm; }

echo "[1/3] Installing frontend dependencies..."
pnpm install

echo "[2/3] Building frontend..."
pnpm build

echo "[3/3] Checking tauri.conf.json..."
if [ ! -f src-tauri/tauri.conf.json ]; then
  echo "ERROR: src-tauri/tauri.conf.json missing. It was gitignored — create it or restore from backup."
  exit 1
fi

# Starting Relay Server (optional)
if [ "$RELAY" = "--relay" ]; then
  echo "[  + ] Starting WebSocket relay server..."
  cd relay-server
  npm install --silent
  node server.js &
  RELAY_PID=$!
  cd ..
  echo "       Relay running on port ${PORT:-8080} (PID $RELAY_PID)"
  trap "kill $RELAY_PID 2>/dev/null; exit" INT TERM
fi

echo ""
echo "Launching Dingo in dev mode..."
pnpm tauri dev

# Cleanup After Exit
if [ -n "$RELAY_PID" ]; then
  echo "Stopping relay server..."
  kill $RELAY_PID 2>/dev/null || true
fi
