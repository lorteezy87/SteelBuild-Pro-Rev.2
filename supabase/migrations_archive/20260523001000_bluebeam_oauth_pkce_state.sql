-- ─── Bluebeam OAuth PKCE State ───────────────────────────────────────────────
-- Bluebeam's OAuth now requires PKCE (Authorization Code + S256 challenge).
-- The bluebeam-proxy Edge Function generates a `code_verifier` when building
-- the authorize URL and must recover that exact verifier when exchanging the
-- returned `code` for tokens. The two calls are separate HTTP requests, so the
-- verifier is parked here, keyed by the opaque OAuth `state`.
--
-- Security:
--   * Service-role only. RLS is ENABLED with NO policies, so the anon/auth
--     roles can never read a verifier; only the Edge Function (service role,
--     which bypasses RLS) touches this table.
--   * One-time use — the row is deleted on exchange.
--   * Short-lived — rows older than expires_at are stale and rejected; the
--     Edge Function also opportunistically purges expired rows.

CREATE TABLE IF NOT EXISTS bluebeam_oauth_states (
  state         TEXT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes')
);

CREATE INDEX IF NOT EXISTS bluebeam_oauth_states_expires_idx
  ON bluebeam_oauth_states(expires_at);

ALTER TABLE bluebeam_oauth_states ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: this table is service-role only. Verifiers must
-- never be readable from the browser.

NOTIFY pgrst, 'reload schema';
