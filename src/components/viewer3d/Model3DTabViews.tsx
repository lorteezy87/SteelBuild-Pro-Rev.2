import type { CSSProperties } from "react";
import { TYPE_PALETTE, seqColor } from "@/lib/ifc/viewerColoring";
import { pieceLifecycleLabel } from "@/lib/pieceControl/lifecycle";
import type {
  FabLegendRow,
  SelectionAction,
  SelectionSummary,
} from "@/lib/ifc/viewerSelection";
import type {
  Model3DColorMode,
  Model3DStatusLegendRow,
} from "./model3dTabDerive";

const mono: CSSProperties = { fontFamily: "var(--font-mono)" };
const hintStyle: CSSProperties = { color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 };
const linkBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--accent)",
  cursor: "pointer",
  textDecoration: "underline",
  font: "inherit",
  padding: 0,
};
const TYPE_LABELS = [["beam", "Beam"], ["column", "Column"], ["plate", "Plate"], ["member", "Member"]] as const;

export function PieceControlPanel({
  selection,
  registerHref,
  pending,
  onAction,
}: {
  selection: SelectionSummary;
  registerHref: string;
  pending: boolean;
  onAction: (action: SelectionAction) => void;
}) {
  const { pieces, linkedCount, unlinkedCount, holdCount, lifecycle, actions } = selection;
  const single = pieces.length === 1 ? pieces[0] : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
      {pieces.length === 0 ? (
        <div style={hintStyle}>
          {unlinkedCount.toLocaleString()} selected part{unlinkedCount === 1 ? " isn't" : "s aren't"} linked to a
          Piece Register lot. Run <strong>Sync marks</strong> above, or add the mark in the register.
        </div>
      ) : (
        <>
          {single ? (
            <>
              <Model3DRow label="Lot" value={`${single.piece_mark || selection.marks[0] || "—"}${single.lot_code ? ` · ${single.lot_code}` : ""}`} strong />
              <Model3DRow label="Status" value={single.on_hold ? `On Hold · ${pieceLifecycleLabel(single.lifecycle_status || "")}` : pieceLifecycleLabel(single.lifecycle_status || "")} />
              {single.on_hold && single.on_hold_reason && <Model3DRow label="Hold" value={single.on_hold_reason} />}
            </>
          ) : (
            <>
              <Model3DRow label="Lots" value={`${pieces.length.toLocaleString()} linked${unlinkedCount ? ` · ${unlinkedCount} unlinked part${unlinkedCount === 1 ? "" : "s"}` : ""}`} strong />
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {lifecycle.map((status) => (
                  <div key={status.key} style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                    <span>{status.label}</span>
                    <span style={mono}>{status.count}</span>
                  </div>
                ))}
                {holdCount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--status-error)" }}>
                    <span>On hold</span>
                    <span style={mono}>{holdCount}</span>
                  </div>
                )}
              </div>
            </>
          )}
          {linkedCount > 0 && unlinkedCount > 0 && single && (
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
              {unlinkedCount} selected part{unlinkedCount === 1 ? "" : "s"} not linked to a lot.
            </div>
          )}
          <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
            {actions.map((action) => (
              <button
                key={action.action}
                type="button"
                disabled={!action.enabled || pending}
                title={action.enabled ? `Record ${action.label.toLowerCase()} for ${action.pieceIds.length} lot${action.pieceIds.length === 1 ? "" : "s"}` : action.reason ?? undefined}
                onClick={() => action.enabled && onAction(action)}
                className={action.enabled ? "sbd-btn sbd-btn-primary" : "sbd-btn"}
                style={{ flex: 1, justifyContent: "center", padding: "6px 4px", opacity: action.enabled && !pending ? 1 : 0.5, cursor: action.enabled && !pending ? "pointer" : "not-allowed" }}
              >
                {pending && action.enabled ? "…" : action.label}
              </button>
            ))}
          </div>
          {!actions.some((action) => action.enabled) && (
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", lineHeight: 1.4 }}>
              {actions[0].reason?.startsWith("No linked")
                ? actions[0].reason
                : holdCount
                  ? "Release the hold in the Piece Register before recording logistics."
                  : "Station progress is recorded in the Piece Register; the 3D view records ship, deliver and erect once every selected lot is at the prior stage."}
            </div>
          )}
        </>
      )}
      <a href={registerHref} style={{ ...mono, fontSize: 10, color: "var(--accent)" }}>
        Open in Piece Register →
      </a>
    </div>
  );
}

export function Model3DRow({
  label,
  value,
  strong = false,
  small = false,
}: {
  label: string;
  value?: string | number | null;
  strong?: boolean;
  small?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", width: 64, flexShrink: 0, textTransform: "uppercase" }}>{label}</span>
      <span style={{ color: value ? "var(--text-primary)" : "var(--text-muted)", fontWeight: strong ? 700 : 400, fontSize: small ? 10 : 12, ...(small ? mono : {}), wordBreak: "break-all" }}>
        {value || "—"}
      </span>
    </div>
  );
}

function Swatch({
  color,
  label,
  count,
  active,
  onClick,
  title,
}: {
  color?: string | null;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const clickable = typeof onClick === "function";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      title={title}
      aria-pressed={clickable ? Boolean(active) : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 8, fontSize: 12, width: "100%",
        padding: "3px 5px", margin: "0 -5px", borderRadius: 6, textAlign: "left",
        border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
        background: active ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
        color: "inherit", cursor: clickable ? "pointer" : "default", font: "inherit",
      }}
    >
      <span style={{ width: 11, height: 11, borderRadius: 2, background: color || "transparent", border: color ? "none" : "1px dashed var(--text-muted)", flexShrink: 0 }} />
      <span style={{ color: "var(--text-secondary)", flex: 1 }}>{label}</span>
      {count != null && <span style={{ ...mono, color: "var(--text-muted)", fontSize: 11 }}>{count.toLocaleString()}</span>}
    </button>
  );
}

export function Model3DLegend({
  mode,
  statusLegend,
  fabLegend,
  sequences,
  sequenceGuids,
  isolatedKey,
  onIsolate,
  markFallback,
  onMarkFallback,
}: {
  mode: Model3DColorMode;
  statusLegend: Model3DStatusLegendRow[];
  fabLegend: FabLegendRow[];
  sequences: string[];
  sequenceGuids: Map<string, string[]>;
  isolatedKey: string | null;
  onIsolate: (key: string, guids: string[] | undefined) => void;
  markFallback: boolean;
  onMarkFallback: (enabled: boolean) => void;
}) {
  const isolateHint = <div style={{ ...hintStyle, fontSize: 10, marginTop: 4 }}>Click a row to isolate those parts; click again to show all.</div>;
  if (mode === "type") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {TYPE_LABELS.map(([key, label]) => <Swatch key={key} color={TYPE_PALETTE[key]} label={label} />)}
      </div>
    );
  }
  if (mode === "sequence") {
    if (!sequences.length) return <div style={hintStyle}>Import the piece roster to color by erection sequence.</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {sequences.slice(0, 24).map((sequence) => (
          <Swatch
            key={sequence}
            color={seqColor(sequence)}
            label={`Seq ${sequence}`}
            count={sequenceGuids.get(sequence)?.length}
            active={isolatedKey === `seq:${sequence}`}
            onClick={() => onIsolate(`seq:${sequence}`, sequenceGuids.get(sequence))}
            title="Isolate this erection sequence"
          />
        ))}
        {sequences.length > 24 && <div style={hintStyle}>+{sequences.length - 24} more</div>}
        {isolateHint}
      </div>
    );
  }
  if (mode === "status") {
    if (!statusLegend.length) return <div style={hintStyle}>No detailing status yet — pieces light up once they're linked to detailing packages. (For shop status, use the Fab mode.)</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {statusLegend.map((bucket) => (
          <Swatch
            key={bucket.key}
            color={bucket.color}
            label={bucket.label}
            count={bucket.count}
            active={isolatedKey === `status:${bucket.key}`}
            onClick={bucket.guids.length ? () => onIsolate(`status:${bucket.key}`, bucket.guids) : undefined}
            title={bucket.guids.length ? "Isolate these parts" : "No parts with a model GUID in this bucket"}
          />
        ))}
        {isolateHint}
      </div>
    );
  }
  if (mode === "fab") {
    const shown = fabLegend.filter((bucket) => bucket.count > 0);
    if (!shown.length) return <div style={hintStyle}>Save the model to import its roster, then Sync marks to paint Piece Register lifecycle.</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {shown.map((bucket) => (
          <Swatch
            key={bucket.key}
            color={bucket.color}
            label={bucket.label}
            count={bucket.count}
            active={isolatedKey === `fab:${bucket.key}`}
            onClick={() => onIsolate(`fab:${bucket.key}`, bucket.guids)}
            title={bucket.key === "unlinked" ? "Isolate parts with no Piece Register link or status" : `Isolate ${bucket.label} parts`}
          />
        ))}
        {isolateHint}
        <label style={{ ...hintStyle, fontSize: 10, display: "flex", alignItems: "center", gap: 6, marginTop: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={markFallback} onChange={(event) => onMarkFallback(event.target.checked)} style={{ margin: 0 }} />
          Fill unlinked parts from their mark's legacy status
        </label>
      </div>
    );
  }
  return <div style={hintStyle}>Showing the model's own (Tekla) member colors.</div>;
}
