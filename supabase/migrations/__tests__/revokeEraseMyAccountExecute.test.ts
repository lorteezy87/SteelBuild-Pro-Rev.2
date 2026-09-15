import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260915100000_revoke_erase_my_account_execute_from_authenticated.sql",
  ),
  "utf8",
);

describe("revoke erase_my_account EXECUTE from authenticated", () => {
  it("targets the exact identity signature for revocation", () => {
    expect(sql).toContain("'public.erase_my_account(text)'");
  });

  it("names anon and authenticated, never public alone", () => {
    // Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE directly to
    // authenticated (a separate grantee from PUBLIC), so "revoke ... from
    // public" alone would leave the function callable by anyone with a
    // session — the same defect 20260914020000 documents.
    expect(sql).toContain("revoke execute on function public.erase_my_account(text) from public, anon, authenticated");
  });

  it("skips a function that is absent rather than aborting the migration", () => {
    // erase_my_account is production-only — not created by any migration in
    // this repo — so a bare REVOKE would abort replay on a fresh database
    // with "function ... does not exist".
    expect(sql).toContain("to_regprocedure('public.erase_my_account(text)') is not null");
    expect(sql).toContain("skipping revoke, function not present here");
    expect(sql).not.toMatch(/^revoke execute on function/m);
  });

  it("does not touch service_role or the function owner", () => {
    const revokeLine = sql.match(/^\s*execute 'revoke execute[^']*';/m)?.[0];
    expect(revokeLine).toBeDefined();
    expect(revokeLine).not.toMatch(/service_role/i);
    expect(revokeLine).not.toMatch(/postgres/i);
  });
});
