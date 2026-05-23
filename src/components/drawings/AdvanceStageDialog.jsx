// AdvanceStageDialog — submittal-driven workflow with a legacy escape
// hatch. When a user clicks "advance stage" on a sheet/group, we no
// longer mutate `drawings.stage` directly as the primary action — the
// submittal status is the workflow source of truth (per Sprint-2),
// and direct sheet-stage mutation has been demoted to a secondary
// "legacy" path.
//
// The dialog presents two clearly distinct actions:
//
//   PRIMARY  — "Update via Submittal →" navigates the user to the
//              Submittals page with a target set + prefilled status,
//              so they can create or update a submittal that drives
//              the stage change through the canonical workflow.
//
//   SECONDARY — "Update sheet stage only (legacy)" runs the original
//               direct mutation. Tooltip explains why this is
//               deprecated. Kept available because there are still
//               manual-cleanup flows (pre-Sprint-2 data, BFA imports
//               with no submittal) where direct sheet-stage edits are
//               the only sensible path.
//
// Pure presentational — parent owns navigation + the legacy mutation.

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function AdvanceStageDialog({
  open,
  currentStage,
  targetStage,
  drawingId,
  setId,
  onClose,
  onLegacy,
  onViaSubmittal,
}) {
  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && onClose && onClose()}>
      <DialogContent
        className="sbd-card-strong"
        style={{
          maxWidth: 480,
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: 16,
        }}
      >
        <DialogHeader>
          <DialogTitle
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 18,
              color: "var(--text-primary)",
              letterSpacing: "0.06em",
            }}
          >
            Advance to {targetStage}?
          </DialogTitle>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.10em",
              marginTop: 2,
              textTransform: "uppercase",
            }}
          >
            From {currentStage || "∅"}
          </p>
        </DialogHeader>

        <div
          style={{
            background: "var(--info-muted)",
            border: "1px solid var(--info-border)",
            borderRadius: 8,
            padding: "8px 12px",
            margin: "12px 0",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.10em",
              color: "var(--accent)",
            }}
          >
            WORKFLOW UPDATE
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-primary)",
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            Submittal status is the workflow source of truth. Use{" "}
            <strong>Update via Submittal</strong> to drive the stage
            change through the canonical workflow. The legacy direct
            sheet-stage update is kept for pre-Sprint-2 cleanup only.
          </div>
        </div>

        <DialogFooter style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
          <button
            className="sbd-btn sbd-btn-primary"
            onClick={() => {
              onViaSubmittal && onViaSubmittal({ drawingId, setId, targetStage });
            }}
            style={{
              padding: "10px 14px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.06em",
            }}
          >
            UPDATE VIA SUBMITTAL →
          </button>

          <button
            className="sbd-btn"
            onClick={() => {
              onLegacy && onLegacy({ drawingId, setId, targetStage });
            }}
            title="Sheet-stage is deprecated. Submittal status is the workflow source of truth — use 'Update via Submittal' instead."
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
              borderRadius: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.06em",
            }}
          >
            UPDATE SHEET STAGE ONLY (LEGACY)
          </button>

          <button
            className="sbd-btn sbd-btn-ghost"
            onClick={() => onClose && onClose()}
            style={{
              padding: "6px 14px",
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.06em",
            }}
          >
            CANCEL
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
