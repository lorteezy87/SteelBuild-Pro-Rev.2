import { describe, expect, it } from "vitest";
import {
  C,
  F,
  NAV_LINKS,
  EXEC_METRICS,
  VALUE_CARDS,
  MODULES,
  WORKFLOW,
  PROOF_POINTS,
  monoLabel,
  canSubmitCredentials,
} from "../landing/landingPageHelpers";
import {
  ACTION_ITEM_INPUT_STYLE,
  ACTION_ITEM_LABEL_STYLE,
} from "@/components/actionitems/actionItemFormModalHelpers";
import {
  CONTACT_INPUT_STYLE,
  CONTACT_LABEL_STYLE,
} from "@/components/contacts/contactFormModalHelpers";
import {
  DELIVERY_INPUT_STYLE,
  DELIVERY_LABEL_STYLE,
} from "@/components/deliveries/deliveryFormModalHelpers";
import {
  STATUS_BADGE_MAP,
  STATUS_BADGE_DEFAULT,
} from "@/components/shared/statusBadgeHelpers";
import { APPROVED_STAGES } from "@/components/shared/workflowValidation";
import { LIFECYCLE_OPTIONS } from "@/components/pieceControl/packageBoard.derive";
import {
  kpiScatterColors,
  kpiBarColors,
} from "../reports/financialKpisHelpers";

describe("residual catalog atoms batch D", () => {
  it("landing brand tokens and catalogs", () => {
    expect(C.amber).toBe("#F5A800");
    expect(F.mono).toContain("Mono");
    expect(NAV_LINKS.some((l) => l.target === "demo")).toBe(true);
    expect(EXEC_METRICS).toHaveLength(4);
    expect(VALUE_CARDS).toHaveLength(3);
    expect(MODULES.length).toBeGreaterThanOrEqual(6);
    expect(WORKFLOW[0].step).toBe("01");
    expect(PROOF_POINTS.length).toBeGreaterThan(0);
    expect(monoLabel().fontSize).toBe(10);
    expect(canSubmitCredentials("a@b.c", "x")).toBe(true);
  });

  it("form chrome styles", () => {
    expect(ACTION_ITEM_INPUT_STYLE.borderRadius).toBe(8);
    expect(ACTION_ITEM_LABEL_STYLE.fontSize).toBe(9);
    expect(CONTACT_INPUT_STYLE.fontSize).toBe(12);
    expect(CONTACT_LABEL_STYLE.textTransform).toBe("uppercase");
    expect(DELIVERY_INPUT_STYLE.padding).toBe("10px 12px");
    expect(DELIVERY_LABEL_STYLE.fontSize).toBe(8);
  });

  it("status badge map", () => {
    expect(STATUS_BADGE_MAP.Open.color).toContain("warning");
    expect(STATUS_BADGE_MAP.Complete.color).toContain("success");
    expect(STATUS_BADGE_DEFAULT.color).toContain("muted");
  });

  it("workflow approved stages and lifecycle options", () => {
    expect(APPROVED_STAGES).toContain("IFC");
    expect(APPROVED_STAGES).toContain("Released");
    expect(LIFECYCLE_OPTIONS.length).toBeGreaterThan(0);
    expect(Array.isArray(LIFECYCLE_OPTIONS[0])).toBe(true);
  });

  it("financial kpi chart color builders", () => {
    const theme = {
      colors: { success: "g", warning: "w", error: "e" },
      text: { muted: "m" },
    };
    expect(kpiScatterColors(theme).risk).toBe("e");
    expect(kpiBarColors(theme).watch).toBe("w");
  });
});
