import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260819010000_portfolio_project_rollups.sql"),
  "utf8",
);

describe("portfolio_project_rollups migration", () => {
  it("creates an invoker SQL function with pinned search_path", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.portfolio_project_rollups\(\)/);
    expect(migration).toMatch(/LANGUAGE sql/);
    expect(migration).toMatch(/SECURITY INVOKER/);
    expect(migration).toMatch(/SET search_path TO 'public'/);
    expect(migration).not.toMatch(/SECURITY DEFINER/);
  });

  it("is execute-gated to authenticated and revoked from PUBLIC/anon", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.portfolio_project_rollups\(\) FROM PUBLIC, anon/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.portfolio_project_rollups\(\) TO authenticated/,
    );
  });

  it("scopes live projects through user_has_project_access and is_deleted", () => {
    expect(migration).toMatch(/public\.user_has_project_access\(p\.id\)/);
    expect(migration).toMatch(/COALESCE\(p\.is_deleted, false\) = false/);
  });

  it("reads typed cost columns, never the legacy budget/actual/committed names", () => {
    expect(migration).toMatch(/cc\.budget_amount/);
    expect(migration).toMatch(/cc\.actual_cost/);
    expect(migration).toMatch(/cc\.committed_cost/);
    expect(migration).toMatch(/cc\.forecast_to_complete/);
    expect(migration).not.toMatch(/SUM\(cc\.budget\)/);
    expect(migration).not.toMatch(/SUM\(cc\.actual\)/);
    expect(migration).not.toMatch(/SUM\(cc\.committed\)/);
  });

  it("keeps the three RFI open/overdue predicates the UI already uses", () => {
    expect(migration).toMatch(/NOT IN \('answered', 'closed', 'void'\)/);
    expect(migration).toMatch(/IN \('open', 'under review', 'incomplete response'\)/);
    expect(migration).toMatch(/r\.status NOT IN \('Answered', 'Closed'\)/);
    expect(migration).toMatch(/COALESCE\(r\.due_date, r\.date_required\)/);
    expect(migration).toMatch(/COALESCE\(r\.date_required, r\.due_date\)/);
  });

  it("counts leaf overdue schedule tasks and delayed statuses", () => {
    expect(migration).toMatch(/NOT COALESCE\(st\.is_summary, false\)/);
    expect(migration).toMatch(/child\.parent_task_id = st\.id/);
    expect(migration).toMatch(/st\.status IS DISTINCT FROM 'Complete'/);
    expect(migration).toMatch(/position\('delay' IN lower\(COALESCE\(st\.status, ''\)\)\) > 0/);
  });
});
