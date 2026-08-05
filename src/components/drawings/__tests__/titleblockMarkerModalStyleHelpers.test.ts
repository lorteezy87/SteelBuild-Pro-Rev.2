import { describe, expect, it } from "vitest";
import {
  overlayStyle,
  dialogStyle,
  headerStyle,
  toolbarStyle,
  canvasWrapStyle,
  footerStyle,
  btn,
} from "../titleblockMarkerModalStyleHelpers";

describe("titleblockMarkerModalStyleHelpers", () => {
  it("overlay and dialog layout", () => {
    expect(overlayStyle.position).toBe("fixed");
    expect(overlayStyle.zIndex).toBe(1000);
    expect(dialogStyle.display).toBe("flex");
    expect(dialogStyle.flexDirection).toBe("column");
  });

  it("header toolbar footer flex chrome", () => {
    expect(headerStyle.flexShrink).toBe(0);
    expect(toolbarStyle.gap).toBe(12);
    expect(footerStyle.justifyContent).toBe("space-between");
  });

  it("canvasWrapStyle keeps safe centering and shrink", () => {
    expect(canvasWrapStyle.minHeight).toBe(0);
    expect(canvasWrapStyle.minWidth).toBe(0);
    expect(canvasWrapStyle.alignItems).toBe("safe center");
    expect(canvasWrapStyle.justifyContent).toBe("safe center");
  });

  it("btn variants", () => {
    expect(btn("primary").background).toBe("var(--accent)");
    expect(btn("secondary").background).toBe("transparent");
    expect(btn().border).toBe("1px solid var(--border-default)");
  });
});
