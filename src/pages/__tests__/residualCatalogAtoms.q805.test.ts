import { describe, expect, it } from "vitest";
import {
  IMPORT_TABLE_TH_STYLE,
  IMPORT_TABLE_TD_STYLE,
} from "@/components/shared/importTableChromeHelpers";
import {
  SIGNOFF_LABEL_STYLE,
  SIGNOFF_INPUT_STYLE,
} from "@/components/drawings/signoffStampPanelHelpers";
import { FIELD_TASK_URGENCY_RANK } from "@/lib/field/fieldToday";
import { PHASE_SOURCE, FIELD_ACTIVITY_TYPES } from "@/lib/field/fieldPhase";

describe("residual catalog atoms batch Q", () => {
  it("shared import table chrome", () => {
    expect(IMPORT_TABLE_TH_STYLE.fontSize).toBe(9);
    expect(IMPORT_TABLE_TH_STYLE.textTransform).toBe("uppercase");
    expect(IMPORT_TABLE_TD_STYLE.padding).toBe("7px 10px");
  });

  it("signoff form chrome", () => {
    expect(SIGNOFF_LABEL_STYLE.textTransform).toBe("uppercase");
    expect(SIGNOFF_INPUT_STYLE.width).toBe("100%");
    expect(SIGNOFF_INPUT_STYLE.borderRadius).toBe(6);
  });

  it("field urgency and phase catalogs", () => {
    expect(FIELD_TASK_URGENCY_RANK.overdue).toBe(0);
    expect(FIELD_TASK_URGENCY_RANK.done).toBe(5);
    expect(PHASE_SOURCE.DERIVED).toBe("derived");
    expect(FIELD_ACTIVITY_TYPES.INSPECTION).toBe("Inspection");
  });
});
