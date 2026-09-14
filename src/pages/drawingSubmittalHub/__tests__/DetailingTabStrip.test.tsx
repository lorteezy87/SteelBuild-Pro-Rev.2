// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClipboardList, Gauge, ShieldAlert } from "lucide-react";
import { DetailingTabStrip, revealScrollLeft } from "../DetailingTabStrip";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TABS = [
  { key: "overview", label: "Control Board", icon: Gauge },
  { key: "submittals", label: "Submittal Register", icon: ClipboardList },
  { key: "holds", label: "Holds & Blockers", icon: ShieldAlert },
];

function mount(activeTab = "overview") {
  const onTab = vi.fn();
  render(
    <DetailingTabStrip
      tabs={TABS}
      activeTab={activeTab}
      onTab={onTab}
      tabCounts={{ holds: 2 }}
      alertTabs={["holds"]}
    />,
  );
  return onTab;
}

describe("DetailingTabStrip", () => {
  it("uses manual activation with wrapping roving focus", () => {
    const onTab = mount();
    const [board, register, holds] = screen.getAllByRole("tab");
    board.focus();

    fireEvent.keyDown(board, { key: "ArrowLeft" });
    expect(holds).toHaveFocus();
    expect(onTab).not.toHaveBeenCalled();

    fireEvent.keyDown(holds, { key: "ArrowRight" });
    expect(board).toHaveFocus();
    fireEvent.keyDown(board, { key: "End" });
    expect(holds).toHaveFocus();
    fireEvent.click(holds);
    expect(onTab).toHaveBeenCalledWith("holds");
    expect(holds).toHaveAttribute("aria-selected", "false");
  });

  it("restores the active tab as the Tab stop after focus leaves", () => {
    mount("submittals");
    const [board, register, holds] = screen.getAllByRole("tab");
    register.focus();
    fireEvent.keyDown(register, { key: "End" });
    expect(holds).toHaveAttribute("tabindex", "0");

    fireEvent.focusOut(holds, { relatedTarget: document.body });
    expect(board).toHaveAttribute("tabindex", "-1");
    expect(register).toHaveAttribute("tabindex", "0");
    expect(holds).toHaveAttribute("tabindex", "-1");
  });

  it("reveals the selected tab after the scheduled animation frame", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(700);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(150);
    vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function (this: Element) {
      return this.getAttribute("role") === "tablist" ? 400 : 0;
    });

    mount("holds");
    const strip = screen.getByRole("tablist");
    await waitFor(() => expect(strip.scrollLeft).toBe(466));
    expect(revealScrollLeft(
      { scrollLeft: 466, width: 400 },
      { left: 700, width: 150 },
    )).toBeNull();
  });
});
