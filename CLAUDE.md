# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Anti-cheat pre-test/post-test exam web app (UjiKSR) for KSR PMI Universitas Telkom. Participants open a session by QR/link on Android Chrome (no login: name + NIM); committee uses `/admin`. Design spec: `docs/superpowers/specs/2026-09-27-ujian-ksr-anticheat-design.md`. UI copy is Indonesian.

Stack: Next.js 16 App Router (Turbopack) + Supabase Postgres, run with **Bun** (`node` on this machine is a Bun symlink). Tailwind v4.

## Commands

```bash
bun run dev              # needs .env.local (see .env.example)
bun test                 # unit tests: lib/*.test.ts + supabase/schema.test.ts (schema runs on in-memory PGlite)
bun test lib/exam.test.ts -t "settle"   # single file / test name
bun run lint             # eslint
bun run build            # also type-checks; run `bunx next typegen` if PageProps/RouteContext are "not found"
bun run e2e              # full stack without Supabase: PGlite → PostgREST (auto-downloaded) → next dev :3100 → headless Chromium
```

E2E notes: set `CHROMIUM_PATH` if Chromium isn't at `/usr/bin/chromium-browser`; logs and failure screenshots land in `e2e/.bin/`. PGlite drops the connection on any SQL error, so DB error paths (e.g. duplicate NIM → 23505) are covered only by `supabase/schema.test.ts`, not by E2E.

## Architecture

- **Trust boundary**: the browser never talks to Supabase. `lib/db.ts` (secret key, bypasses RLS) is server-only; RLS is enabled with no policies. The answer key (`answer_index`) never leaves the server — `buildView` in `lib/exam.ts` is the only shape sent to participants. A participant's own `score` is included only once `scoresReleased()` (`lib/attempts.ts`) says the session is closed and nobody is still working.
- **Rules are pure** in `lib/exam.ts` (shuffle order, deadlines, `settle` for timeouts/per-question skipping, grading, `buildView`). DB orchestration is in `lib/attempts.ts`: every participant API call does `loadCtx → sync (apply clock) → action → view`. The server clock is authoritative (`GRACE_MS` slack); the client timer is display only.
- **Answer indices**: options are shuffled per attempt. `attempts.option_orders[qid]` maps display index → original index; `answers` stores original indices; the client only ever sends/sees display indices.
- **Atomic writes** go through SQL functions in `supabase/schema.sql`: `record_answer` (guarded by `current_index`, so stale per-question answers are rejected) and `add_violation`. Changing the schema means updating `schema.sql` and re-running it in Supabase; `schema.test.ts` covers both functions.
- **Anti-cheat client** (`app/exam/[id]/`): `use-anti-cheat.ts` reports `hidden`/`blur`/`fullscreen_exit`/`resize` (debounced 2s) and blocks context menu/copy/selection; reload/reopen without the `fresh:<id>` sessionStorage flag set by the join page counts as a `reopen` violation. The exam client serializes answer/submit requests through a queue so responses never arrive out of order.
- **Admin**: server actions in `app/admin/actions.ts` — each must call `requireAdmin()` (actions are public endpoints). Auth is an HMAC cookie keyed by `ADMIN_PASSWORD` (`lib/admin-token.ts`). Admin result pages call `finalizeExpired` so participants who closed their browser still get a timeout score.
- Next 16 specifics: `params`/`searchParams` are Promises (use global `PageProps<'/route'>` / `RouteContext<'/route'>`); pages that read the DB without cookies call `await connection()` to avoid being prerendered.
