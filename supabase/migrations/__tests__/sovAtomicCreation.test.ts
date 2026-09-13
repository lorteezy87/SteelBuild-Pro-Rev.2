import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260913024800_sov_atomic_creation.sql",
  ),
  "utf8",
);

describe("SOV atomic creation migration", () => {
  it("mints numbers transactionally and blocks direct inserts", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.create_sov_item(p_item jsonb)");
    expect(sql).toContain("ON CONFLICT (project_id, record_type)");
    expect(sql).toContain("RETURNING next_value - 1 INTO v_line_number");
    expect(sql).toContain("BEFORE INSERT ON public.sov_items");
    expect(sql).toContain("current_setting('app.sov_item_create_rpc', true)");
  });

  it("keeps the RPC behind authenticated project-role checks", () => {
    expect(sql).toContain("public.user_has_project_role_at_least(v_project_id, 'pm')");
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.create_sov_item(jsonb) TO authenticated, service_role",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.create_sov_item(jsonb) FROM PUBLIC, anon",
    );
  });
});
