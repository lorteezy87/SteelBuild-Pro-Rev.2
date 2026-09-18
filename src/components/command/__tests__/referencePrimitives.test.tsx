// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AttentionQueue,
  OperationalSummary,
  PageHeader,
  QuickAccess,
} from "@/components/command";

describe("SteelBuild reference command primitives", () => {
  it("renders a compact operational page header", () => {
    render(
      <PageHeader
        eyebrow="BIMC ED Expansion / Production"
        title="Fabrication Control"
        subtitle="18 work packages"
      />,
    );

    expect(screen.getByText("BIMC ED Expansion / Production")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fabrication Control" })).toBeInTheDocument();
    expect(screen.getByText("18 work packages")).toBeInTheDocument();
  });

  it("renders dense operational metrics without inventing card semantics", () => {
    render(
      <OperationalSummary
        metrics={[
          { label: "Pieces", value: "327" },
          { label: "Tons", value: "94.6" },
        ]}
      />,
    );

    expect(screen.getByText("327")).toBeInTheDocument();
    expect(screen.getByText("94.6")).toBeInTheDocument();
  });

  it("renders management attention with ownership and next action", () => {
    const onOpen = vi.fn();
    render(
      <AttentionQueue
        items={[
          {
            id: "rfi-18",
            issue: "RFI 018",
            deadline: "Sep 18",
            risk: "Fab release",
            owner: "WT",
            nextAction: "Revise beam",
            tone: "danger",
            onOpen,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /RFI 018/i }));
    expect(screen.getByText("WT")).toBeInTheDocument();
    expect(screen.getByText("Sep 18")).toBeInTheDocument();
    expect(screen.getByText("Revise beam")).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("renders quick access as compact navigation rather than module cards", () => {
    const onSelect = vi.fn();
    render(
      <QuickAccess
        items={[{ page: "RFIs", label: "RFIs", metric: "3 overdue" }]}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /RFIs/i }));
    expect(onSelect).toHaveBeenCalledWith("RFIs");
    expect(screen.getByText("3 overdue")).toBeInTheDocument();
  });
});
