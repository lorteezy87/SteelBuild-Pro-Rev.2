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
  Select: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SelectContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SelectItem: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SelectTrigger: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SelectValue: () => null,
}));

vi.mock("@/components/shared/AutoLinkSuggestions", () => ({
  default: () => null,
}));

vi.mock("@/components/submittals/DrawingSetSelector", () => ({
  default: () => null,
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
});
