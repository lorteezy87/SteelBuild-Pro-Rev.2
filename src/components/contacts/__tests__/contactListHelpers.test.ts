import { describe, expect, it } from "vitest";
import { TYPE_COLORS } from "../contactListHelpers";

describe("contactListHelpers", () => {
  it("type colors", () => {
    expect(TYPE_COLORS.Owner).toBe("var(--status-error)");
    expect(TYPE_COLORS.Supplier).toBe("var(--status-success)");
    expect(TYPE_COLORS.Internal).toBe("var(--secondary)");
  });
});
