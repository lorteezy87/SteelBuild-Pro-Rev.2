// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusChip } from "../scheduleGanttBars";

describe("StatusChip", () => {
  it("labels an overdue task Overdue without claiming its stored status is Delayed", () => {
    render(<StatusChip status="In Progress" overdue />);
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.queryByText("Delayed")).toBeNull();
  });

  it("keeps an explicitly delayed task labeled Delayed", () => {
    render(<StatusChip status="Delayed" overdue />);
    expect(screen.getByText("Delayed")).toBeInTheDocument();
  });
});
