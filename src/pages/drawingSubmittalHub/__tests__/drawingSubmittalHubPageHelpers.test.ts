import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/drawingHealthScore", () => ({
  calculateDrawingHealthScore: (pkg: { key: string }) => ({ score: 1, key: pkg.key }),
}));
vi.mock("@/lib/detailingReadiness", () => ({
  computeDetailingReadiness: (args: { pkg: unknown }) => ({
    ok: true,
    scheduleRisk: { atRisk: false },
    pkg: args.pkg,
  }),
}));
vi.mock("@/services/modelElementStatus", () => ({
  summarizeElementStatuses: (
    elements: unknown[],
    readinessBySetId: Map<string, unknown>,
    sheetMap: Map<string, string>,
  ) => ({
    elementCount: elements.length,
    readinessKeys: [...readinessBySetId.keys()],
    sheetLinks: sheetMap.size,
  }),
}));
vi.mock("@/lib/entityPredicates", () => ({
  isRfiOpen: (r: { status?: string }) => r.status !== "Closed",
}));
vi.mock("@/lib/detailingRevisionImpact", () => ({
  computeRevisionImpact: ({ revisions, drawingsById }: any) => ({
    count: revisions.length,
    drawings: drawingsById.size,
  }),
}));

import {
  buildHealthByKey,
  buildActiveWpById,
  buildOpenRfiIds,
  pickConstrainingWorkPackage,
  buildReadinessByKey,
  buildModelMappingSummary,
  buildDrawingsById,
  buildRevisionImpactFromDrawings,
  findDrawingById,
  buildHubTabCounts,
} from "../drawingSubmittalHubPageHelpers";

describe("drawingSubmittalHubPageHelpers", () => {
  it("builds health map per package", () => {
    const m = buildHealthByKey([{ key: "a" }, { key: "b" }], [], []);
    expect(m.get("a")).toEqual({ score: 1, key: "a" });
    expect(m.size).toBe(2);
  });

  it("maps active WPs and open RFIs", () => {
    const wps = buildActiveWpById([
      { id: "w1", name: "A" },
      { id: "w2", is_deleted: true },
      { id: null as any },
    ]);
    expect([...wps.keys()]).toEqual(["w1"]);

    const open = buildOpenRfiIds([
      { id: "r1", status: "Open" },
      { id: "r2", status: "Closed" },
      { id: "r3", status: "Open", is_deleted: true },
    ]);
    expect([...open]).toEqual(["r1"]);
  });

  it("picks earliest constraining WP and builds readiness", () => {
    const wpById = new Map([
      ["w1", { scheduled_start_date: "2026-07-01" }],
      ["w2", { scheduled_start_date: "2026-06-01" }],
    ]);
    expect(pickConstrainingWorkPackage(["w1", "w2"], wpById)?.scheduled_start_date).toBe("2026-06-01");

    const readiness = buildReadinessByKey(
      [
        {
          key: "p1",
          parent: { linked_work_package_ids: ["w1", "w2"] },
          sheets: [],
          submittals: [],
        },
      ],
      wpById,
      new Set(["r1"]),
      { id: "proj" },
    );
    expect(readiness.get("p1")?.ok).toBe(true);
  });

  it("builds model mapping, drawings map, revision impact, find, tab counts", () => {
    const readinessByKey = new Map([
      ["pkg", { scheduleRisk: { atRisk: true }, score: 2 }],
    ]);
    const summary = buildModelMappingSummary(
      [{ id: "e1" }],
      [
        {
          key: "pkg",
          setId: "set-1",
          sheets: [{ id: "d1" }, { id: null }],
        },
      ],
      readinessByKey as any,
    );
    const s = summary as any;
    expect(s.elementCount).toBe(1);
    expect(s.sheetLinks).toBe(1);
    expect(s.readinessKeys).toContain("set-1");
    expect(s.readinessKeys).toContain("pkg");

    expect(buildDrawingsById([{ id: "d1" }, { id: "d2" }]).size).toBe(2);
    expect(buildRevisionImpactFromDrawings([{ id: "d1" }], [{ id: "rev" }])).toEqual({
      count: 1,
      drawings: 1,
    });
    expect(findDrawingById([{ id: "d1" }, { id: "d2" }], "d2")?.id).toBe("d2");
    expect(findDrawingById([{ id: "d1" }], null)).toBeNull();

    expect(
      buildHubTabCounts({
        openItemsLength: 3,
        unlinkedSubmittalItemsLength: 2,
        setPackagesLength: 5,
        totalSets: 9,
        submittalsTotal: 4,
        drawingSets: [{}, { is_deleted: true }, {}],
      }),
    ).toEqual({
      overview: 3,
      process: 7,
      drawings: 9,
      submittals: 4,
      matrix: 2,
    });
  });
});
