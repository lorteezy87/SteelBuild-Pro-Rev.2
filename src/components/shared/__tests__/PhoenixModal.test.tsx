// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PhoenixModal from "../PhoenixModal";

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open package</button>
    <PhoenixModal open={open} onClose={() => setOpen(false)} title="Package details" footer={<button type="button">Save</button>}>
      <label htmlFor="package-name">Package name</label><input id="package-name" />
    </PhoenixModal>
  </>;
}

function NestedModalHarness() {
  const [parentOpen, setParentOpen] = useState(true);
  const [childOpen, setChildOpen] = useState(false);
  return <PhoenixModal open={parentOpen} onClose={() => setParentOpen(false)} title="Package" footer={null}>
    <button type="button" onClick={() => setChildOpen(true)}>Review drawing</button>
    <PhoenixModal open={childOpen} onClose={() => setChildOpen(false)} title="Drawing" footer={<button type="button">Apply drawing</button>}>
      <input aria-label="Drawing revision" />
    </PhoenixModal>
  </PhoenixModal>;
}

describe("PhoenixModal accessibility and dismissal", () => {
  it("exposes its named dialog and form controls to the accessibility tree", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole("button", { name: "Open package" }));
    const dialog = screen.getByRole("dialog", { name: "Package details" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("textbox", { name: "Package name" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Close dialog" })).toHaveFocus();
  });

  it("wraps keyboard focus and restores the opener after Escape", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const opener = screen.getByRole("button", { name: "Open package" });
    await user.click(opener);
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("does not dismiss for content clicks or an Escape already handled by a child", () => {
    const close = vi.fn();
    render(<PhoenixModal open onClose={close} title="Editor" footer={null}>
      <input aria-label="Child editor" onKeyDown={event => { if (event.key === "Escape") event.preventDefault(); }} />
    </PhoenixModal>);
    fireEvent.click(screen.getByRole("textbox", { name: "Child editor" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Child editor" }), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
  });

  it("dismisses through the dedicated backdrop and explicit close button", () => {
    const close = vi.fn();
    render(<PhoenixModal open onClose={close} title="Editor" footer={null}><p>Scope</p></PhoenixModal>);
    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    expect(closeButton).toHaveAttribute("type", "button");
    fireEvent.click(closeButton);
    fireEvent.click(screen.getByRole("button", { name: "Close dialog backdrop" }));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("keeps nested focus and Escape within the child dialog, then restores its opener", async () => {
    const user = userEvent.setup();
    render(<NestedModalHarness />);
    const opener = screen.getByRole("button", { name: "Review drawing" });
    await user.click(opener);
    const child = screen.getByRole("dialog", { name: "Drawing" });
    expect(within(child).getByRole("button", { name: "Close dialog" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(child).getByRole("button", { name: "Apply drawing" })).toHaveFocus();
    await user.tab();
    expect(within(child).getByRole("button", { name: "Close dialog" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Drawing" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Package" })).toBeVisible();
    expect(opener).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
