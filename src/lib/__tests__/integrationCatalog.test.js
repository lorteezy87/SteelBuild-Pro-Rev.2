import { describe, expect, it } from "vitest";
import {
  INTEGRATION_AREAS,
  filterIntegrations,
  getIntegrationByKey,
  integrationSummary,
} from "../integrationCatalog";

describe("integrationCatalog", () => {
  it("covers the requested integration areas", () => {
    const keys = INTEGRATION_AREAS.map((area) => area.key);

    expect(keys).toEqual(expect.arrayContaining([
      "email",
      "accounting",
      "document-storage",
      "bluebeam-pdf",
      "scheduling",
      "autodesk-bim",
    ]));
  });

  it("reports a useful integration readiness summary", () => {
    const summary = integrationSummary();

    expect(summary.total).toBe(INTEGRATION_AREAS.length);
    expect(summary.partiallyLive).toBeGreaterThan(0);
    expect(summary.highRisk).toBeGreaterThan(0);
  });

  it("filters by provider terms and category", () => {
    expect(filterIntegrations({ query: "QuickBooks" }).map((area) => area.key)).toEqual(["accounting"]);
    expect(filterIntegrations({ category: "Schedule" }).map((area) => area.key)).toEqual(["scheduling"]);
  });

  it("falls back to the first integration for unknown keys", () => {
    expect(getIntegrationByKey("missing").key).toBe(INTEGRATION_AREAS[0].key);
  });
});
