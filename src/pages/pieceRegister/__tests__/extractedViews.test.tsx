// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PieceImportBatch } from "@/lib/pieceControl/repository";
import { PieceRegisterArchiveDialog } from "../PieceRegisterArchiveDialog";
import {
  PieceRegisterImportView,
  type PieceRegisterImportViewProps,
} from "../PieceRegisterImportView";
import { IMPORT_DECISION_TONE } from "../registerHelpers";

function importBatch(
  status: PieceImportBatch["status"],
): PieceImportBatch {
  return {
    id: "batch-1",
    project_id: "project-1",
    source_type: "csv",
    source_name: "Site batch",
    status,
    row_count: 2,
    decision_counts: { new: 2 },
    created_at: "2026-08-01T12:00:00.000Z",
    approved_at: status === "pending_review" ? null : "2026-08-01T13:00:00.000Z",
    applied_at: status === "applied" ? "2026-08-01T14:00:00.000Z" : null,
    apply_summary: null,
  };
}

describe("PieceRegisterArchiveDialog", () => {
  it("keeps archive disabled until both confirmations are complete", () => {
    const onReasonChange = vi.fn();
    const onConfirmationChange = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    const { rerender } = render(
      <PieceRegisterArchiveDialog
        selectedCount={2}
        archiveReason=""
        archiveConfirmation=""
        archiveConfirmationText="ARCHIVE 2 PIECES"
        isPending={false}
        onReasonChange={onReasonChange}
        onConfirmationChange={onConfirmationChange}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Archive pieces" }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Duplicate import" },
    });
    fireEvent.change(
      screen.getByLabelText(/Type ARCHIVE 2 PIECES to confirm/),
      { target: { value: "ARCHIVE 2 PIECES" } },
    );
    expect(onReasonChange).toHaveBeenCalledWith("Duplicate import");
    expect(onConfirmationChange).toHaveBeenCalledWith("ARCHIVE 2 PIECES");

    rerender(
      <PieceRegisterArchiveDialog
        selectedCount={2}
        archiveReason="Duplicate import"
        archiveConfirmation="ARCHIVE 2 PIECES"
        archiveConfirmationText="ARCHIVE 2 PIECES"
        isPending={false}
        onReasonChange={onReasonChange}
        onConfirmationChange={onConfirmationChange}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive pieces" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const dialog = screen.getByRole("alertdialog");
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("PieceRegisterImportView", () => {
  it("preserves stage, review, apply, and post-apply callbacks", () => {
    const onStage = vi.fn();
    const setSelectedBatchId = vi.fn();
    const setApplyConfirmed = vi.fn();
    const onApprove = vi.fn();
    const onApply = vi.fn();
    const onAssignImport = vi.fn();

    const pending = importBatch("pending_review");
    const baseProps: PieceRegisterImportViewProps = {
      sourceType: "csv",
      setSourceType: vi.fn(),
      importFile: null,
      importRows: [{ piece_mark: "A1" }],
      handleFile: vi.fn(),
      stagePending: false,
      onStage,
      batches: [pending],
      selectedBatch: pending,
      setSelectedBatchId,
      setApplyConfirmed,
      applyConfirmed: false,
      approvePending: false,
      onApprove,
      applyPending: false,
      onApply,
      importTargetWorkPackageId: "",
      setImportTargetWorkPackageId: vi.fn(),
      workPackages: [
        { id: "wp-1", wp_number: "WP-001", name: "Main Steel" },
      ],
      formatWorkPackageTitle: (wp) =>
        `${wp.wp_number ?? wp.id} - ${wp.name ?? "Unnamed"}`,
      batchRows: [
        {
          id: "row-1",
          source_row_number: 1,
          normalized_payload: {
            piece_mark: "A1",
            profile: "W12X26",
            material_grade: "A992",
          },
          decision: "new",
          warnings: [],
          resolution: null,
          matched_piece_id: null,
        },
      ],
      decisionTone: IMPORT_DECISION_TONE,
      assignPending: false,
      onAssignImport,
    };

    const { rerender } = render(<PieceRegisterImportView {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Stage for review" }));
    expect(onStage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Site batch/i }));
    expect(setSelectedBatchId).toHaveBeenCalledWith("batch-1");
    expect(setApplyConfirmed).toHaveBeenCalledWith(false);

    fireEvent.click(
      screen.getByRole("button", { name: "Review complete · Approve" }),
    );
    expect(onApprove).toHaveBeenCalledTimes(1);

    const approved = importBatch("approved");
    rerender(
      <PieceRegisterImportView
        {...baseProps}
        batches={[approved]}
        selectedBatch={approved}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Apply batch (CSV WP / sheet hints)",
      }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Confirm eligible creates and updates",
      }),
    );
    expect(setApplyConfirmed).toHaveBeenCalledWith(true);

    rerender(
      <PieceRegisterImportView
        {...baseProps}
        batches={[approved]}
        selectedBatch={approved}
        applyConfirmed
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Apply batch (CSV WP / sheet hints)",
      }),
    );
    expect(onApply).toHaveBeenCalledTimes(1);

    const applied = importBatch("applied");
    rerender(
      <PieceRegisterImportView
        {...baseProps}
        batches={[applied]}
        selectedBatch={applied}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Apply WP / drawing hints from import",
      }),
    );
    expect(onAssignImport).toHaveBeenCalledTimes(1);
  });
});
