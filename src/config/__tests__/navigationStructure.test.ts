import { describe, expect, it, vi } from "vitest";

async function loadStructure(native = false) {
  vi.resetModules();
  vi.doMock("@/lib/native/platform", () => ({ isNativePlatform: () => native }));
  return import("@/config/navigationStructure");
}

describe("SteelBuild operational navigation", () => {
  it("uses the approved seven primary workflow groups followed by utilities", async () => {
    const { OPERATIONAL_NAV_GROUPS } = await loadStructure(false);

    expect(OPERATIONAL_NAV_GROUPS.map((group) => group.label)).toEqual([
      "COMMAND",
      "PROJECTS",
      "DETAILING",
      "PRODUCTION",
      "FIELD",
      "COMMERCIAL",
      "REPORTS",
      "ADMINISTRATION",
      "TOOLS",
    ]);
  });

  it("places core steel workflows in the expected groups", async () => {
    const { OPERATIONAL_NAV_GROUPS } = await loadStructure(false);
    const pages = Object.fromEntries(
      OPERATIONAL_NAV_GROUPS.map((group) => [group.label, group.items.map((item) => item.page)]),
    );

    expect(pages.COMMAND).toEqual(expect.arrayContaining(["Dashboard", "CommandCenter", "AlertsCenter"]));
    expect(pages.DETAILING).toEqual(expect.arrayContaining(["DrawingSubmittalHub", "RFIs", "Documents"]));
    expect(pages.PRODUCTION).toEqual(expect.arrayContaining(["WorkPackages", "PieceRegister", "FabRelease", "Deliveries"]));
    expect(pages.COMMERCIAL).toEqual(expect.arrayContaining(["CostHub", "ChangeOrders", "SOV", "PayApplications", "Backcharges"]));
  });

  it("keeps Billing out of native navigation", async () => {
    const { OPERATIONAL_NAV_GROUPS } = await loadStructure(true);
    const pages = OPERATIONAL_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.page));
    expect(pages).not.toContain("Billing");
  });
});
