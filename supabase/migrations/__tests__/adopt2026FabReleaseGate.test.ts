import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260915120000_adopt_2026_fab_release_gate.sql",
  ),
  "utf8",
);

const quarantined = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations_quarantine/20260727232000_piece_drawing_sets.sql",
  ),
  "utf8",
);

describe("adopt 2026 fab-release gate", () => {
  it("re-declares piece_drawing_sets and its trigger/RLS/grants idempotently", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.piece_drawing_sets");
    expect(sql).toContain("CREATE OR REPLACE TRIGGER set_piece_drawing_sets_updated_at");
    expect(sql).toContain("ALTER TABLE public.piece_drawing_sets ENABLE ROW LEVEL SECURITY");
    // A plain CREATE POLICY errors if the policy already exists — this file
    // runs against production, where it already does.
    expect(sql).toContain("DROP POLICY IF EXISTS piece_drawing_set_read ON public.piece_drawing_sets");
  });

  it("carries the same piece_events_event_type_check values as the quarantined file", () => {
    const extractValues = (text: string) => {
      const match = text.match(/piece_events_event_type_check CHECK \(\s*event_type = ANY \(ARRAY\[([\s\S]*?)\]\)/);
      expect(match, "constraint block not found").toBeTruthy();
      return match![1].split(",").map((v) => v.trim()).filter(Boolean);
    };
    expect(extractValues(sql)).toEqual(extractValues(quarantined));
    expect(sql).toContain("'drawing_set_linked'::text");
    expect(sql).toContain("'attributes_updated'::text");
  });

  it("carries link_piece_drawing_set / unlink_piece_drawing_set byte-identical to the quarantined file's bodies", () => {
    for (const fn of ["link_piece_drawing_set", "unlink_piece_drawing_set"]) {
      const extractBody = (text: string) => {
        const re = new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\nEND;\\n\\$\\$;`,
        );
        const match = text.match(re);
        expect(match, `${fn} not found`).toBeTruthy();
        return match![0];
      };
      expect(extractBody(sql)).toBe(extractBody(quarantined));
    }
  });

  it("supersedes the quarantined evaluate_release_gate with the set-level evaluator", () => {
    // The old (quarantined) gate summed piece_control_drawing_is_approved
    // directly; the adopted gate delegates entirely to
    // work_package_drawing_set_reports / evaluate_fab_release_set instead.
    expect(sql).toContain("v_set_reports := public.work_package_drawing_set_reports(p_work_package_id);");
    expect(sql).not.toContain('"public"."piece_control_drawing_is_approved"(linked."drawing_id")');
  });

  it("gives evaluate_fab_release_set every blocker kind the old per-sheet check lacked", () => {
    for (const kind of ["no_sheets", "no_submittal", "not_ifc", "active_holds", "open_rfis", "superseded", "no_file"]) {
      expect(sql).toContain(`'kind', '${kind}'`);
    }
  });

  it("keeps evaluate_fab_release_set as SECURITY INVOKER with an explicit access check", () => {
    // Runs as the caller (RLS applies); the explicit check is defence in depth
    // since some of its reads go through SECURITY DEFINER helpers below it.
    const fnStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.evaluate_fab_release_set");
    const fnBody = sql.slice(fnStart, sql.indexOf("$function$;", fnStart));
    expect(fnBody).not.toMatch(/SECURITY DEFINER/);
    expect(fnBody).toContain("if not public.user_has_project_access(p_project_id) then raise exception");
  });

  it("keeps every SECURITY DEFINER function's search_path pinned", () => {
    const definerFns = [
      "work_package_drawing_set_reports",
      "piece_control_drawing_is_approved",
      "evaluate_release_gate",
      "fab_release_blocking_rfis",
    ];
    for (const fn of definerFns) {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const header = sql.slice(start, start + 400);
      expect(header, `${fn} missing SECURITY DEFINER`).toMatch(/SECURITY DEFINER/);
      expect(header, `${fn} missing a pinned search_path`).toMatch(/SET search_path TO '(public)?'/);
    }
  });

  it("revokes PUBLIC/anon on every new or replaced function", () => {
    const fns = [
      ["submittal_derived_stage(text, text, date)", false],
      ["fab_release_blocking_rfis(uuid[])", true],
      ["evaluate_fab_release_set(uuid, uuid)", false],
      ["work_package_drawing_set_reports(uuid)", false],
      ["piece_control_drawing_is_approved(uuid)", false],
      ["evaluate_release_gate(uuid)", false],
    ] as const;
    for (const [sig, alsoRevokesServiceRole] of fns) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon`);
      if (alsoRevokesServiceRole) {
        expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, service_role`);
      }
    }
  });

  it("grants evaluate_release_gate to authenticated, matching its direct client call site", () => {
    // src/lib/pieceControl/releaseRepository.ts calls this via db.rpc(...)
    // directly, so it must stay authenticated-callable (its own auth.uid()
    // check is what actually gates it).
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.evaluate_release_gate(uuid) TO authenticated, service_role;");
  });

  it("documents the inline-comment-stripping caveat instead of leaving an unexplained diff", () => {
    expect(sql).toContain("preserve `--` line comments written INSIDE a plpgsql function body");
  });
});
