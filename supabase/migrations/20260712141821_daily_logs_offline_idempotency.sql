-- Offline idempotency key for daily_logs, mirroring photos + punchlist_items.
-- A client-minted client_op_id rides both the online create and the offline
-- outbox retry; the partial-unique index dedups a lost-response replay so a
-- Daily Log saved with no signal can never be created twice on reconnect.
--
-- Applied to prod via Supabase MCP apply_migration (recorded version
-- 20260712141821); this file is committed with the matching name to keep the
-- migrations/ tree in lockstep with supabase_migrations.schema_migrations.
ALTER TABLE "public"."daily_logs"
  ADD COLUMN IF NOT EXISTS "client_op_id" "uuid";

COMMENT ON COLUMN "public"."daily_logs"."client_op_id" IS
  'Client idempotency key for offline-queued daily-log creates (Field outbox). Null for rows created online.';

CREATE UNIQUE INDEX IF NOT EXISTS "uq_daily_logs_client_op_id"
  ON "public"."daily_logs" USING "btree" ("client_op_id")
  WHERE ("client_op_id" IS NOT NULL);
