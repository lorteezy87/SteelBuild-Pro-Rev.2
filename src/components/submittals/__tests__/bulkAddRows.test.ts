import { describe, expect, it } from "vitest";
import { BALL_IN_COURT_PARTIES, isValidBallInCourt } from "@/lib/ballInCourt";
import {
  buildBulkAddRows,
  clampToEnum,
  STATUSES,
  SUBMITTAL_TYPES,
  type ParsedBulkAddRow,
} from "../bulkAddRows";

/**
 * SubmittalBulkAddModal had no test at all, and `ball_in_court` went unclamped
 * here through two separate fixes of the surrounding code. The value of these
 * cases is less the clamp itself than the ORDERING it depends on: written
 * `{ ball_in_court: "Contractor", ...row }` the raw CSV cell wins and reaches
 * the database, which is precisely how it was broken.
 */

const row = (over: ParsedBulkAddRow = {}): ParsedBulkAddRow => ({
  submittal_number: "S-001",
  title: "Anchor bolt setting plan",
  ...over,
});

describe("buildBulkAddRows — ball_in_court", () => {
  it("keeps the Contractor default when the CSV had no such column", () => {
    // parseCsv only assigns a field when its cell held something, so "no
    // Reviewer column" and "empty Reviewer cell" both arrive as an absent key.
    const [out] = buildBulkAddRows([row()]);
    expect(out.ball_in_court).toBe("Contractor");
  });

  it("takes a recognised party as given", () => {
    const [out] = buildBulkAddRows([row({ ball_in_court: "GC" })]);
    expect(out.ball_in_court).toBe("GC");
  });

  it.each([
    "Jane Smith, Turner Construction",
    "Some Firm LLC",
    "S&H",
    "Closed",
    "",
    "   ",
  ])("stores null rather than guessing a party for %j", (value) => {
    // null is legal on this column and is the honest reading: the party is
    // unknown. Defaulting to Contractor here would assert an owner the
    // spreadsheet never named.
    const [out] = buildBulkAddRows([row({ ball_in_court: value })]);
    expect(out.ball_in_court).toBeNull();
  });

  it("never emits a value chk_submittals_ball_in_court would reject", () => {
    const rows: ParsedBulkAddRow[] = [
      row(),
      row({ ball_in_court: "Detailer" }),
      row({ ball_in_court: "a person" }),
      ...BALL_IN_COURT_PARTIES.map((p) => row({ ball_in_court: p })),
    ];
    for (const out of buildBulkAddRows(rows)) {
      expect(isValidBallInCourt(out.ball_in_court), `${out.ball_in_court} is not storable`).toBe(true);
    }
  });

  it("does not let the raw row overwrite the clamped party", () => {
    // THE regression. If the spread were applied after the assignment, this
    // row would carry "Jane Smith" straight through to PostgREST.
    const [out] = buildBulkAddRows([row({ ball_in_court: "Jane Smith" })]);
    expect(out.ball_in_court).not.toBe("Jane Smith");
    expect(Object.keys(out).filter((k) => k === "ball_in_court")).toHaveLength(1);
  });
});

describe("buildBulkAddRows — the other constrained columns", () => {
  it("clamps status case- and punctuation-insensitively", () => {
    const [out] = buildBulkAddRows([row({ status: "under-review" })]);
    expect(out.status).toBe("Under Review");
  });

  it("falls back to Draft when status is absent or unrecognised", () => {
    expect(buildBulkAddRows([row()])[0].status).toBe("Draft");
    expect(buildBulkAddRows([row({ status: "whatever" })])[0].status).toBe("Draft");
  });

  it("omits submittal_type entirely rather than sending an empty string", () => {
    // The column is nullable but its CHECK rejects "", so the key has to go.
    const [out] = buildBulkAddRows([row({ submittal_type: "not a type" })]);
    expect("submittal_type" in out).toBe(false);
  });

  it("clamps a recognised submittal_type", () => {
    const [out] = buildBulkAddRows([row({ submittal_type: "shop drawing" })]);
    expect(out.submittal_type).toBe("Shop Drawing");
  });

  it("backfills each NOT NULL from the other", () => {
    expect(buildBulkAddRows([{ title: "Only a title" }])[0].submittal_number).toBe("Only a title");
    expect(buildBulkAddRows([{ submittal_number: "S-009" }])[0].title).toBe("S-009");
  });

  it("carries the unconstrained columns through untouched", () => {
    const [out] = buildBulkAddRows([
      row({ discipline: "Structural", spec_section: "05 12 00", notes: "rush" }),
    ]);
    expect(out.discipline).toBe("Structural");
    expect(out.spec_section).toBe("05 12 00");
    expect(out.notes).toBe("rush");
  });
});

describe("clampToEnum", () => {
  it("returns null for anything outside the vocabulary", () => {
    expect(clampToEnum("nonsense", STATUSES)).toBeNull();
    expect(clampToEnum(null, STATUSES)).toBeNull();
    expect(clampToEnum(undefined, SUBMITTAL_TYPES)).toBeNull();
    expect(clampToEnum("  ", SUBMITTAL_TYPES)).toBeNull();
  });

  it("round-trips every canonical value", () => {
    for (const s of STATUSES) expect(clampToEnum(s, STATUSES)).toBe(s);
    for (const t of SUBMITTAL_TYPES) expect(clampToEnum(t, SUBMITTAL_TYPES)).toBe(t);
  });
});
