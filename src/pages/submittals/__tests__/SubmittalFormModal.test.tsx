// @vitest-environment jsdom
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNextFormattedNumber: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/components/shared/numberSequencing", () => ({
  getNextFormattedNumber: mocks.getNextFormattedNumber,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
  },
}));

vi.mock("../uiCompat", () => ({
  Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
  DialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children }: React.PropsWithChildren) => <label>{children}</label>,
  Select: ({ children, value, disabled, onValueChange }: React.PropsWithChildren<{ value: string; disabled?: boolean; onValueChange: (value: string) => void }>) =>
    <select value={value} disabled={disabled} onChange={event => onValueChange(event.target.value)}><option value="">Unclassified</option>{children}</select>,
  SelectContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
  SelectItem: ({ children, value }: React.PropsWithChildren<{ value: string }>) => <option value={value}>{children}</option>,
  SelectTrigger: (): React.ReactNode => null,
  SelectValue: (): React.ReactNode => null,
}));

vi.mock("@/components/shared/AutoLinkSuggestions", () => ({
  default: (): React.ReactNode => null,
}));

vi.mock("@/components/submittals/DrawingSetSelector", () => ({
  default: (): React.ReactNode => null,
}));

import SubmittalFormModal from "../SubmittalFormModal";

describe("SubmittalFormModal numbering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNextFormattedNumber.mockResolvedValue("SUB-042");
  });

  it("allocates a project sequence number when a new submittal is saved blank", async () => {
    const onSubmit = vi.fn();
    render(
      <SubmittalFormModal
        open
        initial={{} as never}
        projectId="project-1"
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText("Structural steel shop drawings - Area A"),
      "Area A steel",
    );
    await userEvent.click(screen.getByRole("button", { name: "CREATE" }));

    await waitFor(() => expect(mocks.getNextFormattedNumber).toHaveBeenCalledWith({
      projectId: "project-1",
      recordType: "Submittal",
      entityName: "Submittal",
      fieldName: "submittal_number",
      prefix: "SUB-",
    }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      project_id: "project-1",
      submittal_number: "SUB-042",
      title: "Area A steel",
    }));
  });

  it("preserves a manually entered number without allocating another", async () => {
    const onSubmit = vi.fn();
    render(
      <SubmittalFormModal
        open
        initial={{} as never}
        projectId="project-1"
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText("Auto-assigned if blank"),
      "CUSTOM-7",
    );
    await userEvent.type(
      screen.getByPlaceholderText("Structural steel shop drawings - Area A"),
      "Custom package",
    );
    await userEvent.click(screen.getByRole("button", { name: "CREATE" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ submittal_number: "CUSTOM-7" }),
    ));
    expect(mocks.getNextFormattedNumber).not.toHaveBeenCalled();
  });

  it('preserves an unclassified legacy approval on metadata save instead of converting it to Shop Drawing', async () => {
    const onSubmit = vi.fn();
    render(<SubmittalFormModal open initial={{ id: 'legacy', submittal_number: 'LEG-1', title: 'Legacy record', submittal_type: null, status: 'Approved' } as never} projectId="project-1" onClose={vi.fn()} onSubmit={onSubmit} />);
    expect(screen.getByRole('status')).toHaveTextContent('unclassified and cannot govern drawing approval');
    expect(screen.getByRole('status')).toHaveTextContent('Create a new Shop Drawing package');
    expect(screen.getAllByDisplayValue('Unclassified')[0]).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ submittal_type: null }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('status');
  });

  it('allows explicit classification of a legacy Draft before its first round', async () => {
    const onSubmit = vi.fn();
    render(<SubmittalFormModal open initial={{ id: 'draft', submittal_number: 'LEG-2', title: 'Unclassified draft', submittal_type: null, status: 'Draft' } as never} projectId="project-1" onClose={vi.fn()} onSubmit={onSubmit} />);
    const type = screen.getAllByDisplayValue('Unclassified')[0];
    expect(type).toBeEnabled();
    await userEvent.selectOptions(type, 'Shop Drawing');
    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ submittal_type: 'Shop Drawing' }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('status');
  });

  it('locks classification after a Draft already has round history', () => {
    render(<SubmittalFormModal open initial={{ id: 'returned', submittal_number: 'LEG-3', title: 'Returned draft', submittal_type: 'Shop Drawing', status: 'Draft', current_round_id: 'round-1' } as never} projectId="project-1" onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByDisplayValue('Shop Drawing')).toBeDisabled();
  });
});
