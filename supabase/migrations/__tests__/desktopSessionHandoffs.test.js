import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../20260721230000_desktop_session_handoffs.sql", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n").toLowerCase();

describe("desktop session handoff migration", () => {
  it("stores only ciphertext and bounded single-use metadata in private", () => {
    expect(sql).toContain("create table if not exists private.desktop_session_handoffs");
    expect(sql).toContain("encrypted_session jsonb not null");
    expect(sql).toContain("expires_at <= created_at + interval '2 minutes'");
    expect(sql).toContain("consumed_at timestamptz");
    expect(sql).not.toContain("access_token");
    expect(sql).not.toContain("refresh_token");
  });

  it("revokes table access from every API role", () => {
    expect(sql).toContain(
      "revoke all on table private.desktop_session_handoffs\n  from public, anon, authenticated, service_role;",
    );
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all).*desktop_session_handoffs/);
  });

  it("exposes only service-role create and atomic consume RPCs", () => {
    expect(sql).toContain("create or replace function public.create_desktop_session_handoff");
    expect(sql).toContain("create or replace function public.consume_desktop_session_handoff");
    expect(sql).toContain("and handoff.consumed_at is null");
    expect(sql).toContain("and handoff.expires_at > clock_timestamp()");
    expect(sql).toContain("grant execute on function public.consume_desktop_session_handoff(text, text)\n  to service_role;");
  });
});
