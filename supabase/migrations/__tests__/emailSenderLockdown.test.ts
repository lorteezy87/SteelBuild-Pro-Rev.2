import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// SEC-N1 (audit 2026-09-23) — "Send mail as any address".
//
// The file is authored under a placeholder version and must be renamed to the
// ledger version when it is applied (CLAUDE.md, "Applying a migration"), so it
// is located by its name suffix rather than a hard-coded version.
const dir = path.resolve(process.cwd(), "supabase/migrations");
const files = fs.readdirSync(dir).filter((name) => /^\d{14}_.*\.sql$/.test(name)).sort();
const lockdownName = files.find((name) => name.endsWith("_email_sender_lockdown.sql"));

function readMigration(name: string): string {
  return fs.readFileSync(path.join(dir, name), "utf8");
}

/** Strip `--` line comments so assertions only see executable SQL. */
function code(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

const sql = lockdownName ? code(readMigration(lockdownName)).toLowerCase() : "";

describe("email_accounts writes require a project admin", () => {
  it("has an admin floor on INSERT, UPDATE and DELETE that no later migration drops", () => {
    // Before this migration the strongest write rule was launch_field_* —
    // a field user could add an account with any address.
    for (const op of ["insert", "update", "delete"]) {
      const name = `email_accounts_admin_${op}`;
      const created = files.filter((f) =>
        code(readMigration(f)).toLowerCase().includes(`create policy ${name} on public.email_accounts`),
      );
      expect(created, `${name} is never created`).not.toHaveLength(0);
      const last = created[created.length - 1];
      const later = files.slice(files.indexOf(last) + 1);
      for (const f of later) {
        expect(code(readMigration(f)).toLowerCase()).not.toContain(`drop policy if exists ${name}`);
      }
    }
  });

  it("uses RESTRICTIVE policies so every permissive policy is capped, including drifted ones", () => {
    expect(lockdownName).toBeDefined();
    for (const op of ["insert", "update", "delete"]) {
      expect(sql).toMatch(
        new RegExp(`create policy email_accounts_admin_${op} on public\\.email_accounts\\s+as restrictive for ${op} to authenticated`),
      );
    }
    expect(sql).toContain("with check (public.user_has_project_role_at_least(project_id, 'admin'))");
    expect(sql).toContain("using (public.user_has_project_role_at_least(project_id, 'admin'))");
  });

  it("does not widen who can READ mail-account rows (DB-9 stays no worse)", () => {
    expect(sql).not.toMatch(/on public\.email_accounts\s+(as \w+\s+)?for (select|all)/);
  });
});

describe("server-verified senders and the send ledger are service-role only", () => {
  for (const table of ["email_verified_senders", "email_send_events"]) {
    it(`${table}: RLS on, no client grants, no client policies`, () => {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
      expect(sql).toMatch(new RegExp(`grant [a-z, ]+ on table public\\.${table} to service_role`));
      expect(sql).not.toMatch(new RegExp(`create policy \\w+ on public\\.${table}`));
      expect(sql).not.toMatch(new RegExp(`grant [a-z, ]+ on table public\\.${table} to [a-z_, ]*(anon|authenticated)`));
    });
  }

  it("binds a verification to one address platform-wide while it is active", () => {
    expect(sql).toMatch(
      /create unique index if not exists \w+\s+on public\.email_verified_senders \(lower\(email_address\)\)\s+where revoked_at is null/,
    );
  });
});

describe("email_send_reserve", () => {
  const fn = sql.slice(sql.indexOf("create or replace function public.email_send_reserve("));

  it("is executable by the service role only", () => {
    expect(sql).toContain(
      "revoke all on function public.email_send_reserve(uuid, uuid, text, text, integer, integer) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.email_send_reserve(uuid, uuid, text, text, integer, integer) to service_role",
    );
  });

  it("runs as the caller with a pinned search_path", () => {
    // INVOKER: if a grant ever slipped, an authenticated caller would still hit
    // RLS with zero policies on email_send_events.
    expect(fn).toMatch(/security invoker\s+set search_path = ''/);
    expect(fn).not.toContain("security definer");
  });

  it("serializes per user and reserves before the provider call can happen", () => {
    expect(fn).toContain("pg_advisory_xact_lock(");
    expect(fn).toContain("insert into public.email_send_events");
    // The count reads only the ledger, never member-writable email_messages.
    expect(fn).not.toContain("email_messages");
  });
});

describe("migration hygiene", () => {
  it("notes the placeholder version and stays replay-safe", () => {
    expect(lockdownName).toBeDefined();
    const raw = readMigration(lockdownName as string);
    expect(raw).toMatch(/PLACEHOLDER VERSION/);
    expect(sql).toContain("to_regprocedure('public.user_has_project_role_at_least(uuid,text)')");
    for (const op of ["insert", "update", "delete"]) {
      expect(sql).toContain(`drop policy if exists email_accounts_admin_${op} on public.email_accounts`);
    }
  });

  it("reloads the PostgREST schema cache last", () => {
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
