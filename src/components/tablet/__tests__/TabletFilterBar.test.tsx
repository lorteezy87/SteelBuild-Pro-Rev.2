// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TabletFilterBar } from "../TabletFilterBar";

describe("TabletFilterBar", () => {
  it("renders search and inline filters", () => {
    render(
      <TabletFilterBar
        search={<input aria-label="Search projects" />}
        filters={<button type="button">Status</button>}
      />
    );

    expect(screen.getByRole("textbox", { name: "Search projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Status" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Filters" })).not.toBeInTheDocument();
  });

  it("opens overflow content in a modal dialog from the Filters button", async () => {
    const user = userEvent.setup();

    render(
      <TabletFilterBar
        search={<input aria-label="Search projects" />}
        filters={<button type="button">Status</button>}
        overflow={
          <>
            <button type="button">Trade</button>
            <button type="button">Assignee</button>
          </>
        }
      />
    );

    await user.click(screen.getByRole("button", { name: "Filters" }));

    const trigger = screen.getByRole("button", { name: "Filters" });
    const dialog = screen.getByRole("dialog", { name: "Filters" });

    expect(trigger).toHaveAttribute("aria-controls", dialog.getAttribute("id"));
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Close filters" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Trade" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assignee" })).toBeInTheDocument();
  });

  it("closes overflow on Escape and close button and restores trigger focus", async () => {
    const user = userEvent.setup();

    render(
      <TabletFilterBar
        search={<input aria-label="Search projects" />}
        filters={<button type="button">Status</button>}
        overflow={<button type="button">Trade</button>}
      />
    );

    const trigger = screen.getByRole("button", { name: "Filters" });

    expect(trigger).not.toHaveAttribute("aria-controls");

    trigger.focus();
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-controls");
    await user.click(screen.getByRole("button", { name: "Close filters" }));

    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
