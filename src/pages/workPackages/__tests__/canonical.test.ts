import { describe, expect, it } from "vitest";
import {
  derivePhaseFromPieces,
  describePieceCounts,
  indexReleasesByWorkPackage,
  isPieceDrivenPackage,
  summarizePiecesByWorkPackage,
} from "../canonical";

describe("summarizePiecesByWorkPackage", () => {
  it("counts leaf lots per package and skips containers, split parents and archived rows", () => {
    const counts = summarizePiecesByWorkPackage([
      { id: "p1", work_package_id: "wp1", lifecycle_status: "fabricated" },
      { id: "p2", work_package_id: "wp1", lifecycle_status: "released", on_hold: true },
      { id: "container", work_package_id: "wp1", is_container: true, lifecycle_status: "fabricated" },
      { id: "parent", work_package_id: "wp1", lifecycle_status: "not_started" },
      { id: "child", work_package_id: "wp1", parent_piece_id: "parent", lifecycle_status: "shipped" },
      { id: "gone", work_package_id: "wp1", lifecycle_status: "erected", is_deleted: true },
      { id: "unassigned", lifecycle_status: "erected" },
      { id: "q1", work_package_id: "wp2", lifecycle_status: "erected" },
    ]);
    expect(counts.get("wp1")).toEqual({
      leafCount: 3, onHold: 1, notStarted: 0, released: 1, inFabrication: 0,
      fabricated: 1, shipped: 1, delivered: 0, erected: 0,
    });
    expect(counts.get("wp2")?.erected).toBe(1);
    expect(counts.has("unassigned")).toBe(false);
  });
});

describe("derivePhaseFromPieces", () => {
  const base = { leafCount: 10, onHold: 0, notStarted: 0, released: 0, inFabrication: 0, fabricated: 0, shipped: 0, delivered: 0, erected: 0 };
  it("follows the furthest piece", () => {
    expect(derivePhaseFromPieces({ ...base, notStarted: 10 })).toBe("Detailing");
    expect(derivePhaseFromPieces({ ...base, notStarted: 9, released: 1 })).toBe("Fabrication");
    expect(derivePhaseFromPieces({ ...base, fabricated: 10 })).toBe("Fabrication");
    expect(derivePhaseFromPieces({ ...base, fabricated: 9, shipped: 1 })).toBe("Delivery");
    expect(derivePhaseFromPieces({ ...base, shipped: 9, delivered: 1 })).toBe("Erection");
    expect(derivePhaseFromPieces({ ...base, erected: 10 })).toBe("Erection");
    expect(derivePhaseFromPieces(null)).toBe("Detailing");
    expect(derivePhaseFromPieces({ ...base, leafCount: 0 })).toBe("Detailing");
  });
});

describe("indexReleasesByWorkPackage", () => {
  it("keeps the released row over a pending one and counts every live row", () => {
    const idx = indexReleasesByWorkPackage([
      { id: "r1", work_package_id: "wp1", status: "Pending", release_date: "2026-08-01" },
      { id: "r2", work_package_id: "wp1", status: "released", is_exception: true, weight_tons: "12.5", release_date: "2026-08-10", release_number: "PCR-1", canonical_release: true },
      { id: "r3", work_package_id: "wp1", status: "Released", is_deleted: true },
      { id: "r4", work_package_id: null, status: "Released" },
    ]);
    expect(idx.get("wp1")).toEqual({
      id: "r2", releaseNumber: "PCR-1", released: true, isException: true, canonical: true,
      weightTons: 12.5, releaseDate: "2026-08-10", count: 2,
    });
  });

  it("prefers the most recent of two released rows", () => {
    const idx = indexReleasesByWorkPackage([
      { id: "old", work_package_id: "wp1", status: "Released", release_date: "2026-07-01" },
      { id: "new", work_package_id: "wp1", status: "Released", released_at: "2026-08-02T10:00:00Z" },
    ]);
    expect(idx.get("wp1")?.id).toBe("new");
    expect(idx.get("wp1")?.releaseDate).toBe("2026-08-02");
  });
});

describe("piece-driven + captions", () => {
  const counts = { leafCount: 40, onHold: 2, notStarted: 10, released: 8, inFabrication: 10, fabricated: 6, shipped: 3, delivered: 2, erected: 1 };
  it("is piece-driven only in pilot/live with leaf lots", () => {
    expect(isPieceDrivenPackage("live", counts)).toBe(true);
    expect(isPieceDrivenPackage("pilot", counts)).toBe(true);
    expect(isPieceDrivenPackage("shadow", counts)).toBe(false);
    expect(isPieceDrivenPackage("off", counts)).toBe(false);
    expect(isPieceDrivenPackage("live", { ...counts, leafCount: 0 })).toBe(false);
    expect(isPieceDrivenPackage("live", null)).toBe(false);
  });

  it("describes counts for a card", () => {
    expect(describePieceCounts(counts)).toBe("12 of 40 fabricated · 10 in fab · 6 shipped · 1 erected · 2 on hold");
    expect(describePieceCounts(null)).toBe("No pieces assigned");
  });
});
