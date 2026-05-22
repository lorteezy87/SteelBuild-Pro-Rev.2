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

# package-lock.json is present; prefer `npm install` over `npm ci` so the
# cached container layer is reused across sessions instead of wiping and
# reinstalling node_modules every time.
npm install --no-audit --no-fund 1>&2

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
