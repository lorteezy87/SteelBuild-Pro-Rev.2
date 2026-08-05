import { describe, expect, it } from "vitest";
import {
  AUTH_FORM_WRAP_STYLE,
  authFormCardStyle,
  authFormTitleStyle,
  AUTH_FORM_PRIMARY_BTN_STYLE,
  AUTH_FORM_GHOST_BTN_STYLE,
} from "@/pages/authFormChromeHelpers";
import {
  BULK_FOLDER_OVERLAY_STYLE,
  BULK_FOLDER_DIALOG_STYLE,
  bulkFolderBtnStyle,
} from "@/pages/documents/bulkCreateFoldersModalHelpers";

describe("residual catalog atoms batch S", () => {
  it("auth form shared chrome", () => {
    expect(AUTH_FORM_WRAP_STYLE.minHeight).toBe("100vh");
    expect(authFormCardStyle(400).maxWidth).toBe(400);
    expect(authFormCardStyle(420).maxWidth).toBe(420);
    expect(authFormTitleStyle(22).fontSize).toBe(22);
    expect(authFormTitleStyle(24).fontSize).toBe(24);
    expect(AUTH_FORM_PRIMARY_BTN_STYLE.background).toBe("var(--accent)");
    expect(AUTH_FORM_GHOST_BTN_STYLE.cursor).toBe("pointer");
  });

  it("bulk create folders modal chrome", () => {
    expect(BULK_FOLDER_OVERLAY_STYLE.zIndex).toBe(2000);
    expect(BULK_FOLDER_DIALOG_STYLE.width).toContain("580px");
    expect(bulkFolderBtnStyle("primary", false).background).toBe("var(--accent)");
    expect(bulkFolderBtnStyle("secondary", true).opacity).toBe(0.5);
    expect(bulkFolderBtnStyle("secondary", true).cursor).toBe("not-allowed");
  });
});
