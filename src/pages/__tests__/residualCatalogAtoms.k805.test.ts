import { describe, expect, it } from "vitest";
import {
  riskTone,
  AI_RISK_HEADER_STYLE,
  AI_RISK_COLUMNS_STYLE,
  AI_RISK_SECTION_STYLE,
  aiRiskPanelStyle,
  aiRiskScoreStyle,
} from "@/components/schedule/scheduleAiRiskCardHelpers";
import {
  commentStatusIcon,
  commentStatusBadgeStyle,
  commentAuthorInitials,
  extractMentions,
} from "@/components/collaboration/commentThreadHelpers";
import {
  resolveStageFilterLabel,
  activeFilterPillStyle,
  activeFilterXStyle,
} from "@/components/drawings/activeFilterPillsHelpers";
import {
  REVIEW_META_FIELD_STYLE,
  REVIEW_META_LABEL_STYLE,
} from "@/components/drawings/uploadSteps/reviewStepHelpers";
import { SKELETON_SHIMMER_STYLE } from "@/components/shared/loadingSkeletonHelpers";
import {
  MODEL3D_HINT_STYLE,
  MODEL3D_LINK_BTN,
} from "@/components/viewer3d/model3dTabHelpers";

describe("residual catalog atoms batch K", () => {
  it("schedule AI risk tone and styles", () => {
    expect(riskTone("HIGH")).toBe("var(--status-error)");
    expect(riskTone("MEDIUM")).toBe("var(--status-warning)");
    expect(riskTone("LOW")).toBe("var(--status-success)");
    expect(AI_RISK_HEADER_STYLE.display).toBe("flex");
    expect(AI_RISK_COLUMNS_STYLE.gridTemplateColumns).toContain("minmax");
    expect(AI_RISK_SECTION_STYLE.borderRadius).toBe(12);
    expect(aiRiskPanelStyle("red").border).toContain("red");
    expect(aiRiskScoreStyle("blue").width).toBe(48);
  });

  it("comment thread pure helpers", () => {
    expect(commentStatusIcon("addressed")).toBe("✓");
    expect(commentStatusIcon("rejected")).toBe("✗");
    expect(commentStatusIcon("open")).toBe("○");
    expect(commentStatusBadgeStyle("#abc").background).toBe("#abc");
    expect(commentAuthorInitials("Jane Doe")).toBe("JD");
    expect(commentAuthorInitials(null)).toBe("U");
    expect(extractMentions("hi @alice and @bob")).toEqual(["alice", "bob"]);
  });

  it("active filter pills and review/skeleton/model3d chrome", () => {
    expect(resolveStageFilterLabel("_overdue", [])).toBe("OVERDUE");
    expect(resolveStageFilterLabel("Released", [])).toBe("IFC ONLY");
    expect(resolveStageFilterLabel("ifc", [{ key: "ifc", label: "IFC" }])).toBe("IFC");
    const mono = { fontFamily: "var(--font-mono)" };
    expect(activeFilterPillStyle(mono).fontSize).toBe(9);
    expect(activeFilterXStyle(mono).cursor).toBe("pointer");
    expect(REVIEW_META_FIELD_STYLE.width).toBe("100%");
    expect(REVIEW_META_LABEL_STYLE.textTransform).toBe("uppercase");
    expect(SKELETON_SHIMMER_STYLE.animation).toContain("skeleton-shimmer");
    expect(MODEL3D_HINT_STYLE.fontSize).toBe(12);
    expect(MODEL3D_LINK_BTN.color).toBe("var(--accent)");
  });
});
