// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ProjectsControlCenter from "../ProjectsControlCenter";
import type { ProjectRecord } from "../projectsControlCenter.derive";

/**
 * Starting a project is the one action a workspace cannot do without, and it
 * was the easiest to lose:
 *
 *  - The only control lived in the register's filter bar, below the hero, six
 *    KPI tiles and three queues.
 *  - It rendered only when `onCreate` was non-null, and the shell nulled that
 *    at the plan's project limit and during any background refetch. Both
 *    removed the button outright, with no limit named and no upgrade path —
 *    indistinguishable from a product that cannot create projects, and from
 *    each other, though one is permanent and the other clears in a second.
 *  - An empty workspace was told "No projects match your filters", sending
 *    somebody with no projects to clear filters they never set.
 */

const project = (id: string, name: string): ProjectRecord => ({
  id,
  name,
  phase: "Detailing",
  health_status: "On Track",
  org_id: "org-a",
});

function mount(overrides: Partial<React.ComponentProps<typeof ProjectsControlCenter>> = {}) {
  const props: React.ComponentProps<typeof ProjectsControlCenter> = {
    projects: [project("a", "Alpha")],
    filtered: [project("a", "Alpha")],
    search: "",
    onSearch: () => {},
    phaseFilter: "all",
    onPhaseFilter: () => {},
    healthFilter: "all",
    onHealthFilter: () => {},
    onOpenProject: () => {},
    onCreate: () => {},
    ...overrides,
  };
  return render(<ProjectsControlCenter {...props} />);
}

const newProjectButtons = () => screen.getAllByRole("button", { name: /New Project/i });

describe("Projects — the create affordance", () => {
  it("offers New Project above the register, not only in the filter bar", () => {
    const onCreate = vi.fn();
    mount({ onCreate });
    const buttons = newProjectButtons();
    // One in the action row under the hero, one in the register's filter bar.
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    buttons.forEach((b) => expect(b).toBeEnabled());
    buttons[0].click();
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps New Project on screen, disabled and explained, when creation is blocked", () => {
    mount({
      onCreate: null,
      createBlockedReason: "1 of 1 projects used on Free plan. Upgrade to add another.",
    });
    const buttons = newProjectButtons();
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    buttons.forEach((b) => expect(b).toBeDisabled());
    expect(
      screen.getAllByText("1 of 1 projects used on Free plan. Upgrade to add another."),
    ).not.toHaveLength(0);
  });

  it("points each disabled button at the reason for assistive tech", () => {
    mount({ onCreate: null, createBlockedReason: "Refreshing the project register — try again in a moment." });
    for (const button of newProjectButtons()) {
      const describedBy = button.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)?.textContent).toBe(
        "Refreshing the project register — try again in a moment.",
      );
    }
  });

  // The regression that started this: a blocked state that renders nothing is
  // read as "the product cannot do this", and the limit is never named.
  it("never renders a blocked state as silence", () => {
    mount({ onCreate: null, createBlockedReason: "2 of 2 projects used on Pro plan. Upgrade to add another." });
    expect(screen.queryAllByRole("button", { name: /New Project/i })).not.toHaveLength(0);
  });

  it("tells an empty workspace it has no projects rather than no matches", () => {
    mount({ projects: [], filtered: [] });
    const table = screen.getByRole("table");
    expect(within(table).getByText(/No projects in this workspace yet/i)).toBeInTheDocument();
    expect(within(table).queryByText(/match your filters/i)).toBeNull();
  });

  it("still says 'no match' when projects exist but the filters exclude them", () => {
    mount({ projects: [project("a", "Alpha")], filtered: [], search: "zzz" });
    const table = screen.getByRole("table");
    expect(within(table).getByText(/No projects match your filters/i)).toBeInTheDocument();
  });
});
