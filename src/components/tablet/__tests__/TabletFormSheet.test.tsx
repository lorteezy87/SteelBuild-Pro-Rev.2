// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TabletFormSheet } from "../TabletFormSheet";

describe("TabletFormSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <TabletFormSheet open={false} title="New RFI" onClose={() => {}}>
        <p>Body</p>
      </TabletFormSheet>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders an accessible dialog with body content and sticky footer slot", () => {
    const { container } = render(
      <TabletFormSheet
        open
        title="Edit RFI"
        onClose={() => {}}
        footer={
          <>
            <button type="button">Cancel</button>
            <button type="button">Save</button>
          </>
        }
      >
        <label>
          Subject
          <input aria-label="Subject" />
        </label>
      </TabletFormSheet>
    );

    const dialog = screen.getByRole("dialog", { name: "Edit RFI" });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Edit RFI" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Subject" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    expect(screen.getByRole("button", { name: "Close Edit RFI" })).toHaveFocus();
    expect(dialog.querySelector(".tablet-form-sheet__footer")).not.toBeNull();
  });

  it("calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <TabletFormSheet open title="New Change Request" onClose={onClose}>
        <button type="button">Focusable</button>
      </TabletFormSheet>
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
