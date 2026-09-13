import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260913084700_expense_atomic_creation.sql",
  ),
  "utf8",
);

describe("expense atomic creation migration", () => {
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
