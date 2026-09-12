import { describe, expect, it } from "vitest";

import {
  deriveIntegrationPageModel,
  resolveIntegrationConfiguration,
} from "../integrationPageModel";

const DEFAULT_FILTERS = {
  category: "All",
  status: "All",
  customerStatus: "All",
  query: "",
};

describe("integrationPageModel", () => {
  it("keeps internal status filtering behind developer view", () => {
    const customerModel = deriveIntegrationPageModel({
      filters: { ...DEFAULT_FILTERS, status: "Adapter Required" },
      selectedKey: "document-storage",
      showDev: false,
    });
    const developerModel = deriveIntegrationPageModel({
      filters: { ...DEFAULT_FILTERS, status: "Adapter Required" },
      selectedKey: "document-storage",
      showDev: true,
    });

    expect(customerModel.filteredAreas.length).toBeGreaterThan(1);
    expect(developerModel.filteredAreas.map((area) => area.key)).toEqual(["accounting"]);
  });

  it("derives customer readiness without leaking developer status filters", () => {
    const model = deriveIntegrationPageModel({
      filters: { ...DEFAULT_FILTERS, customerStatus: "Coming Soon" },
      selectedKey: "autodesk-bim",
      showDev: false,
    });

    expect(model.filteredAreas.map((area) => area.key)).toEqual(["autodesk-bim"]);
    expect(model.selectedCustomerLabel).toBe("Coming Soon");
    expect(model.selectedStyle["--detail-accent"]).toBe("var(--text-muted)");
  });

  it("fails closed when no project or unsupported integration has settings", () => {
    expect(resolveIntegrationConfiguration(null, "email")).toBeNull();
    expect(resolveIntegrationConfiguration("project-1", "accounting")).toBeNull();
    expect(resolveIntegrationConfiguration("project-1", "email")).toBe("email");
    expect(resolveIntegrationConfiguration("project-1", "document-storage"))
      .toBe("document-storage");
  });
});
