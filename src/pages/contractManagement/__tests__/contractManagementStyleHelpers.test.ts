import { describe, expect, it } from "vitest";
import {
  thStyle,
  tdStyle,
  tdBodyStyle,
  tdRightStyle,
  totalsStyle,
  CO_STATUS_COLORS,
} from "../contractManagementStyleHelpers";

describe("contractManagementStyleHelpers", () => {
  it("table styles", () => {
    expect(thStyle.fontSize).toBe(8);
    expect(tdStyle.fontSize).toBe(11);
    expect(tdBodyStyle.maxWidth).toBe(260);
    expect(tdRightStyle.textAlign).toBe("right");
    expect(totalsStyle.fontWeight).toBe(800);
  });
  it("co status colors", () => {
    expect(CO_STATUS_COLORS.Approved.text).toBe("var(--status-success)");
    expect(CO_STATUS_COLORS.Rejected.text).toBe("var(--status-error)");
  });
});
