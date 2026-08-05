/**
 * Model3dSyncPanel — operator-facing 3D Sync card.
 * Live link health, one-click sync, GUID CSV export — no SQL required.
 */
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  downloadModelGuidCsv,
  linkModelElementsToPieces,
  summarizeModelLinkHealth,
  type ModelElementLinkRow,
} from "@/lib/pieceControl/modelElementLink";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";

const mono = { fontFamily: "var(--font-mono)" };

interface Model3dSyncPanelProps {
  projectId: string;
  modelElementRows: ModelElementLinkRow[] | null | undefined;
}

export default function Model3dSyncPanel({
  projectId,
  modelElementRows,
}: Model3dSyncPanelProps) {
  const qc = useQueryClient();
  const health = useMemo(
    () => summarizeModelLinkHealth(modelElementRows),
    [modelElementRows],
  );

  const syncMutation = useMutation({
    mutationFn: () => linkModelElementsToPieces(projectId),
    onSuccess: (summary) => {
      qc.invalidateQueries({ queryKey: ["model-elements", projectId] });
      qc.invalidateQueries({ queryKey: ["canonical-pieces-3d", projectId] });
      const linked = Number(summary.linked ?? 0);
      const unmatched = Number(summary.unmatched ?? 0);
      const ambiguous = Number(summary.ambiguous ?? 0);
      const viaClient = summary.used_client_fallback
        ? " (client fallback — apply Piece Control migrations when ready)"
        : "";
      if (linked === 0 && unmatched === 0 && ambiguous === 0) {
        toast.success(
          `3D marks are already in sync with the Piece Register.${viaClient}`,
        );
        return;
      }
      toast.success(
        `Synced ${linked.toLocaleString()} mark${linked === 1 ? "" : "s"}` +
          (unmatched ? ` · ${unmatched.toLocaleString()} unmatched` : "") +
          (ambiguous ? ` · ${ambiguous.toLocaleString()} ambiguous` : "") +
          viaClient,
      );
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "Could not sync 3D marks to pieces."),
      ),
  });

  if (!projectId) return null;

  const allLinked = health.withMark > 0 && health.unlinked === 0;
  const nothingToLink = health.withMark === 0;

  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 11px",
        borderRadius: 8,
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface)",
      }}
    >
      <div
        style={{
          ...mono,
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 6,
        }}
      >
        3D Sync
      </div>

      <div style={{ fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.45, marginBottom: 10 }}>
        {nothingToLink ? (
          <span style={{ color: "var(--text-muted)" }}>
            No piece marks on this model yet. Save an IFC or import the piece roster first.
          </span>
        ) : allLinked ? (
          <span style={{ color: "var(--status-success)" }}>
            ✓ {health.linked.toLocaleString()} mark
            {health.linked === 1 ? "" : "s"} linked to the Piece Register
          </span>
        ) : (
          <>
            <strong>{health.linked.toLocaleString()}</strong> linked
            {" · "}
            <strong style={{ color: "var(--status-warning)" }}>
              {health.unlinked.toLocaleString()}
            </strong>{" "}
            still need linking for Fab colors
          </>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          type="button"
          disabled={syncMutation.isPending || nothingToLink}
          onClick={() => syncMutation.mutate()}
          className="sbd-btn sbd-btn-primary"
          style={{
            width: "100%",
            justifyContent: "center",
            opacity: syncMutation.isPending || nothingToLink ? 0.65 : 1,
            cursor: syncMutation.isPending || nothingToLink ? "not-allowed" : "pointer",
          }}
          title="Match IFC marks to Piece Register lots (exact / lot-aware)"
        >
          {syncMutation.isPending ? "Syncing…" : allLinked ? "Re-sync marks" : "Sync marks now"}
        </button>

        <button
          type="button"
          disabled={health.withGuid === 0}
          onClick={() => {
            downloadModelGuidCsv(modelElementRows, projectId);
            toast.message(`Exported ${health.withGuid.toLocaleString()} GUID rows`);
          }}
          style={{
            width: "100%",
            padding: "7px 10px",
            borderRadius: 7,
            cursor: health.withGuid === 0 ? "not-allowed" : "pointer",
            border: "1px solid var(--border-default)",
            background: "var(--bg-surface-low)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            opacity: health.withGuid === 0 ? 0.5 : 1,
          }}
          title="Download element_guid + piece_mark as CSV"
        >
          Export GUID list
        </button>
      </div>

      <div
        style={{
          ...mono,
          fontSize: 8.5,
          color: "var(--text-muted)",
          marginTop: 8,
          lineHeight: 1.4,
        }}
      >
        Sync runs automatically after IFC save and piece import. Use this when Fab
        colors look stale or after fixing marks in the register.
      </div>
    </div>
  );
}
