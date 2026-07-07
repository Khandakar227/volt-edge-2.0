#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${NGROK_AUTH_TOKEN:?Set NGROK_AUTH_TOKEN in .env first.}"

NGROK_URL="${NGROK_URL:-${NGROK_DOMAIN:-elective-reoccupy-unknown.ngrok-free.dev}}"
PUBLIC_HOST="${PUBLIC_HOST:-127.0.0.1}"
PUBLIC_PORT="${PUBLIC_PORT:-8080}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8787}"
BACKEND_URL="${BACKEND_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}}"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok is not installed. Install it first, then rerun this script." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is not installed or not on PATH." >&2
  exit 1
fi

port_is_free() {
  local host="$1"
  local port="$2"
  node -e '
    const net = require("node:net")
    const [host, port] = process.argv.slice(1)
    const server = net.createServer()
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") process.exit(1)
      console.error(error.message)
      process.exit(2)
    })
    server.once("listening", () => server.close(() => process.exit(0)))
    server.listen(Number(port), host)
  ' "$host" "$port"
}

require_free_port() {
  local label="$1"
  local host="$2"
  local port="$3"
  local example_setting="$4"
  if ! port_is_free "$host" "$port"; then
    cat >&2 <<MSG
${label} port ${host}:${port} is already in use.

This usually means an old VoltEdge/ngrok run is still alive. Stop that terminal,
or find the process with:
  lsof -nP -iTCP:${port} -sTCP:LISTEN

Then stop it, or choose another port in .env, for example:
  ${example_setting}
MSG
    exit 1
  fi
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  [[ -n "${PUBLIC_PID:-}" ]] && kill "$PUBLIC_PID" >/dev/null 2>&1 || true
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" >/dev/null 2>&1 || true
  wait >/dev/null 2>&1 || true
  exit "$code"
}
trap cleanup EXIT INT TERM

require_free_port "Backend" "$BACKEND_HOST" "$BACKEND_PORT" "BACKEND_PORT=8788"
require_free_port "Public server" "$PUBLIC_HOST" "$PUBLIC_PORT" "PUBLIC_PORT=8081"

echo "Building frontend..."
(
  cd frontend
  npm run build
)

echo "Starting FastAPI backend on ${BACKEND_URL}..."
(
  cd backend
  if [[ -f .venv/bin/activate ]]; then
    # shellcheck disable=SC1091
    source .venv/bin/activate
  fi
  exec uvicorn app.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

echo "Starting local public server on http://${PUBLIC_HOST}:${PUBLIC_PORT}..."
PUBLIC_HOST="$PUBLIC_HOST" \
PUBLIC_PORT="$PUBLIC_PORT" \
BACKEND_URL="$BACKEND_URL" \
node scripts/serve-public.mjs &
PUBLIC_PID=$!

sleep 2

if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
  echo "FastAPI backend exited during startup. Check the error above." >&2
  exit 1
fi

if ! kill -0 "$PUBLIC_PID" >/dev/null 2>&1; then
  echo "Local public server exited during startup. Check the error above." >&2
  exit 1
fi

echo "Configuring ngrok authtoken from .env..."
ngrok config add-authtoken "$NGROK_AUTH_TOKEN" >/dev/null

NGROK_ARGS=(http "--url=${NGROK_URL}")
if [[ "${NGROK_POOLING_ENABLED:-false}" == "true" ]]; then
  NGROK_ARGS+=("--pooling-enabled")
fi
if [[ -n "${NGROK_TRAFFIC_POLICY_FILE:-}" ]]; then
  NGROK_ARGS+=("--traffic-policy-file=${NGROK_TRAFFIC_POLICY_FILE}")
fi
NGROK_ARGS+=("$PUBLIC_PORT")

echo "Opening ngrok endpoint: https://${NGROK_URL#https://}"
echo "Health check after it starts: https://${NGROK_URL#https://}/api/health"
ngrok "${NGROK_ARGS[@]}"
