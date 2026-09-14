// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HealthBreakdownDialog } from "../fleetHealthStrip";

afterEach(cleanup);

const HEALTH = {
  setId: "s1",
  setName: "Main Steel — Level 2",
  score: 72,
  grade: "C",
  band: { key: "at_risk", label: "At Risk", color: "var(--cmd-warn)" },
  stage: "BFA",
  factors: [
    { key: "approval", label: "Approval progress", weight: 25, deduction: 0, score: 25, severity: "ok", detail: "Approved" },
    { key: "due", label: "Due date", weight: 20, deduction: 12, score: 8, severity: "high", detail: "Overdue 4 days" },
    { key: "rfi", label: "Open RFIs", weight: 15, deduction: 5, score: 10, severity: "medium", detail: "1 open RFI" },
    { key: "rev", label: "Revision churn", weight: 10, deduction: 10, score: 0, severity: "critical", detail: "R4" },
  ],
  issues: [] as unknown[],
};

// Mirrors drawingRegisterTable: a Health chip opens the dialog; onClose clears it.
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>C 72</button>
      {open && <HealthBreakdownDialog health={HEALTH} onClose={() => setOpen(false)} />}
    </>
  );
}

function openFromChip() {
  render(<Harness />);
  const chip = screen.getByRole("button", { name: "C 72" });
  chip.focus();
  fireEvent.click(chip);
  return chip;
}

describe("HealthBreakdownDialog", () => {
  it("is a labelled modal dialog, and not a Radix one", () => {
    openFromChip();
    const dialog = screen.getByRole("dialog", { name: "Main Steel — Level 2" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Radix stamps data-state on its content and overlay.
    expect(document.querySelector("[data-state]")).toBeNull();
  });

  it("moves focus into the dialog; Escape closes it and returns focus to the chip", () => {
    const chip = openFromChip();
    expect(screen.getByRole("button", { name: "Close health breakdown" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
  });

  it("closes from the close button", () => {
    const chip = openFromChip();
    fireEvent.click(screen.getByRole("button", { name: "Close health breakdown" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
  });

  it("closes on a scrim click, but not on a click inside the panel", () => {
    openFromChip();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Tab and Shift+Tab inside the dialog", () => {
    openFromChip();
    const close = screen.getByRole("button", { name: "Close health breakdown" });
    fireEvent.keyDown(close, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();
  });

  it("lists every factor with the points lost against its weight", () => {
    openFromChip();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("AT RISK · STAGE BFA · 28 PTS DEDUCTED");
    expect(dialog).toHaveTextContent("ok / 25");
    expect(dialog).toHaveTextContent("−12 / 20");
    expect(dialog).toHaveTextContent("−5 / 15");
    expect(dialog).toHaveTextContent("−10 / 10");
  });

  it("colours everything from theme tokens: no hex or rgb() inside the dialog", () => {
    openFromChip();
    const dialog = screen.getByRole("dialog");
    // jsdom normalises hex colours to rgb(), so check for both.
    for (const el of [dialog, ...Array.from(dialog.querySelectorAll("[style]"))]) {
      expect(el.getAttribute("style") ?? "").not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });
});
