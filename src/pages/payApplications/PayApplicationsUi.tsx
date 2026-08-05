/**
 * Presentational pieces for Pay Applications page shell.
 */
import { useState } from "react";
import { localToday } from "@/utils/dates";
import { toFiniteNumber } from "./payApplicationsPageHelpers";

export const paMono = { fontFamily: "var(--font-mono, ui-monospace, monospace)" } as const;
export const paCard = {
  background: "var(--bg-surface-secondary)",
  border: "1px solid var(--border-default)",
  borderRadius: 4,
  padding: 16,
} as const;
export const paInput = {
  ...paMono,
  boxSizing: "border-box" as const,
  fontSize: 12,
  padding: "6px 8px",
  borderRadius: 3,
  background: "var(--bg-input, var(--bg-surface-low))",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  outline: "none",
} as const;
export const paLbl = {
  ...paMono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 4,
} as const;
export const paBtn = {
  ...paMono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  padding: "7px 14px",
  borderRadius: 3,
  border: "1px solid var(--border-default)",
  cursor: "pointer",
} as const;
export const paBtnPrimary = {
  ...paBtn,
  background: "var(--accent-muted)",
  borderColor: "var(--accent)",
  color: "var(--accent)",
} as const;

export type NewAppCreateInput = {
  periodFrom: string | null;
  periodTo: string | null;
  retainagePercent: number;
};

export function NewAppModal({
  open,
  defaultRetainage,
  onClose,
  onCreate,
  busy,
}: {
  open: boolean;
  defaultRetainage?: number | null;
  onClose: () => void;
  onCreate: (input: NewAppCreateInput) => void;
  busy?: boolean;
}) {
  const [periodFrom, setFrom] = useState("");
  const [periodTo, setTo] = useState(localToday());
  const [retainage, setRetainage] = useState(String(defaultRetainage ?? 10));
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div style={{ ...paCard, width: 440, maxWidth: "92vw" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16, color: "var(--text-primary)" }}>New Pay Application</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <span style={paLbl}>Period from</span>
            <input
              style={{ ...paInput, width: "100%" }}
              type="date"
              value={periodFrom}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <span style={paLbl}>Period to</span>
            <input
              style={{ ...paInput, width: "100%" }}
              type="date"
              value={periodTo}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <span style={paLbl}>Retainage %</span>
            <input
              style={{ ...paInput, width: "100%" }}
              type="number"
              value={retainage}
              onChange={(e) => setRetainage(e.target.value)}
            />
          </div>
        </div>
        <div style={{ ...paMono, fontSize: 10, color: "var(--text-muted)", marginBottom: 14 }}>
          Lines are drafted from this project's Schedule of Values; prior completed work carries forward.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            style={{ ...paBtn, background: "var(--bg-page)", color: "var(--text-muted)" }}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            style={paBtnPrimary}
            disabled={busy}
            onClick={() =>
              onCreate({
                periodFrom: periodFrom || null,
                periodTo: periodTo || null,
                retainagePercent: toFiniteNumber(retainage),
              })
            }
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
