import { describe, expect, it } from "vitest";
import {
  RESOURCE_INPUT_STYLE,
  RESOURCE_LABEL_STYLE,
} from "@/components/resources/resourceFormModalHelpers";
import {
  SHEET_FORM_INPUT_STYLE,
  SHEET_FORM_LABEL_STYLE,
  SHEET_FORM_SELECT_STYLE,
} from "@/components/drawings/sheetFormModalStyleHelpers";
import {
  TASK_LIST_SELECT_STYLE,
  TASK_LIST_GRID,
} from "@/components/schedule/scheduleTaskListHelpers";
import {
  CUT_LIST_INPUT_STYLE,
  CUT_LIST_FIELD_LABEL,
  monoStyle,
} from "../feetInchesCalculator/feetInchesCalculatorHelpers";
import { monoStyle as regularMono } from "../regularCalculator/regularCalculatorHelpers";
import {
  RELEASE_GATE_BTN_BASE,
  RELEASE_GATE_MONO,
} from "@/components/submittals/releaseGateOverrideModalHelpers";
import { mono as decimalMono } from "../decimalFractionConverter/decimalFractionConverterHelpers";

describe("residual catalog atoms batch E", () => {
  it("resource form styles", () => {
    expect(RESOURCE_INPUT_STYLE.borderRadius).toBe("8px");
    expect(RESOURCE_LABEL_STYLE.letterSpacing).toBe("0.10em");
  });

  it("sheet form styles", () => {
    expect(SHEET_FORM_INPUT_STYLE.fontSize).toBe(13);
    expect(SHEET_FORM_LABEL_STYLE.fontWeight).toBe(700);
    expect(SHEET_FORM_SELECT_STYLE.fontSize).toBe(13);
  });

  it("schedule task list select + grid", () => {
    expect(TASK_LIST_SELECT_STYLE.fontSize).toBe(12);
    expect(TASK_LIST_GRID.split(" ")).toHaveLength(9);
  });

  it("feet cut-list styles and mono", () => {
    expect(CUT_LIST_INPUT_STYLE.borderRadius).toBe(6);
    expect(CUT_LIST_FIELD_LABEL.fontSize).toBe(9);
    expect(monoStyle.fontFamily).toContain("mono");
  });

  it("regular/decimal mono and release gate chrome", () => {
    expect(regularMono.fontFamily).toContain("mono");
    expect(decimalMono.fontFamily).toContain("mono");
    expect(RELEASE_GATE_MONO.fontFamily).toContain("mono");
    expect(RELEASE_GATE_BTN_BASE.textTransform).toBe("uppercase");
  });
});
