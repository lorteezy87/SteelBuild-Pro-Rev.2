// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import DrawingRegisterActions from "../DrawingRegisterActions";

afterEach(cleanup);

describe("DrawingRegisterActions", () => {
  it("leads with intake and revision, with secondary work in a deliberate menu", () => {
    const onExportPkg = vi.fn();
    const onOpenIntake = vi.fn();
    render(
      <DrawingRegisterActions
        canCreateDrawing
        canEditDrawing
        hasSets
        selectedCount={0}
        onAddSheet={vi.fn()}
        onOpenUploadSet={vi.fn()}
        onOpenRevision={vi.fn()}
        onOpenLogImport={vi.fn()}
        onOpenIntake={onOpenIntake}
        onBulkEdit={vi.fn()}
        onExportTransmittal={vi.fn()}
        onExportPkg={onExportPkg}
      />,
    );

    expect(screen.getByRole("button", { name: "Upload set" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New revision" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add sheet" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More drawing actions" }));
    expect(screen.getByRole("menuitem", { name: "Add sheet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Review PDF intake" }));
    expect(onOpenIntake).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "More drawing actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fab release packet" }));
    expect(onExportPkg).toHaveBeenCalledWith("fab_release");
  });

  it("does not offer revision mutation to a read-only viewer", () => {
    render(
      <DrawingRegisterActions
        canCreateDrawing={false}
        canEditDrawing={false}
        hasSets
        selectedCount={0}
        onAddSheet={vi.fn()}
        onOpenUploadSet={vi.fn()}
        onOpenRevision={vi.fn()}
        onOpenLogImport={vi.fn()}
        onOpenIntake={vi.fn()}
        onBulkEdit={vi.fn()}
        onExportTransmittal={vi.fn()}
        onExportPkg={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "New revision" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload set" })).not.toBeInTheDocument();
  });

  it("supports keyboard access to secondary drawing actions", () => {
    render(
      <DrawingRegisterActions
        canCreateDrawing
        canEditDrawing
        hasSets
        selectedCount={0}
        onAddSheet={vi.fn()}
        onOpenUploadSet={vi.fn()}
        onOpenRevision={vi.fn()}
        onOpenLogImport={vi.fn()}
        onOpenIntake={vi.fn()}
        onBulkEdit={vi.fn()}
        onExportTransmittal={vi.fn()}
        onExportPkg={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "More drawing actions" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const first = screen.getByRole("menuitem", { name: "Add sheet" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Import detailer log" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
