// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import { ReadinessPanel, SequenceReadinessSection } from "../triageBoard";

afterEach(cleanup);

describe("drawing workflow evidence labels", () => {
  it("does not present a stage marker or missing schedule as production-ready", () => {
    render(
      <ReadinessPanel
        readiness={{ shopStageMarked: true, fieldStageMarked: true }}
        onToggle={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getByText("Shop stage marked")).toBeInTheDocument();
    expect(screen.getByText("Field stage marked")).toBeInTheDocument();
    expect(screen.getByText("Schedule unknown")).toBeInTheDocument();
    expect(screen.queryByText("Fab ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Erect ready")).not.toBeInTheDocument();
    expect(screen.getByTitle(/server fab-release gate/i)).toBeInTheDocument();
  });

  it("labels sequence totals as workflow markers and states the release limit", () => {
    render(<SequenceReadinessSection rows={[{
      sequence: "1", packageCount: 2, detailingPct: 100,
      shopStageCount: 2, fieldStageCount: 1, atRiskCount: 0,
    }]} />);

    expect(screen.getByText("Shop stage")).toBeInTheDocument();
    expect(screen.getByText("Field stage")).toBeInTheDocument();
    expect(screen.getByText("Stage position")).toBeInTheDocument();
    expect(screen.getByText(/percentage reflects workflow order, not work completed/)).toBeInTheDocument();
    expect(screen.getByText(/Production release requires the server gate/)).toBeInTheDocument();
  });
});
