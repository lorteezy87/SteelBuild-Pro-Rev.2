// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DateRiskCell,
  DetailRail,
  ImpactBadge,
  StatusBadge,
  WorkflowStage,
} from "@/components/command";

describe("Wave 2 command primitives", () => {
  it("renders status and impact meaning as text, not color alone", () => {
    render(
      <div>
        <StatusBadge label="Released" tone="success" />
        <ImpactBadge label="Fab release" level="critical" />
      </div>,
    );

    expect(screen.getByText("Released")).toHaveAttribute("data-tone", "success");
    expect(screen.getByText("Fab release")).toHaveAttribute("data-impact", "critical");
    expect(screen.getByLabelText("Impact: Fab release · critical")).toBeInTheDocument();
  });

  it("keeps unknown date evidence explicit", () => {
    render(
      <DateRiskCell
        label="Required by"
        value={null}
        risk="unknown"
        detail="Required date unavailable"
      />,
    );

    expect(screen.getByText("Required by")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toHaveAttribute("data-date-risk", "unknown");
    expect(screen.getByText("Required date unavailable")).toBeInTheDocument();
  });

  it("shows workflow stage state labels for current and blocked work", () => {
    render(
      <WorkflowStage
        currentStage="bfa"
        stages={[
          { id: "ifa", label: "IFA", state: "complete" },
          { id: "bfa", label: "BFA", state: "current" },
          { id: "ifc", label: "IFC", state: "blocked", detail: "RFI 018" },
        ]}
      />,
    );

    expect(screen.getByLabelText("Workflow stages")).toBeInTheDocument();
    expect(screen.getByText("BFA").closest("li")).toHaveAttribute("data-stage-state", "current");
    expect(screen.getByText("IFC").closest("li")).toHaveAttribute("data-stage-state", "blocked");
    expect(screen.getByText("RFI 018")).toBeInTheDocument();
  });

  it("renders a compact detail rail with explicit section values", () => {
    render(
      <DetailRail
        title="Operational details"
        sections={[
          { key: "bic", label: "Ball in Court", value: "GC" },
          { key: "risk", label: "Impact", value: "Fab blocked", tone: "danger", detail: "2 IFC sheets missing" },
        ]}
        actions={<button type="button">Open linked WP</button>}
      />,
    );

    expect(screen.getByRole("complementary", { name: "Operational details" })).toBeInTheDocument();
    expect(screen.getByText("Ball in Court")).toBeInTheDocument();
    expect(screen.getByText("GC")).toBeInTheDocument();
    expect(screen.getByText("Fab blocked")).toHaveAttribute("data-tone", "danger");
    expect(screen.getByText("2 IFC sheets missing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open linked WP" })).toBeInTheDocument();
  });
});
