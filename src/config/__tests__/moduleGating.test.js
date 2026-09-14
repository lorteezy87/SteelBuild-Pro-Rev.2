import { describe, it, expect } from "vitest";
import {
  gateFlagForPage,
  isGatedPage,
  PAGE_TO_GATE,
  MODULE_GATES,
  MODULE_GATE_LABELS,
} from "../moduleGating";

describe("moduleGating", () => {
  it("leaves core detailing/schedule/field pages un-gated", () => {
    for (const page of [
      "Dashboard",
      "DrawingSubmittalHub",
      "Drawings",
      "RFIs",
      "WorkPackages",
      "ScheduleHub",
      "FieldToday",
      "CostHub",
      "ChangeOrders",
      "SOV",
      "PayApplications",
      "Settings",
      "Billing",
    ]) {
      expect(isGatedPage(page)).toBe(false);
      expect(gateFlagForPage(page)).toBeNull();
    }
  });

  it("keeps the operational cost module available without an optional flag", () => {
    expect(MODULE_GATES.module_cost).toBeUndefined();
    expect(MODULE_GATE_LABELS.module_cost).toBeUndefined();
    expect(gateFlagForPage("CostHub")).toBeNull();
    expect(gateFlagForPage("ChangeOrders")).toBeNull();
    expect(isGatedPage("SOV")).toBe(false);
  });

  it("keeps Integrations and Email Inbox available while staging Data Exchange", () => {
    expect(gateFlagForPage("Integrations")).toBeNull();
    expect(isGatedPage("Integrations")).toBe(false);
    expect(gateFlagForPage("EmailInbox")).toBeNull();
    expect(isGatedPage("EmailInbox")).toBe(false);

    expect(gateFlagForPage("DataExchange")).toBe("module_integrations");
    expect(isGatedPage("DataExchange")).toBe(true);
  });

  it("does not retain the dead Email Inbox module flag in route authority", () => {
    expect(MODULE_GATES.module_email_inbox).toBeUndefined();
    expect(MODULE_GATE_LABELS.module_email_inbox).toBeUndefined();
  });

  it("builds a reverse PAGE_TO_GATE without collisions", () => {
    const pages = Object.values(MODULE_GATES).flat();
    expect(Object.keys(PAGE_TO_GATE).sort()).toEqual([...new Set(pages)].sort());
  });
});
