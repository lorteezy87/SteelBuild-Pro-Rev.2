import { describe, expect, it } from "vitest";
import {
  INTEGRATION_BUILD_ORDER,
  INTEGRATION_AREAS,
  filterIntegrations,
  getIntegrationByKey,
  integrationSummary,
  CUSTOMER_STATUS_META,
  CUSTOMER_STATUS_FILTERS,
  customerStatusMeta,
  filterByCustomerStatus,
  customerIntegrationSummary,
} from "../integrationCatalog";

const VALID_CUSTOMER_STATUS_KEYS = Object.keys(CUSTOMER_STATUS_META);

describe("integrationCatalog", () => {
  it("covers the requested integration areas", () => {
    const keys = INTEGRATION_AREAS.map((area) => area.key);

    expect(keys).toEqual(expect.arrayContaining([
      "email",
      "accounting",
      "document-storage",
      "scheduling",
      "autodesk-bim",
    ]));
  });

  it("starts integration buildout with email and document storage before accounting", () => {
    const phases = INTEGRATION_BUILD_ORDER.map((item) => item.phase);

    expect(phases.indexOf("Email")).toBeGreaterThan(phases.indexOf("Foundation"));
    expect(phases.indexOf("Documents")).toBeGreaterThan(phases.indexOf("Email"));
    expect(phases.indexOf("Cost")).toBeGreaterThan(phases.indexOf("Documents"));
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

describe("integrationCatalog — customer-facing readiness", () => {
  it("maps each status key to a clean label + tone, falling back to Coming Soon", () => {
    expect(customerStatusMeta("available")).toEqual({ label: "Available", tone: "success" });
    expect(customerStatusMeta("custom_setup").label).toBe("Custom Setup");
    expect(customerStatusMeta("setup_required").label).toBe("Setup Required");
    expect(customerStatusMeta("admin_review").label).toBe("Admin Review Required");
    expect(customerStatusMeta("nonsense").label).toBe("Coming Soon");
    expect(customerStatusMeta(undefined).label).toBe("Coming Soon");
  });

  it("gives every area a valid customerStatus, a summary, and providers with valid statuses", () => {
    for (const area of INTEGRATION_AREAS) {
      expect(VALID_CUSTOMER_STATUS_KEYS).toContain(area.customerStatus);
      expect(typeof area.customerSummary).toBe("string");
      expect(area.customerSummary.length).toBeGreaterThan(0);
      expect(Array.isArray(area.providers)).toBe(true);
      expect(area.providers.length).toBeGreaterThan(0);
      for (const p of area.providers) {
        expect(typeof p.name).toBe("string");
        expect(VALID_CUSTOMER_STATUS_KEYS).toContain(p.status);
      }
    }
  });

  it("never leaks raw dev language into any customer-facing surface (label, summary, provider names)", () => {
    const DEV_LANGUAGE = /Partially Live|Adapter Required|High risk|Medium risk|\bOAuth\b|Prerequisites|Next Sprint|Build Order/i;
    for (const area of INTEGRATION_AREAS) {
      expect(customerStatusMeta(area.customerStatus).label).not.toMatch(DEV_LANGUAGE);
      expect(area.customerSummary).not.toMatch(DEV_LANGUAGE);
      for (const p of area.providers) {
        expect(p.name).not.toMatch(DEV_LANGUAGE);
        expect(customerStatusMeta(p.status).label).not.toMatch(DEV_LANGUAGE);
      }
    }
  });

  it("filters by customer readiness label", () => {
    expect(filterByCustomerStatus(INTEGRATION_AREAS, "All")).toHaveLength(INTEGRATION_AREAS.length);
    const available = filterByCustomerStatus(INTEGRATION_AREAS, "Available");
    expect(available.length).toBeGreaterThan(0);
    expect(available.every((a) => a.customerStatus === "available")).toBe(true);
    expect(filterByCustomerStatus(INTEGRATION_AREAS, "Custom Setup").every((a) => a.customerStatus === "custom_setup")).toBe(true);
    expect(CUSTOMER_STATUS_FILTERS[0]).toBe("All");
    expect(CUSTOMER_STATUS_FILTERS).toContain("Coming Soon");
  });

  it("rolls up a customer-facing readiness summary", () => {
    const s = customerIntegrationSummary();
    expect(s.total).toBe(INTEGRATION_AREAS.length);
    expect(s.availableAreas).toBe(INTEGRATION_AREAS.filter((a) => a.customerStatus === "available").length);
    expect(s.availableProviders).toBe(
      INTEGRATION_AREAS.flatMap((a) => a.providers).filter((p) => p.status === "available").length,
    );
    expect(s.comingSoonProviders).toBeGreaterThan(0);
  });
});
