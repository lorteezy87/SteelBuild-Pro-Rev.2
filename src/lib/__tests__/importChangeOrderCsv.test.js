import { describe, it, expect } from "vitest";
import { parseChangeOrderCsv, CO_STATUSES, normalizeStatus } from "../importChangeOrderCsv";

/**
 * `change_orders` carries
 *   CHECK (status IN ('Draft','Submitted','Under Review','Approved','Rejected','Void'))
 * (baseline_schema.sql). Any status the importer emits outside that set makes
 * the INSERT fail with a check violation. "Closed" is extremely common in GC
 * and owner CO logs, so this is the difference between an import working and
 * aborting halfway through.
 */
describe("CO_STATUSES matches the DB CHECK constraint", () => {
  it("is exactly the constraint's vocabulary", () => {
    expect([...CO_STATUSES].sort()).toEqual(
      ["Approved", "Draft", "Rejected", "Submitted", "Under Review", "Void"].sort(),
    );
  });
});

describe("normalizeStatus never emits a status the DB would reject", () => {
  const cases = [
    "draft", "Submitted", "sent", "issued",
    "under review", "in review", "reviewing", "pending",
    "approved", "executed", "accepted",
    "rejected", "denied", "declined",
    "void", "cancelled", "canceled", "withdrawn",
    // Ambiguous / unknown — must not become an invalid value.
    "closed", "closed out", "complete", "completed",
    "Partially Executed", "¯\\_(ツ)_/¯", "42",
  ];

  for (const raw of cases) {
    it(`"${raw}" maps to a valid status or null`, () => {
      const s = normalizeStatus(raw);
      if (s !== null) expect(CO_STATUSES.has(s)).toBe(true);
    });
  }

  it("maps the obvious synonyms", () => {
    expect(normalizeStatus("executed")).toBe("Approved");
    expect(normalizeStatus("withdrawn")).toBe("Void");
    expect(normalizeStatus("in review")).toBe("Under Review");
  });

  it("does NOT elevate an ambiguous 'Closed' to Approved", () => {
    // A closed CO may have been approved, rejected, or withdrawn. Guessing
    // Approved inflates the revised contract value.
    expect(normalizeStatus("closed")).not.toBe("Approved");
    expect(normalizeStatus("closed")).toBeNull();
  });

  it("returns null for blank input", () => {
    expect(normalizeStatus("")).toBeNull();
    expect(normalizeStatus(null)).toBeNull();
    expect(normalizeStatus(undefined)).toBeNull();
  });
});

describe("parseChangeOrderCsv", () => {
  const header = "CO Number,Description,Status,Amount\n";

  it("falls back to Draft for an unmappable status rather than emitting it", () => {
    const { cos } = parseChangeOrderCsv(`${header}14,Extra beams,Closed,1500`);
    expect(cos).toHaveLength(1);
    expect(cos[0].status).toBe("Draft");
    expect(CO_STATUSES.has(cos[0].status)).toBe(true);
  });

  it("warns the reviewer about statuses it could not map", () => {
    const { warnings } = parseChangeOrderCsv(
      `${header}14,Extra beams,Closed,1500\n15,Deck change,Partially Executed,900`,
    );
    const joined = warnings.join(" ");
    expect(joined).toMatch(/Closed/);
    expect(joined).toMatch(/Partially Executed/);
    expect(joined).toMatch(/Draft/i);
  });

  it("does not warn when every status maps cleanly", () => {
    const { warnings, cos } = parseChangeOrderCsv(
      `${header}14,Extra beams,Executed,1500\n15,Deck,Rejected,900`,
    );
    expect(cos.map((c) => c.status)).toEqual(["Approved", "Rejected"]);
    expect(warnings.join(" ")).not.toMatch(/could not be matched/i);
  });

  it("emits only DB-valid statuses across a messy real-world log", () => {
    const csv =
      `${header}` +
      ["1,A,Approved,100", "2,B,Closed,200", "3,C,,300", "4,D,pending,400", "5,E,zzz,500"].join("\n");
    const { cos } = parseChangeOrderCsv(csv);
    expect(cos).toHaveLength(5);
    for (const co of cos) expect(CO_STATUSES.has(co.status)).toBe(true);
  });
});
