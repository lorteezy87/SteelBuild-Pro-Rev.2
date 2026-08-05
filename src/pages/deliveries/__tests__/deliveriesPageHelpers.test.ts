import { describe, expect, it } from "vitest";
import {
  buildIdNameMap,
  buildWpLabelMap,
  filterActiveDeliveries,
  filterDeliveries,
  groupDeliveriesByLane,
  nextSelectedIdsToggle,
} from "../deliveriesPageHelpers";

describe("deliveriesPageHelpers", () => {
  it("builds maps and filters deleted", () => {
    expect(buildIdNameMap([{ id: "1", name: "A" }])).toEqual({ "1": "A" });
    expect(buildWpLabelMap([{ id: "w1", wp_number: "WP-1", name: "n" }])).toEqual({ w1: "WP-1" });
    expect(filterActiveDeliveries([{ id: "1" }, { id: "2", is_deleted: true }])).toHaveLength(1);
  });

  it("filters enriched deliveries by status/risk/search", () => {
    const enriched = [
      {
        id: "1",
        delivery_title: "Columns",
        vendor: "Acme",
        project_id: "p1",
        work_package_id: "w1",
        _signals: { status: "Scheduled", risk: "clear", overdue: false, dueToday: true },
      },
      {
        id: "2",
        delivery_title: "Bracing",
        vendor: "SteelCo",
        project_id: "p1",
        work_package_id: "w1",
        _signals: { status: "In Transit", risk: "high", overdue: true, dueToday: false },
      },
    ] as any;

    const late = filterDeliveries(enriched, {
      statusFilter: "all",
      riskFilter: "all",
      scheduleFilter: "late",
      search: "",
      seqFilter: null,
      readyToReceive: [],
      projectMap: { p1: "Job" },
      workPackageMap: { w1: { wp_number: "WP-1", name: "Anchors" } },
      matchesSequenceFilter: () => true,
      sortFn: () => 0,
    });
    expect(late.map((d) => d.id)).toEqual(["2"]);

    const search = filterDeliveries(enriched, {
      statusFilter: "all",
      riskFilter: "all",
      scheduleFilter: "all",
      search: "columns",
      seqFilter: null,
      readyToReceive: [],
      projectMap: { p1: "Job" },
      workPackageMap: { w1: { wp_number: "WP-1", name: "Anchors" } },
      matchesSequenceFilter: () => true,
      sortFn: () => 0,
    });
    expect(search.map((d) => d.id)).toEqual(["1"]);
  });

  it("groups by lane and toggles selection", () => {
    const groups = groupDeliveriesByLane(
      [{ id: "1" }, { id: "2" }] as any,
      (d) => (d.id === "1" ? "Scheduled" : "Exceptions"),
    );
    expect(groups.Scheduled).toHaveLength(1);
    expect(groups.Exceptions).toHaveLength(1);
    expect([...nextSelectedIdsToggle(new Set(["1"]), "2")].sort()).toEqual(["1", "2"]);
  });
});
