import { describe, expect, it } from "vitest";
import {
  IMPORT_BTN_PRIMARY as ShipPrimary,
  IMPORT_BTN_GHOST as ShipGhost,
} from "@/components/deliveries/shippingTicketImportModalHelpers";
import {
  IMPORT_BTN_PRIMARY as CoPrimary,
  IMPORT_BTN_GHOST as CoGhost,
} from "@/components/changeorders/changeOrderImportHelpers";
import {
  IMPORT_BTN_PRIMARY as WbsPrimary,
  IMPORT_BTN_GHOST as WbsGhost,
  AI_ACCENT as WbsAI,
} from "@/components/schedule/wbsBuilderModalHelpers";
import {
  RENAME_SET_BTN_PRIMARY,
  RENAME_SET_BTN_GHOST,
  RENAME_SET_BTN_ICON,
} from "@/components/drawings/renameSetModalStyleHelpers";
import {
  SIGNOFF_BTN_PRIMARY,
  SIGNOFF_BTN_GHOST,
  signoffQueryKey,
} from "@/components/drawings/signoffStampPanelHelpers";
import { bulkEditSelectStyle } from "@/components/drawings/bulkEditModalStyleHelpers";

describe("residual catalog atoms batch F", () => {
  it("import modal button chrome", () => {
    expect(ShipPrimary.padding).toBe("8px 22px");
    expect(ShipGhost.background).toBe("transparent");
    expect(CoPrimary.color).toBe("var(--on-accent)");
    expect(CoGhost.border).toContain("border");
    expect(WbsPrimary.fontSize).toBe(11);
    expect(WbsGhost.textTransform).toBe("uppercase");
    expect(WbsAI).toContain("ai-accent");
  });

  it("rename set and signoff button chrome", () => {
    expect(RENAME_SET_BTN_PRIMARY.background).toBe("var(--accent)");
    expect(RENAME_SET_BTN_GHOST.padding).toBe("7px 16px");
    expect(RENAME_SET_BTN_ICON.display).toBe("flex");
    expect(SIGNOFF_BTN_PRIMARY.borderRadius).toBe(6);
    expect(SIGNOFF_BTN_GHOST.padding).toBe("8px 14px");
    expect(signoffQueryKey("d1", "r1")).toEqual(["signoffs", "d1", "r1"]);
  });

  it("bulk edit select style helper", () => {
    expect(bulkEditSelectStyle({ width: "100%" }).cursor).toBe("pointer");
  });
});
