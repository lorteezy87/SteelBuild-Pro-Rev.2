import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * This migration is QUARANTINED. It lives outside supabase/migrations/ because
 * its create-only guard (enforce_expense_rpc_create) is weaker than production's
 * trg_a_enforce_expense_guards, and it drops every trigger on public.expenses on
 * the way in — so any runner that reached it would downgrade the live guards.
 *
 * The assertions below still describe what the file contains, and the last test
 * is the one that matters now: the file must not be back in the runner's path.
 */
const FILE = "20260913084700_expense_atomic_creation.sql";
const QUARANTINE = `supabase/migrations_quarantine/${FILE}`;

const sql = fs.readFileSync(path.resolve(process.cwd(), QUARANTINE), "utf8");

describe("expense atomic creation migration", () => {
  it("stays quarantined, out of every runner's glob", () => {
    // The Supabase CLI and the branching runner apply every <14-digit>_*.sql in
    // supabase/migrations/ and read neither this test nor the ownership
    // manifest. Moving the file back is therefore the whole regression.
    expect(fs.existsSync(path.resolve(process.cwd(), QUARANTINE))).toBe(true);
    expect(
      fs.existsSync(path.resolve(process.cwd(), `supabase/migrations/${FILE}`)),
      "this migration downgrades the live expense guards; it must not be in supabase/migrations/",
    ).toBe(false);
  });

  it("mints expense numbers transactionally and blocks direct inserts", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.create_expense(");
    expect(sql).toContain("ON CONFLICT (project_id, record_type)");
    expect(sql).toContain("RETURNING next_value - 1 INTO v_expense_number");
    expect(sql).toContain("BEFORE INSERT ON public.expenses");
    expect(sql).toContain("current_setting('app.expense_create_rpc', true)");
  });

  it("uses the deployed RPC signature and field-role authorization", () => {
    expect(sql).toContain("p_project_id uuid");
    expect(sql).toContain("p_payload jsonb");
    expect(sql).toContain(
      "public.user_has_project_role_at_least(p_project_id, 'field')",
    );
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.create_expense(uuid, jsonb)",
    );
  });
});
