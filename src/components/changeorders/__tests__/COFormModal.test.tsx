// @vitest-environment jsdom
import type { ComponentType } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import COFormModalRaw from "../COFormModal";

vi.mock("@/components/shared/RelatedScheduleTasksChips", () => ({ default: (): null => null }));
type Co = Record<string, unknown>;
type Props = { open: boolean; onClose: () => void; onSave: (value: Co) => unknown; co?: Co | null; prefill?: Co | null; projects: Co[]; sovItems: Co[]; isSaving?: boolean; writesDisabled?: boolean; recoveryPending?: boolean; canApprove?: boolean; canVoid?: boolean; onDelete?: ((value: Co) => unknown) | null };
const COFormModal = COFormModalRaw as ComponentType<Props>;
const existing = { id: "co-1", project_id: "project-1", co_number: "CO #001", title: "Added brace steel", status: "Submitted", co_amount: 1200, margin_percent: 15, schedule_impact_days: 2 };
const defaults = { open: true, onClose: vi.fn(), onSave: vi.fn(), projects: [{ id: "project-1", name: "North warehouse" }], sovItems: [{ id: "sov-1", project_id: "project-1", line_item_number: 10, description: "Structural steel" }] };
function renderModal(props: Partial<Props> = {}) {
  return render(<COFormModal {...defaults} {...props} />);
}

describe("COFormModal lifecycle controls", () => {
  it('locks draft changes while offering an explicit recovery of the original save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderModal({ onSave, recoveryPending: true });
    expect(screen.getByRole('textbox', { name: /Title/ })).toBeDisabled();
    expect(screen.getByText(/original save may have completed/i)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Recover saved change order' }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith({});
  });
  it("offers only valid creation statuses and displays a server-assigned immutable number", () => {
    renderModal();
    const status = screen.getByRole("combobox", { name: "Status" });
    expect(within(status).getAllByRole("option").map(option => option.textContent)).toEqual(["Draft", "Submitted"]);
    expect(screen.getByRole("textbox", { name: "CO Number" })).toHaveAttribute("readonly");
    expect(screen.getByPlaceholderText(/assigned when created/i)).toBeVisible();
  });

  it("requires explicit approval evidence and forwards the reviewed SOV decision", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal({ co: existing, onSave });
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "Approved");
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(onSave).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: /Approved By/ }), " Casey PM ");
    fireEvent.change(screen.getByLabelText(/Approved Date/), { target: { value: "2026-10-07" } });
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(onSave).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox", { name: /SOV treatment/ }), "adjust_line");
    await user.selectOptions(screen.getByRole("combobox", { name: /SOV Line Item/ }), "sov-1");
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "Approved", approved_by: "Casey PM", approved_date: "2026-10-07", sov_mode: "adjust_line", sov_line_item_id: "sov-1" }));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("co_number");
  });

  it.each([["Rejected", "Rejection reason", "decision_notes"], ["Void", "Void reason", "void_reason"]])("requires a written reason for %s", async (status, label, field) => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal({ co: existing, onSave });
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), status);
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(onSave).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: label }), "  Superseded scope  ");
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ [field]: "Superseded scope" }));
  });

  it("does not offer approval without permission and freezes approved amounts and stamps", () => {
    const view = renderModal({ co: existing, canApprove: false });
    expect(within(screen.getByRole("combobox", { name: "Status" })).queryByRole("option", { name: "Approved" })).not.toBeInTheDocument();
    view.unmount();
    renderModal({ co: { ...existing, status: "Approved", approved_by: "Casey", approved_date: "2026-10-07", sov_mode: "new_line", sov_line_item_id: "sov-1" }, onDelete: vi.fn() });
    expect(screen.getByRole("spinbutton", { name: "CO Amount ($)" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /Approved By/ })).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/Approved Date/)).toHaveAttribute("readonly");
    expect(screen.getByRole("combobox", { name: /SOV Line Item/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("preserves edits when the same record refreshes and resets for another record", async () => {
    const user = userEvent.setup();
    const view = renderModal({ co: existing });
    const title = screen.getByRole("textbox", { name: /Title/ });
    await user.clear(title);
    await user.type(title, "Unsaved brace scope");
    view.rerender(<COFormModal {...defaults} co={{ ...existing, title: "Refreshed server title" }} />);
    expect(title).toHaveValue("Unsaved brace scope");
    view.rerender(<COFormModal {...defaults} co={{ ...existing, id: "co-2", title: "Other change" }} />);
    expect(title).toHaveValue("Other change");
  });

  it("does not offer Void without the separate void permission", () => {
    renderModal({ co: existing, canVoid: false });
    expect(within(screen.getByRole("combobox", { name: "Status" })).queryByRole("option", { name: "Void" })).not.toBeInTheDocument();
  });

  it("keeps a rejected save and user input available for retry", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Approval service unavailable"));
    renderModal({ co: existing, onSave });
    await user.type(screen.getByRole("textbox", { name: /Title/ }), " revised");
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Approval service unavailable");
    expect(screen.getByRole("textbox", { name: /Title/ })).toHaveValue("Added brace steel revised");
    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
  });

  it.each(["isSaving", "writesDisabled"])("blocks editing and submission while %s", async prop => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal({ co: existing, onSave, [prop]: true });
    expect(screen.getByRole("textbox", { name: /Title/ })).toBeDisabled();
    const save = screen.getByRole("button", { name: /Update|Saving/ });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });
});
