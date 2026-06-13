import { describe, it, expect } from "vitest";
import {
  detectHeaderMap,
  normalizeStage,
  parseDateOrNull,
  resolveProduction,
  parseProductionCsv,
  PRODUCTION_STAGES,
  STAGE_PERCENT,
} from "../importProductionStatus";

describe("detectHeaderMap", () => {
  it("finds the piece-mark column via aliases", () => {
    const map = detectHeaderMap(["Main Part Mark", "Status", "Ship Date"]);
    expect(map.piece_mark).toBe(0);
    expect(map.status).toBe(1);
    expect(map.ship_date).toBe(2);
  });

  it("returns null when there is no piece-mark column", () => {
    expect(detectHeaderMap(["Status", "Weight", "Area"])).toBeNull();
  });
});

describe("normalizeStage", () => {
  it("maps exact EPM/FabSuite status terms to canonical stages", () => {
    expect(normalizeStage("Shipped")).toBe("Shipped");
    expect(normalizeStage("galvanized")).toBe("Paint");
    expect(normalizeStage("Shotblast")).toBe("Clean");
    expect(normalizeStage("CNC")).toBe("Cut");
    expect(normalizeStage("Released")).toBe("Not Started");
  });

  it("falls back to a contains-match (e.g. 'Weld Complete')", () => {
    expect(normalizeStage("Weld Complete")).toBe("Weld");
    expect(normalizeStage("In Paint")).toBe("Paint");
  });

  it("returns null for an unrecognized status", () => {
    expect(normalizeStage("Quux")).toBeNull();
    expect(normalizeStage("")).toBeNull();
  });
});

describe("parseDateOrNull", () => {
  it("accepts ISO and US dates, 2-digit years, and rejects junk", () => {
    expect(parseDateOrNull("2026-06-12")).toBe("2026-06-12");
    expect(parseDateOrNull("6/12/2026")).toBe("2026-06-12");
    expect(parseDateOrNull("6/9/26")).toBe("2026-06-09");
    expect(parseDateOrNull("soon")).toBeNull();
    expect(parseDateOrNull("")).toBeNull();
  });
});

describe("resolveProduction", () => {
  it("prefers an explicit status column", () => {
    const r = resolveProduction({ status: "Welded" });
    expect(r.status).toBe("Weld");
    expect(r.percent_complete).toBe(STAGE_PERCENT.Weld);
  });

  it("resolves the furthest completed station when no status column", () => {
    const r = resolveProduction({ fit_date: "6/1/2026", weld_date: "6/5/2026" });
    expect(r.status).toBe("Weld"); // weld is further than fit
    expect(r.stage_data).toMatchObject({ fit_date: "2026-06-01", weld_date: "2026-06-05" });
  });

  it("carries the ship date and marks Shipped from a ship-date station", () => {
    const r = resolveProduction({ ship_date: "6/10/2026" });
    expect(r.status).toBe("Shipped");
    expect(r.percent_complete).toBe(100);
    expect(r.ship_date).toBe("2026-06-10");
  });

  it("derives a stage from percent when nothing else is present", () => {
    expect(resolveProduction({ percent_complete: "0" }).status).toBe("Not Started");
    expect(resolveProduction({ percent_complete: "55" }).status).toBe("Weld");
    expect(resolveProduction({ percent_complete: "100" }).status).toBe("Shipped");
  });

  it("uses an explicit percent over the stage's canonical percent", () => {
    const r = resolveProduction({ status: "Cut", percent_complete: "27%" });
    expect(r.status).toBe("Cut");
    expect(r.percent_complete).toBe(27); // explicit wins, clamped/parsed
  });

  it("returns nulls when the row carries no production signal", () => {
    const r = resolveProduction({});
    expect(r.status).toBeNull();
    expect(r.percent_complete).toBeNull();
    expect(r.stage_data).toBeNull();
  });
});

describe("parseProductionCsv", () => {
  it("stages create vs update against existing pieces and skips bad rows", () => {
    const csv = [
      "Piece Mark,Status,Qty,Ship Date",
      "B-101,Welded,2,",
      "B-102,Shipped,1,6/10/2026",
      ",Cut,1,", // missing mark -> skipped
      "B-101,Fit,1,", // duplicate in file -> skipped
    ].join("\n");

    const result = parseProductionCsv(csv, {
      existing: [{ id: "e1", piece_mark: "B-102", is_deleted: false }],
    });

    expect(result.ok).toBe(true);
    expect(result.stats).toMatchObject({ create: 1, update: 1, skipped: 2 });

    const b101 = result.rows.find((r) => r.piece_mark === "B-101");
    expect(b101).toMatchObject({ action: "create", status: "Weld", quantity: 2 });

    const b102 = result.rows.find((r) => r.piece_mark === "B-102");
    expect(b102).toMatchObject({ action: "update", existing_id: "e1", status: "Shipped", ship_date: "2026-06-10" });

    const reasons = result.skipped.map((s) => s.reason);
    expect(reasons.some((r) => /Missing piece mark/.test(r))).toBe(true);
    expect(reasons.some((r) => /Duplicate piece mark/.test(r))).toBe(true);
  });

  it("errors clearly when no piece-mark column is present", () => {
    const result = parseProductionCsv("Status,Qty\nWelded,2");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/piece-mark/i);
  });

  it("errors on an empty file", () => {
    expect(parseProductionCsv("").ok).toBe(false);
  });
});

describe("stage tables", () => {
  it("percent map covers every stage in order", () => {
    for (const stage of PRODUCTION_STAGES) {
      expect(STAGE_PERCENT[stage]).toBeTypeOf("number");
    }
    expect(STAGE_PERCENT["Not Started"]).toBe(0);
    expect(STAGE_PERCENT.Shipped).toBe(100);
  });
});
