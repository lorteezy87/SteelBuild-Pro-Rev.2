#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Web sessions start from a fresh container clone with no node_modules and
# no .env, so lint / typecheck / vitest / build all fail until deps are
# installed and the Supabase import-time guard in src/lib/supabase.ts has
# values to read. This hook makes a fresh session immediately able to run
# the validation ladder from CLAUDE.md.
#
# Synchronous mode (no async JSON header): the session waits for install to
# finish, which guarantees deps exist before Claude runs anything. npm's
# output is sent to stderr so it stays out of the session context.
set -euo pipefail

cd "$CLAUDE_PROJECT_DIR"

# Install with a pinned npm, or `npm install` quietly downgrades the lockfile.
#
# package-lock.json carries a `libc` field on platform-specific optional deps —
# the glibc/musl constraints npm uses to pick correct native binaries for
# rollup, esbuild, etc. Only npm >= 11.19 round-trips that field. Older npm
# silently DROPS it, and because `npm install` rewrites the lockfile (unlike
# `npm ci`), every session used to open with a 48-line deletion-only diff in
# package-lock.json that must never be committed — it is a downgrade, and CI
# would not catch it because CI runs `npm ci` on glibc.
#
# Measured in the web container (2026-09): npm 10.9.7 strips it, npm 11.6.2
# ALSO strips it, npm 11.19.1 preserves it. Hence an exact pin rather than
# `npm@11`. Re-check this floor if the lockfile format changes again.
#
# `npm install -g npm@…` is NOT usable here: the container's global npm tree is
# incomplete (`Cannot find module 'promise-retry'` from arborist), so npm cannot
# upgrade itself. corepack fetches its own copy and sidesteps that entirely.
#
# Best-effort by design: if corepack cannot fetch (offline, cache miss), fall
# back to the container npm so a session still gets its dependencies. The
# fallback warns, because it will leave the lockfile diff behind.
NPM_PIN="npm@11.19.1"
if COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack "$NPM_PIN" install --no-audit --no-fund 1>&2; then
  :
else
  echo "[session-start] could not run $NPM_PIN via corepack; falling back to npm $(npm --version 2>/dev/null || echo unknown)." 1>&2
  echo "[session-start] expect a spurious deletion-only package-lock.json diff (libc fields) — discard it, do not commit." 1>&2
  npm install --no-audit --no-fund 1>&2
fi

# Non-network placeholder Supabase vars matching .github/workflows/ci.yml.
# src/lib/supabase.ts throws at import if these are unset, which would break
# typecheck/test/build. Only add them when the environment hasn't already
# injected real values, and never duplicate lines on resume/compact reruns.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  if [ -z "${VITE_SUPABASE_URL:-}" ] && ! grep -q '^export VITE_SUPABASE_URL=' "$CLAUDE_ENV_FILE" 2>/dev/null; then
    echo 'export VITE_SUPABASE_URL=https://ci-placeholder.supabase.co' >> "$CLAUDE_ENV_FILE"
  fi
  if [ -z "${VITE_SUPABASE_ANON_KEY:-}" ] && ! grep -q '^export VITE_SUPABASE_ANON_KEY=' "$CLAUDE_ENV_FILE" 2>/dev/null; then
    echo 'export VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key' >> "$CLAUDE_ENV_FILE"
  fi
fi
