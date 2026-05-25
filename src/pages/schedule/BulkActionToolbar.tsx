interface BulkActionToolbarProps {
  selectedCount: number;
  updatePending: boolean;
  deletePending: boolean;
  datePending: boolean;
  durationPending: boolean;
  resourcePending: boolean;
  showResourceInput: boolean;
  resourceValue: string;
  onStatus: (status: string) => void;
  onDelete: () => void;
  onEditDates: () => void;
  onEditDurations: () => void;
  onShowResourceInput: () => void;
  onResourceValueChange: (value: string) => void;
  onApplyResource: () => void;
  onCancelResource: () => void;
  onClear: () => void;
}

export default function BulkActionToolbar({
  selectedCount,
  updatePending,
  deletePending,
  datePending,
  durationPending,
  resourcePending,
  showResourceInput,
  resourceValue,
  onStatus,
  onDelete,
  onEditDates,
  onEditDurations,
  onShowResourceInput,
  onResourceValueChange,
  onApplyResource,
  onCancelResource,
  onClear,
}: BulkActionToolbarProps) {
  // Preserve the original mixed pending-flag combinations exactly.
  const statusBusy = updatePending || deletePending || datePending;
  const durationBusy = durationPending || updatePending || deletePending;
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 20,
        background: "var(--bg-surface-high)",
        border: "1px solid var(--accent-border)",
        borderRadius: 18,
        padding: "12px 16px",
        display: "flex",
        gap: 10,
        alignItems: "center",
        boxShadow: "0 18px 40px rgba(0,0,0,0.45), 0 0 24px color-mix(in srgb, var(--accent) 14%, transparent), inset 0 1px 0 rgba(255,255,255,0.06)",
        backdropFilter: "blur(24px) saturate(150%)",
        WebkitBackdropFilter: "blur(24px) saturate(150%)",
        zIndex: 20,
      }}
    >
      <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>
        {selectedCount} SELECTED
      </span>
      <button onClick={() => onStatus("Not Started")} disabled={statusBusy} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: statusBusy ? "not-allowed" : "pointer", opacity: statusBusy ? 0.6 : 1 }}>
        Set Not Started
      </button>
      <button onClick={() => onStatus("In Progress")} disabled={statusBusy} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--status-warning)", background: "rgba(234,179,8,0.12)", color: "var(--status-warning)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: statusBusy ? "not-allowed" : "pointer", opacity: statusBusy ? 0.6 : 1 }}>
        Set In Progress
      </button>
      <button onClick={() => onStatus("Complete")} disabled={statusBusy} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--status-success)", background: "var(--success-muted)", color: "var(--status-success)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: statusBusy ? "not-allowed" : "pointer", opacity: statusBusy ? 0.6 : 1 }}>
        Mark Complete
      </button>
      <button onClick={() => onStatus("Delayed")} disabled={statusBusy} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--status-error)", background: "var(--danger-muted)", color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: statusBusy ? "not-allowed" : "pointer", opacity: statusBusy ? 0.6 : 1 }}>
        Mark Delayed
      </button>
      <button onClick={onDelete} disabled={statusBusy} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--danger-border)", background: "var(--danger-muted)", color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: statusBusy ? "not-allowed" : "pointer", opacity: statusBusy ? 0.6 : 1 }}>
        Delete
      </button>
      <button onClick={onEditDates} disabled={statusBusy} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--accent)", background: "rgba(86,176,255,0.12)", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: statusBusy ? "not-allowed" : "pointer", opacity: statusBusy ? 0.6 : 1 }}>
        Edit Dates
      </button>
      <button onClick={onEditDurations} disabled={durationBusy} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--accent)", background: "rgba(86,176,255,0.12)", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: durationBusy ? "not-allowed" : "pointer", opacity: durationBusy ? 0.6 : 1 }}>
        Edit Durations
      </button>

      <div style={{ width: 1, height: 20, background: "var(--divider)", margin: "0 4px" }} />

      {!showResourceInput ? (
        <button
          onClick={onShowResourceInput}
          disabled={resourcePending}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--accent)",
            background: "rgba(173,198,255,0.10)",
            color: "var(--accent)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            cursor: resourcePending ? "not-allowed" : "pointer",
            opacity: resourcePending ? 0.6 : 1,
          }}
        >
          Assign Resources
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            autoFocus
            type="text"
            placeholder="Resource name(s)…"
            value={resourceValue}
            onChange={(e) => onResourceValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && resourceValue.trim()) {
                onApplyResource();
              } else if (e.key === "Escape") {
                onCancelResource();
              }
            }}
            style={{
              padding: "5px 8px",
              borderRadius: 6,
              border: "1px solid var(--accent)",
              background: "var(--bg-surface-low)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              width: 160,
              outline: "none",
            }}
          />
          <button
            onClick={() => {
              if (resourceValue.trim()) {
                onApplyResource();
              }
            }}
            disabled={!resourceValue.trim() || resourcePending}
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid var(--status-success)",
              background: "var(--success-muted)",
              color: "var(--status-success)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: !resourceValue.trim() || resourcePending ? "not-allowed" : "pointer",
              opacity: !resourceValue.trim() || resourcePending ? 0.5 : 1,
            }}
          >
            {resourcePending ? "Applying…" : "Apply"}
          </button>
          <button
            onClick={onCancelResource}
            style={{
              padding: "5px 8px",
              borderRadius: 6,
              border: "1px solid var(--divider)",
              background: "var(--bg-surface)",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      <button onClick={onClear} style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--divider)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}>
        Clear
      </button>
    </div>
  );
}
