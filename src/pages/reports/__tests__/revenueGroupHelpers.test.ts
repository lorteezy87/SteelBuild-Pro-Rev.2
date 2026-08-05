import { describe, expect, it } from "vitest";
import {
  billedByProjectMap,
  groupRevenueByClient,
  groupRevenueByType,
  maxBilledFromGroups,
  totalBilledFromGroups,
  withSharePct,
} from "../revenueGroupHelpers";

describe("revenueGroupHelpers", () => {
  it("builds billed map and groups by client/type", () => {
    const sov = [
      {
        project_id: "p1",
        line_item_number: 1,
        application_number: 1,
        status: "Certified",
        scheduled_value: 200,
        current_percent_complete: 50,
      },
      {
        project_id: "p1",
        line_item_number: 1,
        application_number: 2,
        status: "Certified",
        scheduled_value: 200,
        current_percent_complete: 75,
      },
      {
        project_id: "p2",
        line_item_number: 1,
        application_number: 1,
        status: "Draft",
        scheduled_value: 1000,
        current_percent_complete: 100,
      },
      {
        project_id: "p2",
        line_item_number: 1,
        application_number: 1,
        status: "Certified",
        scheduled_value: 100,
        current_percent_complete: 100,
      },
    ];
    const billed = billedByProjectMap(sov);
    expect(billed.p1).toBe(150); // latest app 75% of 200
    expect(billed.p2).toBe(100);

    const clients = groupRevenueByClient({
      billedByProject: billed,
      projects: [
        {
          id: "p1",
          general_contractor: "ACME",
          original_contract_value: 500,
        },
        {
          id: "p2",
          client: "Beta Co",
          original_contract_value: 300,
        },
        {
          id: "p3",
          general_contractor: "ACME",
          original_contract_value: 100,
        },
      ],
    });
    expect(clients[0].client).toBe("ACME");
    expect(clients[0]).toMatchObject({
      projectCount: 2,
      contractValue: 600,
      billed: 150,
    });
    expect(clients[1]).toMatchObject({ client: "Beta Co", billed: 100 });

    const types = groupRevenueByType({
      billedByProject: billed,
      projects: [
        { id: "p1", contract_type: "Lump Sum", original_contract_value: 500 },
        { id: "p2", contract_type: null, original_contract_value: 300 },
      ],
    });
    expect(types.map((t) => t.type)).toEqual(["Lump Sum", "Unspecified"]);
    expect(types[0].billed).toBe(150);

    const total = totalBilledFromGroups(clients);
    expect(total).toBe(250);
    expect(maxBilledFromGroups(clients)).toBe(150);
    const withShare = withSharePct(clients, total);
    expect(withShare[0].sharePct).toBe(60);
  });
});
