/** @vitest-environment jsdom */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DeleteDialog from "../DeleteDialog";

describe("DeleteDialog", () => {
  it("keeps the dialog open when onConfirm rejects", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockRejectedValue(new Error("delete failed"));

    render(
      <DeleteDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete Contact"
        description="Delete this contact?"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Delete Contact")).toBeTruthy();
  });

  it("closes only after onConfirm resolves", async () => {
    let resolveConfirm;
    const onClose = vi.fn();
    const onConfirm = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveConfirm = resolve;
        }),
    );

    render(
      <DeleteDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete Contact"
        description="Delete this contact?"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(screen.getByRole("button", { name: /Deleting/i })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    resolveConfirm();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
