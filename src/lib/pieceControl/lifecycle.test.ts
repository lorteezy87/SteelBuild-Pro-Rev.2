import { describe, expect, it } from "vitest";
import {
  logisticsDisabledReason,
  nextLifecycleForAction,
  pieceLifecycleLabel,
  requiredLifecycleForAction,
  type LogisticsEligibilityPiece,
} from "./lifecycle";

const fabricated: LogisticsEligibilityPiece = {
  lifecycle_status: "fabricated",
  on_hold: false,
  is_container: false,
  is_deleted: false,
  deleted_at: null,
};

describe("canonical logistics lifecycle", () => {
  it("defines the three immutable physical transitions", () => {
    expect(requiredLifecycleForAction("ship")).toBe("fabricated");
    expect(nextLifecycleForAction("ship")).toBe("shipped");
    expect(requiredLifecycleForAction("deliver")).toBe("shipped");
    expect(nextLifecycleForAction("deliver")).toBe("delivered");
    expect(requiredLifecycleForAction("erect")).toBe("delivered");
    expect(nextLifecycleForAction("erect")).toBe("erected");
  });

  it("blocks wrong states, holds, containers, and deleted lots", () => {
    expect(logisticsDisabledReason(fabricated, "deliver")).toBe(
      "Shipped status is required.",
    );
    expect(logisticsDisabledReason({ ...fabricated, on_hold: true }, "ship")).toContain("hold");
    expect(logisticsDisabledReason({ ...fabricated, is_container: true }, "ship")).toContain("containers");
    expect(logisticsDisabledReason({ ...fabricated, is_deleted: true }, "ship")).toContain("Deleted");
  });

  it("uses canonical user-visible labels", () => {
    expect(pieceLifecycleLabel("in_fabrication")).toBe("In Fabrication");
    expect(pieceLifecycleLabel("delivered")).toBe("Delivered");
  });
});

