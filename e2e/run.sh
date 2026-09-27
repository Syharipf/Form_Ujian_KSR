#!/bin/bash
# Full-stack E2E without a Supabase account:
#   PGlite (Postgres) → PostgREST → proxy → `next dev` → headless Chromium.
# Needs Chromium (set CHROMIUM_PATH if not /usr/bin/chromium-browser). Downloads PostgREST once.
set -euo pipefail
cd "$(dirname "$0")"
BIN=.bin/postgrest
PGRST_VERSION=v16.4
if [ ! -x "$BIN" ]; then
  mkdir -p .bin
  curl -sL "https://github.com/PostgREST/postgrest/releases/download/$PGRST_VERSION/postgrest-$PGRST_VERSION-linux-static-x86-64.tar.xz" | tar xJ -C .bin
fi

SECRET=local-e2e-secret-that-is-at-least-32-chars
KEY=$(bun jwt.ts "$SECRET")
PIDS=()
cleanup() { kill "${PIDS[@]}" 2>/dev/null || true; }
trap cleanup EXIT

bun stand-in.ts > .bin/stand-in.log 2>&1 & PIDS+=($!)
sleep 3
PGRST_DB_URI=postgres://postgres:postgres@127.0.0.1:5433/postgres PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
  PGRST_JWT_SECRET=$SECRET PGRST_DB_POOL=1 PGRST_DB_CHANNEL_ENABLED=false PGRST_SERVER_PORT=3001 \
  PGRST_DB_PREPARED_STATEMENTS=false "$BIN" > .bin/postgrest.log 2>&1 & PIDS+=($!)
(cd .. && SUPABASE_URL=http://localhost:54321 SUPABASE_SECRET_KEY=$KEY ADMIN_PASSWORD=rahasia-e2e \
  exec bun run dev --port 3100) > .bin/next.log 2>&1 & PIDS+=($!)
until curl -sf -o /dev/null http://localhost:3100/; do sleep 1; done

bun e2e.ts
