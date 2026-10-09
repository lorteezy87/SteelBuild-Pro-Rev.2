// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ChangeOrderApprovalDialog from "../ChangeOrderApprovalDialog";

const props = { open: true, onClose: vi.fn(), onConfirm: vi.fn().mockResolvedValue(undefined), changeOrders: [{ id: "co-1", co_number: "CO #001", co_amount: 1200 }, { id: "co-2", co_number: "CO #002", co_amount: 250 }], sovItems: [{ id: "sov-1", line_item_number: 10, description: "Structural steel" }] };

async function enterApprover() {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Approved By" }), " Casey PM ");
  fireEvent.change(screen.getByLabelText("Approved Date"), { target: { value: "2026-10-07" } });
  return user;
}

describe("ChangeOrderApprovalDialog", () => {
  it("shows the selected orders and combined amount without inventing a SOV choice", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ChangeOrderApprovalDialog {...props} onConfirm={onConfirm} />);
    expect(screen.getByText("CO #001")).toBeVisible();
    expect(screen.getByText("CO #002")).toBeVisible();
    expect(screen.getByText("$1,450.00")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "SOV treatment" })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Approve 2 change orders" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("requires an existing line for adjustment and sends the explicit reviewed choice", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ChangeOrderApprovalDialog {...props} onConfirm={onConfirm} />);
    const user = await enterApprover();
    await user.selectOptions(screen.getByRole("combobox", { name: "SOV treatment" }), "adjust_line");
    await user.click(screen.getByRole("button", { name: "Approve 2 change orders" }));
    expect(onConfirm).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Existing SOV line" }), "sov-1");
    expect(screen.getByText(/selected line.*\$1,450.00/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Approve 2 change orders" }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ approved_by: "Casey PM", approved_date: "2026-10-07", sov_mode: "adjust_line", sov_line_item_id: "sov-1" });
  });

  it("does not offer new SOV lines for any deduct even when the net batch amount is positive", async () => {
    render(<ChangeOrderApprovalDialog {...props} changeOrders={[props.changeOrders[0], { id: "co-3", co_number: "CO #003", co_amount: -100 }]} />);
    const user = await enterApprover();
    const treatment = screen.getByRole("combobox", { name: "SOV treatment" });
    expect(within(treatment).getByRole("option", { name: /Create.*new SOV line/ })).toBeDisabled();
    expect(screen.getByText(/deduct.*existing.*unchanged/i)).toBeVisible();
    await user.selectOptions(treatment, "none");
    expect(screen.getByText(/without changing scheduled billing values/i)).toBeVisible();
  });

  it("preserves approval inputs and displays a rejected confirmation for retry", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("SOV refresh failed"));
    const onClose = vi.fn();
    const view = render(<ChangeOrderApprovalDialog {...props} onConfirm={onConfirm} onClose={onClose} />);
    const user = await enterApprover();
    await user.selectOptions(screen.getByRole("combobox", { name: "SOV treatment" }), "none");
    await user.click(screen.getByRole("button", { name: "Approve 2 change orders" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("SOV refresh failed");
    view.rerender(<ChangeOrderApprovalDialog {...props} changeOrders={props.changeOrders.map(co => ({ ...co }))} onConfirm={onConfirm} onClose={onClose} />);
    expect(screen.getByRole("textbox", { name: "Approved By" })).toHaveValue(" Casey PM ");
    expect(screen.getByRole("combobox", { name: "SOV treatment" })).toHaveValue("none");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks duplicate confirmations and cancellation while an approval is pending", async () => {
    let finish!: () => void;
    const onConfirm = vi.fn().mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const onClose = vi.fn();
    render(<ChangeOrderApprovalDialog {...props} onConfirm={onConfirm} onClose={onClose} />);
    const user = await enterApprover();
    await user.selectOptions(screen.getByRole("combobox", { name: "SOV treatment" }), "none");
    await user.click(screen.getByRole("button", { name: "Approve 2 change orders" }));
    expect(screen.getByRole("button", { name: "Approving…" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Approved By" })).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledOnce();
    await act(async () => { finish(); });
  });

  it("requires another review when selected financial amounts change", async () => {
    const view = render(<ChangeOrderApprovalDialog {...props} />);
    const user = await enterApprover();
    await user.selectOptions(screen.getByRole("combobox", { name: "SOV treatment" }), "none");
    view.rerender(<ChangeOrderApprovalDialog {...props} changeOrders={[{ ...props.changeOrders[0], co_amount: 6000 }]} />);
    expect(screen.getByRole("combobox", { name: "SOV treatment" })).toHaveValue("");
    expect(screen.getByLabelText("Total approval value")).toHaveTextContent("$6,000.00");
  });

  it("does not approve records with missing or non-finite amounts", () => {
    render(<ChangeOrderApprovalDialog {...props} changeOrders={[{ id: "co-bad", co_amount: null }]} />);
    expect(screen.getByRole("button", { name: "Approve 1 change order" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/amount/i);
  });
});
