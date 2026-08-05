import { describe, expect, it } from "vitest";
import {
  buildPerVendorStats,
  filterVendors,
  uniqueVendorTypes,
  buildVendorCsvRows,
  VENDOR_CSV_HEADERS,
} from "../vendorsPageHelpers";

describe("vendorsPageHelpers", () => {
  it("stats filter csv", () => {
    const vendors = [{ company_name: "Acme Steel", vendor_type: "Mill", status: "Active", contact_person: "Pat" }];
    const stats = buildPerVendorStats(
      vendors,
      [
        { vendor: "Acme Steel", status: "Delivered", scheduled_date: "2026-08-01", actual_date: "2026-08-01" },
        { vendor: "Acme Steel", status: "Delivered", scheduled_date: "2026-08-01", actual_date: "2026-08-05" },
      ],
      [{ title: "Acme Steel delay", co_amount: 1000 }],
      [{ vendor: "Acme Steel", amount: 250 }],
    );
    expect(stats["Acme Steel"].deliveryCount).toBe(2);
    expect(stats["Acme Steel"].onTimeRate).toBe(50);
    expect(stats["Acme Steel"].coCount).toBe(1);
    expect(stats["Acme Steel"].totalSpend).toBe(250);
    expect(filterVendors(vendors, { search: "acme", statusFilter: "all", typeFilter: "all" })).toHaveLength(1);
    expect(uniqueVendorTypes(vendors)).toEqual(["Mill"]);
    expect(buildVendorCsvRows(vendors, stats)[0][0]).toBe("Acme Steel");
    expect(VENDOR_CSV_HEADERS).toHaveLength(11);
  });
});
