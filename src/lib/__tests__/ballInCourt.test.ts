import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BALL_IN_COURT_OPTIONS,
  BALL_IN_COURT_PARTIES,
  isValidBallInCourt,
  normalizeBallInCourt,
} from "../ballInCourt";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260920014500_ball_in_court_vocabulary.sql",
);

describe("ball_in_court vocabulary", () => {
  it("holds every party production actually stores", () => {
    // Counts as of 2026-09-20 across rfis + submittals.
    for (const stored of ["Contractor", "EOR", "Detailer", "GC", "Architect", "Subcontractor"]) {
      expect(BALL_IN_COURT_PARTIES).toContain(stored);
    }
  });

  // "Engineer" was offered by RFIFormModal alone, stored by nothing, and not in
  // APPROVER_CLASS_BIC -- so an RFI parked on it was invisible to the
  // approver-class logic. It is a synonym for EOR.
  it("does not offer Engineer, which is a synonym for EOR", () => {
    expect(BALL_IN_COURT_PARTIES).not.toContain("Engineer");
    expect(BALL_IN_COURT_PARTIES).toContain("EOR");
  });

  // Zero rows, but submittalReviewEngine and submittalStageMapping both treat
  // it as an approver -- excluding it would break a path that already exists.
  it("keeps AOR, which code classifies even though no row stores it", () => {
    expect(BALL_IN_COURT_PARTIES).toContain("AOR");
  });

  it("rejects a status masquerading as a party", () => {
    expect(isValidBallInCourt("Closed")).toBe(false);
    expect(isValidBallInCourt("Open")).toBe(false);
  });

  // NULL is legal and load-bearing: nobody holds the ball on a closed record.
  // It is not the same as "open but unassigned".
  it("treats null and undefined as valid — nobody holds it", () => {
    expect(isValidBallInCourt(null)).toBe(true);
    expect(isValidBallInCourt(undefined)).toBe(true);
  });

  // A <select> placeholder stores "", which the CHECK would reject. Same class
  // of bug as the project-date union that rejected null.
  it("normalises an empty select back to null rather than storing ''", () => {
    expect(normalizeBallInCourt("")).toBeNull();
    expect(normalizeBallInCourt("   ")).toBeNull();
    expect(normalizeBallInCourt("Closed")).toBeNull();
    expect(normalizeBallInCourt("EOR")).toBe("EOR");
  });

  it("offers an explicit nobody option ahead of the parties", () => {
    expect(BALL_IN_COURT_OPTIONS[0].value).toBe("");
    expect(BALL_IN_COURT_OPTIONS).toHaveLength(BALL_IN_COURT_PARTIES.length + 1);
  });
});

describe("the migration and the TS list agree", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  // The whole point of the file. If these drift, an INSERT the UI allows will
  // fail at the constraint with a raw Postgres error and the user loses the save.
  it("constrains both tables to exactly the TS vocabulary", () => {
    for (const table of ["rfis", "submittals"]) {
      const match = sql.match(
        new RegExp(`chk_${table}_ball_in_court[\\s\\S]*?array\\[([^\\]]+)\\]`, "i"),
      );
      expect(match, `no array literal found for chk_${table}_ball_in_court`).toBeTruthy();
      const parties = (match?.[1] ?? "")
        .split(",")
        .map((s) => s.trim().replace(/^'|'$/g, ""))
        .filter(Boolean);
      expect(parties.sort()).toEqual([...BALL_IN_COURT_PARTIES].sort());
    }
  });

  it("permits NULL on both constraints", () => {
    expect(sql).toMatch(/rfis[\s\S]*?ball_in_court is null/i);
    expect(sql).toMatch(/submittals[\s\S]*?ball_in_court is null/i);
  });

  // Nulling a row whose status is still open would hide a live ball.
  it("only retires the Closed sentinel on terminal rows", () => {
    expect(sql).toMatch(/update public\.rfis[\s\S]*?status in \('Closed', 'Void'\)/);
    expect(sql).toMatch(/update public\.submittals[\s\S]*?status in \([^)]*'Released for Fabrication'/);
  });

  it("adds the case-folded guard on number_sequences", () => {
    expect(sql).toMatch(/unique index if not exists uq_number_sequences_project_record_ci/i);
    expect(sql).toMatch(/upper\(record_type\)/i);
  });

  // Repo conventions: guarded with to_regclass, ends with the PostgREST reload.
  it("follows the repo migration conventions", () => {
    expect(sql).toMatch(/to_regclass\('public\.rfis'\)/);
    expect(sql).toMatch(/to_regclass\('public\.submittals'\)/);
    expect(sql).toMatch(/raise notice/i);
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});

describe("the RFI modals no longer disagree", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("both take their options from the shared list", () => {
    for (const file of [
      "src/components/rfis/RFIFormModal.jsx",
      "src/components/rfis/RfiBulkEditModal.jsx",
    ]) {
      const src = read(file);
      expect(src).toContain("BALL_IN_COURT_PARTIES");
      expect(src, `${file} still hard-codes a party list`).not.toMatch(
        /\[\s*"Contractor",\s*"(GC|EOR)"/,
      );
    }
  });

  // Checked against code only: the file explains in a comment why "Engineer"
  // was removed, and that prose must not fail the guard it documents.
  it("neither offers Engineer as a choice any more", () => {
    const withoutComments = read("src/components/rfis/RFIFormModal.jsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(withoutComments).not.toContain("Engineer");
  });
});
