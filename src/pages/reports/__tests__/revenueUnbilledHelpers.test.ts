import { describe, expect, it } from "vitest";
import {
  billedByClient,
  billedByContractType,
  buildPerProjectRevenueRows,
  collectedPercent,
  decoratePositiveSegments,
  sovBilledValue,
} from "../revenueDashboardHelpers";
import {
  buildUnbilledRows,
  filterUnbilledRows,
  sumContractValue,
  sumUnbilled,
} from "../unbilledRevenueHelpers";

describe("revenueDashboardHelpers", () => {
  it("sovBilledValue and collected percent", () => {
    expect(sovBilledValue({ scheduled_value: 200, current_percent_complete: 50 })).toBe(100);
    expect(collectedPercent(25, 100)).toBe(25);
    expect(collectedPercent(10, 0)).toBe(0);
  });

  it("billedByClient collapses long tail and billedByContractType groups", () => {
    const projectsById = new Map([
      ["p1", { general_contractor: "ACME", contract_type: "Lump Sum" }],
      ["p2", { client: "Beta", contract_type: null }],
      ["p3", { general_contractor: "Gamma", contract_type: "T&M" }],
      ["p4", { general_contractor: "Delta", contract_type: "Lump Sum" }],
      ["p5", { general_contractor: "Echo", contract_type: "Lump Sum" }],
      ["p6", { general_contractor: "Fox", contract_type: "Lump Sum" }],
      ["p7", { general_contractor: "Golf", contract_type: "Lump Sum" }],
    ]);
    const items = [
      { project_id: "p1", scheduled_value: 100, current_percent_complete: 100 },
      { project_id: "p2", scheduled_value: 50, current_percent_complete: 100 },
      { project_id: "p3", scheduled_value: 40, current_percent_complete: 100 },
      { project_id: "p4", scheduled_value: 30, current_percent_complete: 100 },
      { project_id: "p5", scheduled_value: 20, current_percent_complete: 100 },
      { project_id: "p6", scheduled_value: 10, current_percent_complete: 100 },
      { project_id: "p7", scheduled_value: 5, current_percent_complete: 100 },
      { project_id: "missing", scheduled_value: 8, current_percent_complete: 100 },
    ];
    const byClient = billedByClient(items, projectsById as any, 6);
    expect(byClient).toHaveLength(7); // 6 top + Other
    expect(byClient[0].label).toBe("ACME");
    expect(byClient[byClient.length - 1]).toEqual({ label: "Other", value: 13 }); // Golf 5 + Unknown 8

    const byType = billedByContractType(items, projectsById as any);
    expect(byType.find((s) => s.label === "Lump Sum")?.value).toBe(165); // 100+30+20+10+5
    expect(byType.find((s) => s.label === "Unspecified")?.value).toBe(58); // Beta 50 + missing 8
  });

  it("decoratePositiveSegments and per-project rows", () => {
    const decorated = decoratePositiveSegments(
      [
        { label: "A", value: 10 },
        { label: "B", value: 0 },
      ],
      ["red", "blue"],
    );
    expect(decorated).toEqual([{ label: "A", value: 10, color: "red" }]);

    const rows = buildPerProjectRevenueRows({
      projects: [
        {
          id: "p1",
          project_number: "A1",
          name: "Alpha",
          general_contractor: "ACME",
          contract_type: "Lump Sum",
        },
      ],
      sovItems: [
        {
          project_id: "p1",
          line_item_number: 1,
          application_number: 1,
          status: "Certified",
          scheduled_value: 100,
          current_percent_complete: 50,
          retainage_percent: 10,
          payment_received_date: "2026-07-01",
          submitted_date: "2026-06-01",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].number).toBe("A1");
    expect(rows[0].billed).toBeGreaterThan(0);
    expect(rows[0].collected).toBeGreaterThan(0);
  });
});

describe("unbilledRevenueHelpers", () => {
  it("builds rows with billed gap and pending lines", () => {
    const rows = buildUnbilledRows({
      projects: [
        {
          id: "p1",
          name: "Alpha",
          project_number: "A1",
          general_contractor: "ACME",
          original_contract_value: 1000,
        },
        {
          id: "p2",
          name: "Beta",
          original_contract_value: 100,
        },
      ],
      sov: [
        {
          project_id: "p1",
          line_item_number: 1,
          application_number: 1,
          status: "Certified",
          scheduled_value: 400,
          current_percent_complete: 50,
          submitted_date: "2026-06-01",
        },
        {
          project_id: "p1",
          line_item_number: 2,
          application_number: 1,
          status: "Draft",
          scheduled_value: 100,
          current_percent_complete: 0,
        },
        {
          project_id: "p2",
          line_item_number: 1,
          application_number: 1,
          status: "Certified",
          scheduled_value: 100,
          current_percent_complete: 100,
          submitted_date: "2026-06-01",
        },
      ],
    });
    const p1 = rows.find((r) => r.id === "p1")!;
    expect(p1.billed).toBe(200);
    expect(p1.unbilled).toBe(800);
    expect(p1.unbilledLineItems).toBe(1); // line 2 never submitted

    const p2 = rows.find((r) => r.id === "p2")!;
    expect(p2.unbilled).toBe(0);
    expect(p2.unbilledLineItems).toBe(0);

    const filtered = filterUnbilledRows(rows, "acme");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("p1");
    expect(sumUnbilled(filtered)).toBe(800);
    expect(sumContractValue(filtered)).toBe(1000);

    expect(filterUnbilledRows(rows, "")).toHaveLength(1);
  });
});
