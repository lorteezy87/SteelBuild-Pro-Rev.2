import { describe, expect, it } from "vitest";
import {
  headerCellStyle,
  crewCellStyle,
  dayCellStyle,
  toolBtn,
  fieldPlanBlockerChipColors,
} from "@/pages/fieldPlan/fieldPlanStyleHelpers";
import {
  executiveTooltipStyle,
  executiveCardStyle,
  executiveCardTitle,
} from "@/pages/executiveView/executiveViewStyleHelpers";
import {
  cardStyle as steelCard,
  inputStyle as steelInput,
  labelStyle as steelLabel,
} from "@/pages/steelWeightCalculator/steelWeightCalculatorStyleHelpers";
import {
  cardStyle as dfCard,
  inputStyle as dfInput,
  selectStyle as dfSelect,
  labelStyle as dfLabel,
} from "@/pages/decimalFractionConverter/decimalFractionConverterHelpers";

describe("residual catalog atoms batch AD", () => {
  it("field plan board cell chrome and blocker severity", () => {
    expect(headerCellStyle.fontSize).toBe(9);
    expect(crewCellStyle.fontFamily).toBe("var(--font-display)");
    expect(dayCellStyle.minHeight).toBe(80);
    expect(toolBtn.cursor).toBe("pointer");
    const danger = fieldPlanBlockerChipColors("danger");
    const warn = fieldPlanBlockerChipColors("warn");
    const ok = fieldPlanBlockerChipColors("info");
    expect(danger.color).toBe("var(--status-error)");
    expect(warn.bg).toBe("var(--warning-muted)");
    expect(ok.color).toBe("var(--status-success)");
  });

  it("executive view chart/card tokens", () => {
    expect(executiveTooltipStyle.contentStyle.fontFamily).toBe("var(--font-mono)");
    expect(executiveCardStyle.borderRadius).toBe("var(--radius-card)");
    expect(executiveCardTitle.textTransform).toBe("uppercase");
  });

  it("steel weight and decimal converter form chrome", () => {
    expect(steelCard.borderRadius).toBe(8);
    expect(steelInput.width).toBe("100%");
    expect(steelLabel.fontSize).toBe(9);
    expect(dfCard.borderRadius).toBe(12);
    expect(dfInput.fontSize).toBe(14);
    expect(dfSelect.cursor).toBe("pointer");
    expect(dfLabel.letterSpacing).toBe("0.14em");
  });
});
