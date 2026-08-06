/**
 * Archive confirmation dialog for Piece Register bulk archive.
 * Extracted from PieceRegister.tsx (behavior-preserving).
 */
import { Archive } from "lucide-react";

export type PieceRegisterArchiveDialogProps = {
  selectedCount: number;
  archiveReason: string;
  archiveConfirmation: string;
  archiveConfirmationText: string;
  isPending: boolean;
  onReasonChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function PieceRegisterArchiveDialog({
  selectedCount,
  archiveReason,
  archiveConfirmation,
  archiveConfirmationText,
  isPending,
  onReasonChange,
  onConfirmationChange,
  onCancel,
  onConfirm,
}: PieceRegisterArchiveDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{
        background:
          "color-mix(in srgb, var(--bg-void, #050810) 72%, transparent)",
      }}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="archive-piece-title"
        className="w-full max-w-lg rounded-2xl p-6 shadow-2xl"
        style={{
          border: "1px solid var(--cmd-border, var(--border-default))",
          background: "var(--cmd-surface, var(--bg-surface))",
          color: "var(--cmd-text, var(--text-primary))",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="rounded-xl p-2"
            style={{
              background: "var(--cmd-chip-danger-bg, var(--danger-muted))",
              color: "var(--cmd-danger-text, var(--status-error))",
            }}
          >
            <Archive className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="archive-piece-title"
              className="text-xl font-black"
              style={{ color: "var(--cmd-text, var(--text-primary))" }}
            >
              Archive {selectedCount} piece{selectedCount === 1 ? "" : "s"}?
            </h2>
            <p
              className="mt-2 text-sm leading-6"
              style={{
                color: "var(--cmd-text-muted, var(--text-muted))",
              }}
            >
              Archived pieces are removed from active Piece Control counts and
              workflows. Import batches, relationships, and audit history are
              retained. Split, held, released, or production-started pieces
              cannot be archived.
            </p>
          </div>
        </div>
        <label
          htmlFor="piece-archive-reason"
          className="mt-5 grid gap-2 text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--cmd-text-muted, var(--text-muted))" }}
        >
          Reason
          <textarea
            id="piece-archive-reason"
            value={archiveReason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={3}
            placeholder="Why should these pieces be removed from the active register?"
            className="resize-none rounded-lg px-3 py-2 text-sm font-medium normal-case tracking-normal"
            style={{
              border: "1px solid var(--cmd-border, var(--border-default))",
              background:
                "var(--cmd-surface, var(--bg-input, var(--bg-surface)))",
              color: "var(--cmd-text, var(--text-primary))",
            }}
          />
        </label>
        <label
          htmlFor="piece-archive-confirmation"
          className="mt-4 grid gap-2 text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--cmd-text-muted, var(--text-muted))" }}
        >
          Type {archiveConfirmationText} to confirm
          <input
            id="piece-archive-confirmation"
            value={archiveConfirmation}
            onChange={(event) => onConfirmationChange(event.target.value)}
            placeholder={archiveConfirmationText}
            className="h-11 rounded-lg px-3 font-mono text-sm font-bold normal-case tracking-normal"
            style={{
              border: "1px solid var(--cmd-border, var(--border-default))",
              background:
                "var(--cmd-surface, var(--bg-input, var(--bg-surface)))",
              color: "var(--cmd-text, var(--text-primary))",
            }}
          />
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="h-10 rounded-lg px-4 text-sm font-bold disabled:opacity-50"
            style={{
              border: "1px solid var(--cmd-border, var(--border-default))",
              background: "transparent",
              color: "var(--cmd-text, var(--text-primary))",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              isPending ||
              archiveReason.trim().length === 0 ||
              archiveConfirmation !== archiveConfirmationText
            }
            onClick={onConfirm}
            className="h-10 rounded-lg px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              border: "none",
              background: "var(--cmd-danger, var(--status-error))",
              color: "var(--cmd-pill-on-solid, #fff)",
            }}
          >
            {isPending ? "Archiving..." : "Archive pieces"}
          </button>
        </div>
      </div>
    </div>
  );
}
