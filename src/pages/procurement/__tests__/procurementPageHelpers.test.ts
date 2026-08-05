import { describe, expect, it } from "vitest";
import {
  filterProcurementSubset,
  enrichProcurementItem,
  enrichProcurementItems,
  filterAndSortEnriched,
  buildWpById,
  costEstimateFromMetadata,
  buildProcurementCsvRow,
  PROCUREMENT_CSV_HEADERS,
} from "../procurementPageHelpers";

describe("procurementPageHelpers", () => {
  const today = new Date("2026-06-15T12:00:00Z");

  it("filters procurement subset (category + not deleted)", () => {
    const rows = [
      { id: "1", procurement_category: "Other", is_deleted: false },
      { id: "2", procurement_category: "Other", is_deleted: true },
      { id: "3", procurement_category: null, is_deleted: false },
      { id: "4", procurement_category: "Joists & Deck" },
    ];
    expect(filterProcurementSubset(rows).map((r) => r.id)).toEqual(["1", "4"]);
  });

  it("enriches late / overdue / lead-time fields", () => {
    const late = enrichProcurementItem(
      {
        id: "a",
        status: "Shipped",
        required_date: "2026-06-01",
        scheduled_date: "2026-06-10",
        order_placed_date: "2026-05-01",
        lead_time_weeks: 8,
        expected_ship_date: null,
        is_long_lead: true,
      },
      today,
    );
    expect(late.isLate).toBeTruthy();
    expect(late.isOverdue).toBeTruthy();
    expect(late.daysExposure).toBe(9);
    expect(late.computedShipDate).toBeTruthy();
    // order_placed + 8w lands after required → long-lead slip
    expect(late.longLeadSlipping).toBe(true);

    const terminal = enrichProcurementItem(
      {
        id: "b",
        status: "Received",
        required_date: "2026-01-01",
        scheduled_date: "2026-02-01",
        is_long_lead: true,
        expected_ship_date: "2026-02-01",
      },
      today,
    );
    expect(terminal.isLate).toBeFalsy();
    expect(terminal.isOverdue).toBeFalsy();
    expect(terminal.longLeadSlipping).toBe(false);
  });

  it("filterAndSort prioritizes overdue then late", () => {
    const enriched = enrichProcurementItems(
      [
        {
          id: "ok",
          status: "Quoted",
          procurement_category: "Other",
          required_date: "2026-07-01",
          scheduled_date: "2026-07-01",
          description: "Ok item",
          vendor: "Acme",
          po_number: "PO-1",
        },
        {
          id: "over",
          status: "Quoted",
          procurement_category: "Other",
          required_date: "2026-06-01",
          scheduled_date: "2026-06-01",
          description: "Overdue item",
          vendor: "Beta",
          po_number: "PO-2",
        },
        {
          id: "late",
          status: "Quoted",
          procurement_category: "Joists & Deck",
          required_date: "2026-07-01",
          scheduled_date: "2026-07-20",
          description: "Late promise",
          vendor: "Gamma",
          po_number: "PO-3",
        },
      ],
      today,
    );

    const sorted = filterAndSortEnriched(enriched, {
      filterCat: "all",
      filterStatus: "all",
      search: "",
    });
    expect(sorted.map((r) => r.id)).toEqual(["over", "late", "ok"]);

    const cat = filterAndSortEnriched(enriched, {
      filterCat: "Joists & Deck",
      filterStatus: "all",
      search: "",
    });
    expect(cat.map((r) => r.id)).toEqual(["late"]);

    const search = filterAndSortEnriched(enriched, {
      filterCat: "all",
      filterStatus: "all",
      search: "beta",
    });
    expect(search.map((r) => r.id)).toEqual(["over"]);
  });

  it("builds wp map, cost estimate, and csv row", () => {
    const map = buildWpById([
      { id: "w1", wp_number: "WP-01", name: "Columns" },
      { name: "no-id" } as any,
    ]);
    expect(map.get("w1")?.wp_number).toBe("WP-01");
    expect(map.size).toBe(1);

    expect(costEstimateFromMetadata({ cost_estimate: "1200" })).toBe("1200");
    expect(costEstimateFromMetadata({ cost_estimate: 50 })).toBe(50);
    expect(costEstimateFromMetadata(null)).toBe("");
    expect(costEstimateFromMetadata(["x"] as any)).toBe("");

    const row = buildProcurementCsvRow(
      {
        description: "Beams",
        procurement_category: "Other",
        vendor: "Acme",
        po_number: "P1",
        status: "Quoted",
        required_date: "2026-07-01",
        scheduled_date: "2026-07-02",
        order_placed_date: "2026-05-01",
        expected_ship_date: null,
        computedShipDate: "2026-05-15",
        lead_time_weeks: 2,
        is_long_lead: true,
        weight_tons: 3.5,
        pieces: 10,
        metadata: { cost_estimate: "999" },
        work_package_id: "w1",
        notes: "n",
        isLate: false,
        isOverdue: false,
        daysExposure: 1,
        effectiveShipDate: "2026-05-15",
        longLeadSlipping: false,
      },
      map,
    );
    expect(row[0]).toBe("Beams");
    expect(row[8]).toBe("2026-05-15");
    expect(row[10]).toBe("Yes");
    expect(row[13]).toBe("999");
    expect(row[14]).toBe("WP-01");
    expect(PROCUREMENT_CSV_HEADERS).toHaveLength(16);
  });
});
