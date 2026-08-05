import { describe, expect, it } from "vitest";
import {
  HORIZON_OPTIONS,
  UNASSIGNED_CREW,
  buildDayColumns,
  resolveBlocker,
  buildBlockerMaps,
  groupTasksByCrewAndDay,
  filterVisibleCrews,
  buildFieldPlanIcsFilename,
  commandBarSubtitle,
} from "../fieldPlanHelpers";

describe("fieldPlanHelpers", () => {
  it("exposes horizon options and unassigned key", () => {
    expect(HORIZON_OPTIONS.map((h) => h.days)).toEqual([7, 14, 21]);
    expect(UNASSIGNED_CREW).toBe("__unassigned");
  });

  it("builds day columns for horizon", () => {
    const base = new Date(2026, 5, 1); // Mon Jun 1 2026 local
    const days = buildDayColumns(3, base);
    expect(days).toHaveLength(3);
    expect(days[0].iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(days[0].label.length).toBeGreaterThan(0);
  });

  it("resolves rfi/submittal/delivery blockers", () => {
    const maps = buildBlockerMaps(
      [{ id: "r1", rfi_number: "RFI-1", title: "Hold", status: "Open" }],
      [{ id: "s1", submittal_number: "S-1", title: "Shop", status: "Submitted" }],
      [{ id: "d1", po_number: "PO-1", vendor: "Acme", status: "In Transit" }],
    );
    const rfi = resolveBlocker({ id: "r1", type: "rfi" }, maps);
    expect(rfi?.type).toBe("RFI");
    expect(rfi?.severity).toBe("danger");
    expect(rfi?.resolved).toBe(false);

    const sub = resolveBlocker({ id: "s1", type: "submittal" }, maps);
    expect(sub?.type).toBe("SUB");
    expect(sub?.severity).toBe("warn");

    const del = resolveBlocker({ id: "d1", type: "delivery" }, maps);
    expect(del?.type).toBe("DEL");
    expect(del?.resolved).toBe(false);

    expect(resolveBlocker(null, maps)).toBeNull();
    expect(resolveBlocker({ id: "x", type: "rfi" }, maps)).toBeNull();
  });

  it("groups tasks by crew and day with stats", () => {
    const base = new Date(2026, 5, 1);
    const days = buildDayColumns(3, base);
    const maps = buildBlockerMaps(
      [{ id: "r1", rfi_number: "RFI-1", title: "Hold", status: "Open" }],
      [],
      [],
    );
    const resolve = (b: any) => resolveBlocker(b, maps);

    const { crews, cellMap, stats } = groupTasksByCrewAndDay(
      [
        {
          id: "t1",
          crew_id: "c1",
          crew_name: "Ironworkers",
          start_date: days[0].iso,
          end_date: days[1].iso,
          status: "In Progress",
          blockers: [{ id: "r1", type: "rfi" }],
        },
        {
          id: "t2",
          crew_id: null,
          crew_name: null,
          start_date: days[0].iso,
          end_date: days[0].iso,
          status: "Complete",
          blockers: [],
        },
      ],
      days,
      resolve,
    );

    expect(stats.total).toBe(2);
    expect(stats.blocked).toBe(1);
    expect(stats.completed).toBe(1);
    expect(crews.map((c) => c.key)).toContain("c1");
    expect(crews[crews.length - 1].key).toBe(UNASSIGNED_CREW);
    expect(cellMap.get(`c1|${days[0].iso}`)).toHaveLength(1);
    expect(cellMap.get(`c1|${days[0].iso}`)?.[0]._isBlocked).toBe(true);
  });

  it("filters crews with only-blocked", () => {
    const days = [{ iso: "2026-06-01" }, { iso: "2026-06-02" }] as any;
    const cellMap = new Map([
      ["c1|2026-06-01", [{ _isBlocked: true } as any]],
      ["c2|2026-06-01", [{ _isBlocked: false } as any]],
    ]);
    const crews = [
      { key: "c1", name: "A" },
      { key: "c2", name: "B" },
    ];
    expect(filterVisibleCrews(crews, days, cellMap, false)).toHaveLength(2);
    expect(filterVisibleCrews(crews, days, cellMap, true).map((c) => c.key)).toEqual(["c1"]);
  });

  it("builds ics filename and command bar subtitle", () => {
    expect(buildFieldPlanIcsFilename("P-1", "id", 14)).toBe("field-plan-P-1-14d.ics");
    expect(buildFieldPlanIcsFilename(null, "id", 7)).toBe("field-plan-id-7d.ics");
    expect(commandBarSubtitle({ blocked: 2, dueThisWeek: 5, completed: 1 })).toContain("blocked");
    expect(commandBarSubtitle({ blocked: 0, dueThisWeek: 5, completed: 1 })).toContain("no blockers");
  });
});
