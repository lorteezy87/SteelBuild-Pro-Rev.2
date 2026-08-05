import React from "react";
import { BicPill } from "@/components/design-system";
import { AGENDA_GROUPS } from "@/lib/commandCenter/rfiAgenda";

const GROUP_ACCENT = {
  Overdue: "var(--status-error)",
  Blocking: "var(--status-warning)",
  "Due Soon": "var(--status-warning)",
  "Awaiting Response": "var(--status-info)",
};

const PRIORITY_COLOR = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-info)",
  Low: "var(--text-muted)",
};

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportAgendaCsv(agenda) {
  const header = ["Group", "RFI", "Title", "Reason", "Ball In Court", "Priority"];
  const rows = agenda.items.map((i) => [
    i.group, i.rfiNumber || "", i.title, i.reason, i.bic, i.priority || "",
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rfi-agenda-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AgendaRow({ item, onOpenRfi }) {
  const accent = GROUP_ACCENT[item.group] || "var(--text-muted)";
  return (
    <button
      type="button"
      onClick={() => onOpenRfi?.(item.rfi)}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
        padding: "8px 12px", background: "transparent", border: "none",
        borderTop: "1px solid var(--divider)", cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)", minWidth: 64, whiteSpace: "nowrap" }}>
        {item.rfiNumber || "RFI"}
      </span>
      <span style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.title}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: accent,
        border: `1px solid ${accent}`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
      }}>
        {item.reason}
      </span>
      {item.priority && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: PRIORITY_COLOR[item.priority] || "var(--text-muted)", whiteSpace: "nowrap" }}>
          {item.priority}
        </span>
      )}
      <BicPill bic={item.bic || "Contractor"} />
    </button>
  );
}

export default function AgendaPanel({ agenda, onOpenRfi, onClose }) {
  const { total, counts } = agenda;
  return (
    <div className="sbd-card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "12px 16px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface-low)",
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Today's RFI Agenda
        </span>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
          {total} item{total === 1 ? "" : "s"} · {counts.overdue} overdue · {counts.blocking} blocking · {counts.dueSoon} due soon · {counts.awaiting} awaiting
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => exportAgendaCsv(agenda)}
            disabled={total === 0}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              padding: "5px 10px", borderRadius: 6, cursor: total === 0 ? "default" : "pointer",
              background: "transparent", border: "1px solid var(--border-default)",
              color: total === 0 ? "var(--text-muted)" : "var(--text-secondary)", textTransform: "uppercase",
            }}
          >
            Export CSV
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                padding: "5px 10px", borderRadius: 6, cursor: "pointer",
                background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-muted)", textTransform: "uppercase",
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {total === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
          Nothing needs attention today — no overdue, blocking, due-soon, or awaiting RFIs.
        </div>
      ) : (
        AGENDA_GROUPS.map((group) => {
          const items = agenda.groups[group];
          if (!items || items.length === 0) return null;
          const accent = GROUP_ACCENT[group];
          return (
            <div key={group}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 16px",
                background: "var(--bg-surface)", borderTop: "1px solid var(--divider)",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: accent }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {group}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>· {items.length}</span>
              </div>
              {items.map((item) => (
                <AgendaRow key={item.rfiId} item={item} onOpenRfi={onOpenRfi} />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
