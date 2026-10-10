import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20261008013546_align_drawing_set_governing_submittal.sql"),
  "utf8",
);

const mapping = sql.slice(sql.indexOf("select s.id, s.submittal_number"), sql.indexOf("as stage into v_sub"));

function candidateApprovalStage(status: string, ballInCourt: string | null): string | null {
  const branch = mapping.match(/when s\.status in \('Approved', 'Approved as Noted'\) then case([\s\S]*?)\n      end/)?.[1];
  if (!branch || !["Approved", "Approved as Noted"].includes(status)) return null;
  for (const [, choices, stage] of branch.matchAll(/when s\.ball_in_court in \(([^)]+)\) then '([^']+)'/g)) {
    if ([...choices.matchAll(/'([^']+)'/g)].some((match) => match[1] === ballInCourt)) return stage;
  }
  return branch.match(/else '([^']+)'/)?.[1] ?? null;
}

describe("drawing-set governing submittal gate candidate", () => {
  it("uses the same approval-order rule as the client and keeps a draft behind a submitted round", () => {
    expect(sql).toMatch(/order by\s+s\.submitted_date desc nulls last,\s+s\.updated_at desc nulls last,\s+coalesce\(s\.round_number, 1\) desc,\s+s\.created_at desc nulls last,\s+s\.id desc/);
    expect(sql).toContain("s.is_deleted = false");
    expect(sql).toContain("s.deleted_at is null");
    expect(sql).toContain("s.status in ('Draft', 'Submitted', 'Under Review', 'Approved', 'Approved as Noted', 'Revise and Resubmit', 'Rejected', 'Released for Fabrication')");
  });

  it("maps approved and returned states like the client without an optimistic unknown/Closed fallback", () => {
    expect(mapping).toContain("when s.status in ('Approved', 'Approved as Noted') then case");
    expect(mapping).toContain("when s.ball_in_court in ('EOR', 'Architect', 'AOR') then 'BFA'");
    expect(mapping).toContain("when s.ball_in_court in ('Detailer', 'Contractor', 'Subcontractor') then 'OFS'");
    expect(mapping).toContain("when s.ball_in_court in ('GC', 'Owner') then 'IFC'");
    expect(mapping).toContain("else 'BFA'");
    expect(mapping).toContain("when s.status in ('Revise and Resubmit', 'Rejected') then 'R&R'");
    expect(sql).not.toContain("public.submittal_derived_stage(s.status");
    expect(mapping).not.toContain("'Closed'");
    expect(mapping).not.toContain("s.approved_date");
  });

  it.each([
    ["Approved", null, "BFA"],
    ["Approved", "Closed", "BFA"],
    ["Approved as Noted", null, "BFA"],
    ["Approved as Noted", "GC", "IFC"],
    ["Approved", "Detailer", "OFS"],
    ["Approved as Noted", "Detailer", "OFS"],
  ] as const)("derives %s / %s as %s", (status, ballInCourt, expected) => {
    expect(candidateApprovalStage(status, ballInCourt)).toBe(expected);
  });

  it("parks returned R&R and Rejected statuses at R&R", () => {
    expect(mapping).toContain("when s.status in ('Revise and Resubmit', 'Rejected') then 'R&R'");
  });

  it("replaces only the set evaluator and leaves the shared stage helper untouched", () => {
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.submittal_derived_stage");
  });

  it("preserves project authorization, every blocker, and restricted execution", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.evaluate_fab_release_set");
    expect(sql).toContain("if coalesce(auth.role(), '') <> 'service_role' and not public.user_has_project_access(p_project_id) then");
    expect(sql).toContain("v_set public.drawing_sets%rowtype");
    for (const blocker of ["no_sheets", "no_submittal", "not_ifc", "active_holds", "open_rfis", "superseded", "no_file"]) {
      expect(sql).toContain(`'kind', '${blocker}'`);
    }
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.evaluate_fab_release_set(uuid, uuid) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.evaluate_fab_release_set(uuid, uuid) TO authenticated, service_role;");
    expect(sql).not.toMatch(/SECURITY DEFINER/);
  });
});
