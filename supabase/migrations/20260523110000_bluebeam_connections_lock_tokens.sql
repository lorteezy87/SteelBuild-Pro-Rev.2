-- ─── Lock Bluebeam OAuth tokens out of the browser ───────────────────────────
-- bluebeam_connections stores per-user Bluebeam OAuth access/refresh tokens.
-- The bluebeam_connections_own_user policy granted the row owner FULL (ALL)
-- access and the authenticated role had SELECT on every column, so a logged-in
-- user could read their own raw OAuth tokens in the browser (and
-- INSERT/UPDATE/DELETE connection rows) — contradicting the integration's model
-- where tokens never leave the server. No client code reads or writes this
-- table directly; the bluebeam-proxy edge function (service role, which bypasses
-- RLS and grants) is the only reader/writer.
--
-- NOTE: a column-level REVOKE is INEFFECTIVE while a table-level SELECT grant
-- exists, so we revoke the table SELECT and re-grant SELECT on only the
-- non-secret columns (access_token / refresh_token are intentionally excluded).
-- The browser can still read connection metadata (status, email, timestamps)
-- for its own row, but never the tokens. Writes are removed by restricting the
-- policy to SELECT-only — all mutations go through the service-role proxy.

REVOKE SELECT ON bluebeam_connections FROM authenticated, anon;

GRANT SELECT (
  id, user_id, token_expires_at, bluebeam_user_id, bluebeam_email,
  display_name, status, last_used_at, error_message,
  created_at, updated_at, is_deleted, deleted_at
) ON bluebeam_connections TO authenticated;

DROP POLICY IF EXISTS bluebeam_connections_own_user ON bluebeam_connections;

CREATE POLICY bluebeam_connections_select_own
  ON bluebeam_connections
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
