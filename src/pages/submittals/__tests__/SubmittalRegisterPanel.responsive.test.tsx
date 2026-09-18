// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import SubmittalRegisterPanel from "../SubmittalRegisterPanel";

// Slot contents stand in for the page-owned queries/mutations. The actual panel,
// filters, resize handling, visibility and focus transitions run unchanged.
function RegisterFixture() {
  const [detailOpen, setDetailOpen] = useState(false);
  return <SubmittalRegisterPanel
    detailOpen={detailOpen}
    rows={[]} filtered={[]}
    stats={{ total: 0, pending: 0, approved: 0, rejected: 0, overdue: 0, pendingEor: 0 }}
    reviewsAtRisk={0} filterStatus="all" filterBIC="all" search=""
    onFilterStatus={() => {}} onFilterBIC={() => {}} onSearch={() => {}}
    selectedIds={new Set()} allSelected={false} toggleAll={() => {}}
    projectLabel="Fixture" canCreate onNewSubmittal={() => {}} onBulkAdd={() => {}}
    list={<><input aria-label="List draft" defaultValue="" /><button onClick={() => setDetailOpen(true)}>Open SUB-001</button></>}
    detail={<><span>Selected submittal</span><button onClick={() => setDetailOpen(false)}>Back to register</button></>}
  />;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/**
 * The panel currently renders "New Submittal" TWICE while its controls are
 * visible — once in the PageHeader actions and once as the FilterBar primary.
 * These tests are about responsive visibility, not about how many entry points
 * the page offers, so they assert on every match rather than pinning the count.
 */
function expectNewSubmittalVisible() {
  const buttons = screen.getAllByRole("button", { name: "New Submittal" });
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) expect(button).toBeVisible();
}

describe("Submittal register responsive navigation", () => {
  it("opens only the selected mobile detail and returns to the preserved list", () => {
    vi.stubGlobal("innerWidth", 390);
    render(<RegisterFixture />);
    const list = screen.getByRole("region", { name: "Submittal register list" });
    expect(screen.queryByRole("region", { name: "Submittal details" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("List draft"), { target: { value: "keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Open SUB-001" }));
    const detail = screen.getByRole("region", { name: "Submittal details" });
    expect(detail).toHaveFocus();
    expect(list).not.toBeVisible();
    // The whole controls block (PageHeader + FilterBar) drops out of the
    // accessibility tree while a mobile detail is open.
    expect(screen.queryAllByRole("button", { name: "New Submittal" })).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Back to register" }));
    expect(list).toBeVisible();
    expect(list).toHaveFocus();
    expect(screen.getByLabelText("List draft")).toHaveValue("keep this draft");
    expect(detail).not.toBeVisible();
    expectNewSubmittalVisible();
  });

  it("retains the desktop split and adapts an open detail when resized to mobile", () => {
    vi.stubGlobal("innerWidth", 1440);
    render(<RegisterFixture />);
    const list = screen.getByRole("region", { name: "Submittal register list" });
    const detail = screen.getByRole("region", { name: "Submittal details" });
    expect(list).toBeVisible();
    expect(detail).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open SUB-001" }));
    expect(list).toBeVisible();
    expectNewSubmittalVisible();
    act(() => { vi.stubGlobal("innerWidth", 390); window.dispatchEvent(new Event("resize")); });
    expect(list).not.toBeVisible();
    expect(detail).toBeVisible();
    expect(detail).toHaveFocus();
    act(() => { vi.stubGlobal("innerWidth", 1440); window.dispatchEvent(new Event("resize")); });
    expect(list).toBeVisible();
    expect(detail).toBeVisible();
  });
});
