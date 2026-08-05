import { describe, expect, it } from "vitest";
import {
  ONBOARDING_H_STYLE,
  ONBOARDING_P_STYLE,
} from "../orgOnboarding/orgOnboardingPageHelpers";
import { chartTooltipStyle } from "../reports/financialKpisHelpers";

describe("residual catalog atoms batch I", () => {
  it("org onboarding typography styles", () => {
    expect(ONBOARDING_H_STYLE.fontSize).toBe(24);
    expect(ONBOARDING_P_STYLE.lineHeight).toBe(1.6);
  });

  it("financial kpi tooltip style builder", () => {
    const s = chartTooltipStyle({
      tooltip: {
        background: "bg",
        border: "bd",
        borderRadius: 4,
        color: "fg",
      },
    });
    expect(s.background).toBe("bg");
    expect(s.boxShadow).toBe("var(--shadow-card)");
  });
});
