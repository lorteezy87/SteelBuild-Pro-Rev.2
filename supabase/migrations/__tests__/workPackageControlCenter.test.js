import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260905130000_work_package_control_center.sql"),
  "utf8",
);
const policySql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260805030000_drop_project_id_null_rls_escape_hatch.sql"),
  "utf8",
);

describe("work package control center migration", () => {
  it("enforces one live WP number per project and fails loudly on existing duplicates", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS work_packages_project_wp_number_live_uidx/);
    expect(sql).toMatch(/ON public\.work_packages \(project_id, lower\(btrim\(wp_number\)\)\)/);
    expect(sql).toMatch(/WHERE is_deleted = false\s+AND deleted_at IS NULL/);
    expect(sql).toMatch(/RAISE EXCEPTION 'work_packages has duplicate live WP numbers/);
  });

  it("makes the rollup pilot/live-only, phase-aware, and quiet at zero leaves", () => {
    expect(sql).toMatch(/v_mode NOT IN \('pilot', 'live'\)/);
    expect(sql).toMatch(/v_phase := 'Erection'/);
    expect(sql).toMatch(/v_phase := 'Delivery'/);
    expect(sql).toMatch(/v_phase := 'Fabrication'/);
    expect(sql).toMatch(/'reason', 'no_leaf_lots'/);
    // Never re-introduce the zero-leaf reset.
    expect(sql).not.toMatch(/SET percent_complete = 0,\s*status = 'Not Started'/);
    expect(sql).toMatch(/IF v_old_percent IS DISTINCT FROM v_percent\s+OR v_old_status IS DISTINCT FROM v_status\s+OR v_old_phase IS DISTINCT FROM v_phase THEN/);
  });

  it("revokes the rollup RPC from clients and keeps SECURITY DEFINER search_path pinned", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.refresh_work_package_progress\(uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.refresh_work_package_progress\(uuid\) TO service_role;/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.refresh_work_package_progress\(uuid\) TO authenticated/);
    const definers = sql.match(/LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = (public|'')/g) || [];
    expect(definers.length).toBe(4);
    expect((sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length).toBe(4);
  });

  it("stamps released_date on canonical release and batches the rollup", () => {
    expect(sql).toMatch(/SET "released_date" = coalesce\("released_date", current_date\)/);
    expect(sql).toMatch(/PERFORM "public"\."refresh_work_package_progress"\(p_work_package_id\);/);
    // Release, assign and unassign each suppress the per-row trigger rollup
    // around their loops and re-enable it afterwards.
    const suppress = sql.match(/set_config\('app\.skip_wp_progress_refresh', '1', true\)/g) || [];
    const restore = sql.match(/set_config\('app\.skip_wp_progress_refresh', '0', true\)/g) || [];
    expect(suppress.length).toBe(3);
    expect(restore.length).toBe(3);
    expect(sql).toMatch(/FOREACH v_wp IN ARRAY v_previous_wps LOOP\s+PERFORM public\.refresh_work_package_progress\(v_wp\);/);
  });

  it("keeps the assign/unassign role floor and container guard intact", () => {
    expect(sql.match(/user_has_project_role_at_least\(p_project_id, 'field'\)/g)?.length).toBe(2);
    expect(sql.match(/user_has_project_role_at_least"?\(v_work_package\.project_id, 'pm'\)/g)?.length).toBe(1);
    expect(sql.match(/cannot be (un)?assigned; (assign|use) active leaf lots instead/g)?.length).toBe(2);
  });
});

describe("stale project_member_access migration", () => {
  it("is DROP-only and never re-creates a membership-only FOR ALL policy", () => {
    // Comments explain the history; only executable SQL is checked.
    const code = policySql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(code).toMatch(/DROP POLICY IF EXISTS project_member_access/);
    expect(code).not.toMatch(/CREATE POLICY/i);
    expect(code).not.toMatch(/FOR ALL TO authenticated/);
    expect(code).toMatch(/to_regclass\('public\.' \|\| t\) IS NOT NULL/);
  });
});
