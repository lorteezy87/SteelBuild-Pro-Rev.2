import { describe, expect, it } from "vitest";
import {
  productionScopeFetchArg,
  productionScopeQueryKey,
  resolveProductionWorkPackageScope,
  UNASSIGNED_WP_FILTER,
} from "../productionScope";

describe("productionScope", () => {
  it("prefers a locked work package over the board filter", () => {
    expect(
      resolveProductionWorkPackageScope("wp-locked", "wp-other"),
    ).toBe("wp-locked");
  });

  it("maps all / package / unassigned board filters", () => {
    expect(resolveProductionWorkPackageScope(undefined, "")).toBeUndefined();
    expect(resolveProductionWorkPackageScope(undefined, "wp-2")).toBe("wp-2");
    expect(
      resolveProductionWorkPackageScope(undefined, UNASSIGNED_WP_FILTER),
    ).toBeNull();
  });

  it("round-trips scope keys for the production snapshot query", () => {
    expect(productionScopeQueryKey(undefined)).toBe("all");
    expect(productionScopeQueryKey(null)).toBe("unassigned");
    expect(productionScopeQueryKey("wp-2")).toBe("wp-2");
    expect(productionScopeFetchArg("all")).toBeUndefined();
    expect(productionScopeFetchArg("unassigned")).toBeNull();
    expect(productionScopeFetchArg("wp-2")).toBe("wp-2");
  });
});
