/**
 * SOV rollup dedupe helpers — pins the row model documented in
 * projectMetrics.js ("SOV ROW MODEL — IMPORTANT"): sov_items holds one row
 * per (project, line item, application, status), so every total must dedupe
 * before summing or it overcounts 2-3× on multi-application projects.
 */
import { describe, it, expect } from "vitest";
import {
  latestApplicationPerLineItem,
  latestCertifiedPerLineItem,
  sovScheduledTotal,
  totalBilled,
} from "@/pages/dashboard/projectMetrics";

// One line item billed across two applications: app 1 Draft+Certified at 50%,
// app 2 Draft+Certified at 100%. Real SOV total = 24,000, billed = 24,000.
const P = "proj-1";
const multiAppRows = [
  { project_id: P, line_item_number: 1, application_number: 1, status: "Draft", scheduled_value: 24000, current_percent_complete: 50 },
  { project_id: P, line_item_number: 1, application_number: 1, status: "Certified", scheduled_value: 24000, current_percent_complete: 50 },
  { project_id: P, line_item_number: 1, application_number: 2, status: "Draft", scheduled_value: 24000, current_percent_complete: 100 },
  { project_id: P, line_item_number: 1, application_number: 2, status: "Certified", scheduled_value: 24000, current_percent_complete: 100 },
  { project_id: P, line_item_number: 2, application_number: 1, status: "Draft", scheduled_value: 10000, current_percent_complete: 0 },
];

describe("latestApplicationPerLineItem", () => {
  it("keeps one row per line item — the highest application, any status", () => {
    const rows = latestApplicationPerLineItem(multiAppRows);
    expect(rows).toHaveLength(2);
    const line1 = rows.find((r) => r.line_item_number === 1);
    expect(line1?.application_number).toBe(2);
  });

  it("skips deleted rows and tolerates an empty list", () => {
    expect(latestApplicationPerLineItem([])).toEqual([]);
    const rows = latestApplicationPerLineItem([
      { project_id: P, line_item_number: 1, application_number: 3, status: "Draft", scheduled_value: 5000, is_deleted: true },
      ...multiAppRows,
    ]);
    expect(rows.find((r) => r.line_item_number === 1)?.application_number).toBe(2);
  });

  it("never collapses rows that lack a line_item_number", () => {
    const rows = latestApplicationPerLineItem([
      { project_id: P, application_number: 1, status: "Draft", scheduled_value: 100 },
      { project_id: P, application_number: 2, status: "Draft", scheduled_value: 200 },
    ]);
    expect(rows).toHaveLength(2);
  });

  it("breaks application ties by most advanced status (Certified over Draft)", () => {
    const rows = latestApplicationPerLineItem([
      { project_id: P, line_item_number: 9, application_number: 3, status: "Draft", scheduled_value: 100 },
      { project_id: P, line_item_number: 9, application_number: 3, status: "Certified", scheduled_value: 100 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("Certified");
  });

  it("keeps identical line item numbers from different projects separate", () => {
    const rows = latestApplicationPerLineItem([
      ...multiAppRows,
      { project_id: "proj-2", line_item_number: 1, application_number: 1, status: "Draft", scheduled_value: 7000, current_percent_complete: 0 },
    ]);
    expect(rows).toHaveLength(3);
  });
});

describe("sovScheduledTotal", () => {
  it("sums scheduled_value once per line item, not once per row", () => {
    // Raw-row sum would be 24000*4 + 10000 = 106,000 — the documented bug.
    expect(sovScheduledTotal(multiAppRows)).toBe(34000);
  });
});

describe("totalBilled + latestCertifiedPerLineItem (regression)", () => {
  it("bills from the latest Certified row only", () => {
    expect(totalBilled(multiAppRows)).toBe(24000);
    const certified = latestCertifiedPerLineItem(multiAppRows);
    expect(certified).toHaveLength(1);
    expect(certified[0].application_number).toBe(2);
  });
});
