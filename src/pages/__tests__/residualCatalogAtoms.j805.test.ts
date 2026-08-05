import { describe, expect, it } from "vitest";
import {
  SHORTCUTS_HEADER_STYLE,
  SHORTCUTS_KBD_STYLE,
  SHORTCUTS_ROW_STYLE,
} from "@/components/settings/shortcutsTabStyleHelpers";
import {
  REGISTER_FETCH_PANEL_STYLE,
  REGISTER_FETCH_TITLE_STYLE,
} from "@/components/shared/registerFetchStatesHelpers";
import { SECTION_LABEL_STYLE } from "@/components/shared/relatedScheduleTasksChipsHelpers";
import { MODEL3D_MONO } from "@/components/viewer3d/model3dTabHelpers";
import { AUTO_LINK_CHIP_STYLE } from "@/components/shared/autoLinkSuggestionsHelpers";

describe("residual catalog atoms batch J", () => {
  it("shortcuts tab styles", () => {
    expect(SHORTCUTS_HEADER_STYLE.fontSize).toBe(16);
    expect(SHORTCUTS_KBD_STYLE.fontFamily).toContain("mono");
    expect(SHORTCUTS_ROW_STYLE.display).toBe("grid");
  });

  it("register fetch and related label styles", () => {
    expect(REGISTER_FETCH_PANEL_STYLE.alignItems).toBe("center");
    expect(REGISTER_FETCH_TITLE_STYLE.fontWeight).toBe(600);
    expect(SECTION_LABEL_STYLE.fontSize).toBe(9);
  });

  it("model3d mono and autolink chip", () => {
    expect(MODEL3D_MONO.fontFamily).toContain("mono");
    expect(AUTO_LINK_CHIP_STYLE.cursor).toBe("pointer");
  });
});
