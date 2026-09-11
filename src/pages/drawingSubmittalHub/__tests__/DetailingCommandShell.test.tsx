// @vitest-environment jsdom
/**
 * The Detailing Control Center's shell: 2026's compact command header (owner
 * decision 2, 2026-09-11) with the tab strip as its bottom row, the KPI strip
 * on the Control Board only, and the status line on every other tab.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";
import { ClipboardList, Gauge, ShieldAlert } from "lucide-react";

// The eyebrow follows the signed-in user's Show Project Numbers preference.
const prefs = vi.hoisted(() => ({ show_project_numbers: true }));
vi.mock("@/hooks/useUserPrefs", () => ({ useUserPrefs: () => prefs }));

import { DetailingCommandShell, DetailingNoProject, revealScrollLeft } from "../DetailingCommandShell";
import type { DetailingKpis } from "../DetailingCommandShell";
import { DCC_SUBTITLE, projectEyebrow } from "../DetailingCommandHeader";

afterEach(() => {
  cleanup();
  prefs.show_project_numbers = true;
  vi.restoreAllMocks();
});

const KPIS: DetailingKpis = {
  totalSets: 4, totalSheets: 20, released: 1, inReview: 2,
  submittalsTotal: 3, submittalsPending: 1, needsAction: 0,
  overdue: 0, atRisk: 0, overdueDrawingSets: 0, overdueUnlinkedSubmittals: 0,
  fabReadyNumerator: 1, fabReadyDenominator: 4, fabReadyPercent: 25,
  openItems: 0, fleetAverageScore: null,
};

const TABS = [
  { key: "overview", label: "Control Board", icon: Gauge },
  { key: "submittals", label: "Submittal Register", icon: ClipboardList },
  { key: "holds", label: "Holds & Blockers", icon: ShieldAlert },
];

const STATUS_LINE = "4 sets · 0 open · 0 overdue · 0 at risk · Fab Ready 1/4";

function mount(props: Partial<ComponentProps<typeof DetailingCommandShell>> = {}) {
  const onTab = vi.fn();
  render(
    <MemoryRouter>
      <DetailingCommandShell tabs={TABS} activeTab="overview" onTab={onTab} kpis={KPIS} tabCounts={{}} {...props}>
        <p>panel body</p>
      </DetailingCommandShell>
    </MemoryRouter>,
  );
  return { onTab };
}

const tab = (name: RegExp | string) => screen.getByRole("tab", { name });

/** Every inline style on the page; the DCC's colours come from classes and tokens. */
const renderedStyles = () => [...document.body.querySelectorAll("[style]")].map((el) => el.getAttribute("style") ?? "");

describe("DetailingCommandShell — compact header", () => {
  it("shows the project eyebrow and an active-holds badge that matches the Holds tab count", () => {
    mount({ projectName: "Mesa Gateway", projectNumber: "24-117", activeHolds: 3, tabCounts: { holds: 3 }, alertTabs: ["holds"] });
    expect(screen.getByText("24-117 · Mesa Gateway")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3 Sheets On Hold" })).toHaveClass("cmd-chip--warn");
    expect(within(tab(/Holds & Blockers/)).getByText("3")).toBeInTheDocument();
  });

  it("drops the project number when the Show Project Numbers preference is off", () => {
    prefs.show_project_numbers = false;
    mount({ projectName: "Mesa Gateway", projectNumber: "24-117" });
    expect(screen.getByText("Mesa Gateway")).toBeInTheDocument();
    expect(screen.queryByText(/24-117/)).not.toBeInTheDocument();
  });

  it("opens Holds & Blockers from the badge", () => {
    const { onTab } = mount({ activeHolds: 2 });
    fireEvent.click(screen.getByRole("button", { name: "2 Sheets On Hold" }));
    expect(onTab).toHaveBeenCalledWith("holds");
  });

  it("says 'No holds' only once the count is known, and nothing before", () => {
    const { onTab } = mount({ activeHolds: 0 });
    fireEvent.click(screen.getByRole("button", { name: "No holds" }));
    expect(onTab).toHaveBeenCalledWith("holds");
    cleanup();

    mount({}); // holds query hasn't answered
    expect(screen.queryByText("No holds")).not.toBeInTheDocument();
    expect(screen.queryByText(/On Hold$/)).not.toBeInTheDocument();
    cleanup();

    // The holds query answers on its own: a known count shows even while the
    // sheet and submittal queries are still loading.
    mount({ activeHolds: 2, isLoading: true });
    expect(screen.getByRole("button", { name: "2 Sheets On Hold" })).toBeInTheDocument();
  });

  it("uses the singular for one held sheet", () => {
    mount({ activeHolds: 1 });
    expect(screen.getByText("1 Sheet On Hold")).toBeInTheDocument();
  });

  it("has exactly one h1, the page title, on every tab", () => {
    for (const activeTab of ["overview", "submittals", "holds"]) {
      mount({ activeTab, activeHolds: 2, projectName: "Mesa Gateway" });
      const h1s = screen.getAllByRole("heading", { level: 1 });
      expect(h1s).toHaveLength(1);
      // The badge sits beside the h1, so the heading's name is just the title.
      expect(h1s[0]).toHaveAccessibleName("Detailing Control Center");
      cleanup();
    }
  });

  it("states where stage comes from without 2026's false 'never from drawings.stage'", () => {
    mount();
    expect(screen.getByText(DCC_SUBTITLE)).toBeInTheDocument();
    expect(DCC_SUBTITLE).toMatch(/governing submittal/);
    expect(DCC_SUBTITLE).toMatch(/sheet stage/);
    expect(DCC_SUBTITLE).not.toMatch(/never/i);
  });

  it("keeps the header's actions in the header, beside the title and above the tabs", () => {
    mount({ actions: <button type="button">Lead Times</button> });
    const header = screen.getByRole("heading", { level: 1 }).closest("header");
    const leadTimes = screen.getByRole("button", { name: "Lead Times" });
    expect(header).not.toBeNull();
    expect(leadTimes.closest(".detailing-cc__actions")).not.toBeNull();
    expect(header).toContainElement(leadTimes);
    expect(header).toContainElement(screen.getByRole("tablist"));
  });
});

describe("DetailingCommandShell — KPI strip and status line", () => {
  it("puts the KPI strip in the Control Board's panel, and the status line on every other tab", () => {
    mount({ activeTab: "overview" });
    expect(within(screen.getByRole("tabpanel")).getByText("Submittals Needing Action")).toBeInTheDocument();
    expect(screen.queryByText(STATUS_LINE)).not.toBeInTheDocument();
    cleanup();

    for (const activeTab of ["submittals", "holds"]) {
      mount({ activeTab });
      expect(screen.queryByText("Submittals Needing Action")).not.toBeInTheDocument();
      expect(screen.getByText(STATUS_LINE)).toBeInTheDocument();
      cleanup();
    }
  });

  it("shows em dashes, never zeros, while the queries load", () => {
    mount({ activeTab: "holds", isLoading: true });
    expect(screen.getByText("— sets · — open · — overdue · — at risk · Fab Ready —")).toBeInTheDocument();
    cleanup();

    mount({ activeTab: "overview", isLoading: true });
    expect(within(screen.getByRole("tabpanel")).getAllByText("—")).toHaveLength(7);
  });
});

describe("DetailingCommandShell — tab strip", () => {
  it("wires each tab to the panel and reports tab clicks", () => {
    const { onTab } = mount({ activeTab: "holds" });
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "dcc-panel");
    expect(panel).toHaveAttribute("aria-labelledby", "dcc-tab-holds");
    expect(panel).toHaveAttribute("data-hub-panel", "holds");
    expect(panel).toHaveTextContent("panel body");
    for (const t of screen.getAllByRole("tab")) expect(t).toHaveAttribute("aria-controls", "dcc-panel");
    expect(tab(/Holds & Blockers/)).toHaveAttribute("aria-selected", "true");
    expect(tab(/Holds & Blockers/)).toHaveAttribute("data-hub-tab", "holds");
    fireEvent.click(tab(/Control Board/));
    expect(onTab).toHaveBeenCalledWith("overview");
  });

  it("keeps only the active tab in the Tab order", () => {
    mount({ activeTab: "submittals" });
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
  });

  it("moves focus and activates with ArrowRight/ArrowLeft (wrapping), Home and End", () => {
    const { onTab } = mount({ activeTab: "overview" });
    const [board, register, holds] = screen.getAllByRole("tab");
    board.focus();

    fireEvent.keyDown(board, { key: "ArrowRight" });
    expect(register).toHaveFocus();
    expect(onTab).toHaveBeenLastCalledWith("submittals");

    fireEvent.keyDown(register, { key: "End" });
    expect(holds).toHaveFocus();
    expect(onTab).toHaveBeenLastCalledWith("holds");

    fireEvent.keyDown(holds, { key: "ArrowRight" });
    expect(board).toHaveFocus();
    expect(onTab).toHaveBeenLastCalledWith("overview");

    fireEvent.keyDown(board, { key: "ArrowLeft" });
    expect(holds).toHaveFocus();
    expect(onTab).toHaveBeenLastCalledWith("holds");

    fireEvent.keyDown(holds, { key: "Home" });
    expect(board).toHaveFocus();
    expect(onTab).toHaveBeenLastCalledWith("overview");

    onTab.mockClear();
    fireEvent.keyDown(board, { key: "ArrowDown" });
    fireEvent.keyDown(board, { key: "a" });
    expect(onTab).not.toHaveBeenCalled();
    expect(board).toHaveFocus();
  });

  it("puts the count in the tab's accessible name, and keeps the label as its own text", () => {
    mount({ tabCounts: { holds: 2, submittals: 14 }, alertTabs: ["holds"] });
    expect(tab("Holds & Blockers, 2")).toBeInTheDocument();
    expect(tab("Submittal Register, 14")).toBeInTheDocument();
    expect(tab("Control Board")).toBeInTheDocument();
    // The hub's tests find tabs by their label text.
    expect(screen.getByText("Holds & Blockers")).toBeInTheDocument();
    expect(within(tab("Holds & Blockers, 2")).getByText("2")).toHaveClass("is-alert");
    expect(within(tab("Submittal Register, 14")).getByText("14")).not.toHaveClass("is-alert");
  });

  it("styles with classes and tokens: the strip has no inline styles, and no style attribute holds a hex colour", () => {
    mount({ activeTab: "holds", activeHolds: 2, tabCounts: { holds: 2, submittals: 5 }, alertTabs: ["holds"], isLoading: true });
    expect(screen.getByRole("tablist").querySelectorAll("[style]")).toHaveLength(0);
    for (const style of renderedStyles()) expect(style).not.toContain("#");
    cleanup();

    mount({ activeTab: "overview", activeHolds: 0 });
    for (const style of renderedStyles()) expect(style).not.toContain("#");
  });

  it("scrolls the active tab into view on load, sideways only", async () => {
    // jsdom has no layout, so give the strip and its tabs one: a 400px strip
    // with the active Holds tab starting at 700px.
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.hubTab === "holds" ? 700 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.hubTab ? 150 : 0;
    });
    vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function (this: Element) {
      return this.getAttribute("role") === "tablist" ? 400 : 0;
    });

    mount({ activeTab: "holds" });
    const strip = screen.getByRole("tablist");
    // 700 + 150 + the 16px gutter, less the 400px it can show.
    await waitFor(() => expect(strip.scrollLeft).toBe(466));
  });
});

describe("revealScrollLeft", () => {
  it("leaves a tab that's already in view alone", () => {
    expect(revealScrollLeft({ scrollLeft: 0, width: 400 }, { left: 100, width: 150 })).toBeNull();
  });

  it("scrolls just far enough to show a tab past the end, gutter included", () => {
    expect(revealScrollLeft({ scrollLeft: 0, width: 400 }, { left: 700, width: 150 })).toBe(466);
  });

  it("scrolls back to a tab before the start, never below 0", () => {
    expect(revealScrollLeft({ scrollLeft: 500, width: 400 }, { left: 116, width: 150 })).toBe(100);
    expect(revealScrollLeft({ scrollLeft: 50, width: 400 }, { left: 10, width: 150 })).toBe(0);
  });
});

describe("projectEyebrow", () => {
  it("follows the Show Project Numbers preference, like the project pill", () => {
    expect(projectEyebrow("Test Project", "26179", true)).toBe("26179 · Test Project");
    expect(projectEyebrow("Test Project", "26179", false)).toBe("Test Project");
    expect(projectEyebrow("Test Project", null, true)).toBe("Test Project");
  });

  it("falls back to the number when there's no name, so the project is still identified", () => {
    expect(projectEyebrow("", "26179", false)).toBe("26179");
    expect(projectEyebrow(undefined, undefined, true)).toBe("");
  });
});

describe("DetailingNoProject", () => {
  it("explains what to do under the compact header, with no tabs or badge", () => {
    render(<DetailingNoProject />);
    expect(screen.getByRole("status")).toHaveTextContent("No active project");
    expect(screen.getByRole("status")).toHaveTextContent(/Pick a project/);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const style of renderedStyles()) expect(style).not.toContain("#");
  });
});
