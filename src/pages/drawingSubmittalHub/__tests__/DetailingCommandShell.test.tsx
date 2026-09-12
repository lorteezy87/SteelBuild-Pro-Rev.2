// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";
import { Gauge, ShieldAlert } from "lucide-react";
import { DetailingCommandShell, DetailingNoProject } from "../DetailingCommandShell";
import type { DetailingKpis } from "../DetailingCommandShell";

afterEach(cleanup);

const KPIS: DetailingKpis = {
  totalSets: 4, totalSheets: 20, released: 1, inReview: 2,
  submittalsTotal: 3, submittalsPending: 1, needsAction: 0,
  overdue: 0, atRisk: 0, overdueDrawingSets: 0, overdueUnlinkedSubmittals: 0,
  fabReadyNumerator: 1, fabReadyDenominator: 4, fabReadyPercent: 25,
  openItems: 0, fleetAverageScore: null,
};

const TABS = [
  { key: "overview", label: "Control Board", icon: Gauge },
  { key: "holds", label: "Holds & Blockers", icon: ShieldAlert },
];

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

describe("DetailingCommandShell — 2026 header ideas", () => {
  it("shows the project line and an active-holds badge that matches the Holds tab count", () => {
    mount({ projectName: "24-117 · Mesa Gateway", activeHolds: 3, tabCounts: { holds: 3 }, alertTabs: ["holds"] });
    expect(screen.getByText("24-117 · Mesa Gateway")).toBeInTheDocument();
    expect(screen.getByText("3 Sheets On Hold")).toBeInTheDocument();
    const holdsTab = screen.getByRole("tab", { name: /Holds & Blockers/ });
    expect(within(holdsTab).getByText("3")).toBeInTheDocument();
  });

  it("says 'No holds' only once the count is known, and nothing while loading", () => {
    mount({ activeHolds: 0 });
    expect(screen.getByText("No holds")).toBeInTheDocument();
    cleanup();

    mount({}); // holds query hasn't answered
    expect(screen.queryByText("No holds")).not.toBeInTheDocument();
    expect(screen.queryByText(/On Hold$/)).not.toBeInTheDocument();
    cleanup();

    mount({ activeHolds: 2, isLoading: true });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("2 Sheets On Hold")).not.toBeInTheDocument();
  });

  it("uses the singular for one held sheet", () => {
    mount({ activeHolds: 1 });
    expect(screen.getByText("1 Sheet On Hold")).toBeInTheDocument();
  });

  it("wires each tab to the panel and reports tab clicks", () => {
    const { onTab } = mount({ activeTab: "holds" });
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "dcc-tab-holds");
    expect(screen.getByRole("tab", { name: /Holds & Blockers/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel body");
    fireEvent.click(screen.getByRole("tab", { name: /Control Board/ }));
    expect(onTab).toHaveBeenCalledWith("overview");
  });
});

describe("DetailingNoProject", () => {
  it("explains what to do instead of showing an empty, loading-looking hub", () => {
    render(<DetailingNoProject />);
    expect(screen.getByRole("status")).toHaveTextContent("No active project");
    expect(screen.getByRole("status")).toHaveTextContent(/Pick a project/);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});
