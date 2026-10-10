import { describe, expect, it } from "vitest";
import { resolveDashboardNavigation } from "../dashboardNavigation";

describe("dashboard navigation", () => {
  it.each([
    ["rfis", "RFIs"],
    ["detailing", "DrawingSubmittalHub"],
    ["work-packages", "WorkPackages"],
    ["deliveries", "Deliveries"],
    ["change-orders", "ChangeOrders"],
    ["field", "FieldHub"],
    ["cost-hub", "CostHub"],
    ["piece-register", "PieceRegister"],
    ["command-center", "CommandCenter"],
    ["job-status-report", "JobStatusReport"],
  ])("resolves %s and its canonical route %s", (alias, canonical) => {
    expect(resolveDashboardNavigation(alias)).toBe(`/${canonical}`);
    expect(resolveDashboardNavigation(canonical)).toBe(`/${canonical}`);
  });

  it("preserves record and piece-register context with encoded query values", () => {
    const destination = resolveDashboardNavigation("PieceRegister", {
      create: true, id: "lot / 1", stage: "Released & ready", status: "On Hold",
      view: "lots", focus: "held",
    });
    const url = new URL(destination!, "https://steelbuild.example");
    expect(url.pathname).toBe("/PieceRegister");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      new: "1", id: "lot / 1", stage: "Released & ready", status: "On Hold",
      view: "lots", focus: "held",
    });
  });

  it.each(["MissingRoute", "https://external.example", "__proto__", "constructor"])(
    "rejects unregistered destination %s",
    (target) => expect(resolveDashboardNavigation(target)).toBeNull(),
  );
});
