import React, { useMemo, useState } from "react";
import { formatLocalDate } from "@/utils/dates";
import PieceRelationshipManager from "@/components/pieceControl/PieceRelationshipManager";
import CanonicalFabReleasePanel from "@/components/pieceControl/CanonicalFabReleasePanel";
import { PieceProductionControl } from "@/components/pieceControl/PieceProductionControl";
import { PieceLogisticsControl } from "@/components/pieceControl/PieceLogisticsControl";
import { useProjectContext } from "@/components/shared/ProjectContext";

const PHASE_COLORS = {
  Detailing: "var(--status-info)",
  Fabrication: "var(--status-warning)",
  Delivery: "var(--accent)",
  Erection: "var(--status-success)",
};

const STATUS_COLORS = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

// Corrected 7-stage flow (migration 077): Not Started → IFA → OFA → BFA
// → OFS → IFC → Released.
const STAGE_STYLES = {
  "Not Started": { bg: "rgba(144,144,149,0.12)", color: "var(--text-muted)" },
  IFA: { bg: "rgba(96,165,250,0.12)", color: "var(--status-info)" },
  OFA: { bg: "rgba(0,229,255,0.12)", color: "var(--status-info)" },
  BFA: { bg: "rgba(255,185,95,0.12)", color: "var(--status-warning)" },
  OFS: { bg: "rgba(68,226,205,0.12)", color: "var(--secondary)" },
  IFC: { bg: "rgba(52,211,153,0.15)", color: "var(--status-success)" },
  Released: { bg: "rgba(168,240,203,0.12)", color: "var(--status-success)" },
};

export default function WorkPackageDetailModal({ wp, drawings = [], onClose, onEdit }) {
  const [tab, setTab] = useState("overview");
  const { activeProject } = useProjectContext();

  const drawingMap = useMemo(() => {
    const m = {};
    drawings.forEach((d) => (m[d.id] = d));
    return m;
  }, [drawings]);

  if (!wp) return null;

  const phaseColor = PHASE_COLORS[wp.phase] || "var(--text-muted)";
  const statusColorVal = STATUS_COLORS[wp.status] || "var(--text-muted)";
  const percent = Math.min(100, Math.max(0, Number(wp.percent_complete) || 0));

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 999,
        }}
      />
      <div
        className="sbd-card-strong"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          background: "var(--bg-surface-low)",
          borderLeft: `3px solid ${phaseColor}`,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            background: "var(--bg-surface-low)",
            padding: "20px 24px",
            borderBottom: "1px solid var(--divider)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em" }}>
                {wp.wp_number}
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                {wp.name}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <Pill text={wp.phase || "—"} color={phaseColor} />
                <Pill text={wp.status || "—"} color={statusColorVal} />
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 22, cursor: "pointer" }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--divider)" }}>
          {["overview", "piece control", "drawings", "hours", "notes"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--border-default)",
                background: tab === t ? "var(--bg-surface)" : "var(--bg-surface-low)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => onEdit?.(wp)}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            EDIT
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {tab === "overview" && <OverviewTab wp={wp} phaseColor={phaseColor} statusColor={statusColorVal} percent={percent} />}
          {tab === "piece control" && (
            <>
              <PieceRelationshipManager
                projectId={wp.project_id}
                focusedWorkPackageId={wp.id}
                compact
              />
              <PieceProductionControl
                projectId={wp.project_id}
                workPackageId={wp.id}
                pieceControlMode={
                  activeProject?.id === wp.project_id
                    ? String(activeProject?.piece_control_mode ?? "off")
                    : "off"
                }
              />
              <PieceLogisticsControl
                projectId={wp.project_id}
                workPackageId={wp.id}
                pieceControlMode={
                  activeProject?.id === wp.project_id
                    ? String(activeProject?.piece_control_mode ?? "off")
                    : "off"
                }
              />
              <CanonicalFabReleasePanel
                projectId={wp.project_id}
                workPackageId={wp.id}
                pieceControlMode={
                  activeProject?.id === wp.project_id
                    ? String(activeProject?.piece_control_mode ?? "off")
                    : "off"
                }
              />
            </>
          )}
          {tab === "drawings" && <DrawingsTab wp={wp} drawingMap={drawingMap} />}
          {tab === "hours" && <HoursTab wp={wp} />}
          {tab === "notes" && <NotesTab notes={wp.notes} />}
        </div>
      </div>
    </>
  );
}

function OverviewTab({ wp, phaseColor, statusColor, percent }) {
  const formatDate = (d) =>
    d
      ? formatLocalDate(`${d}T00:00:00Z`, "en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—";

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <MiniCard label="Tonnage" value={`${(Number(wp.tonnage) || 0).toFixed(1)}T`} color="var(--text-primary)" />
        <MiniCard label="% Complete" value={`${percent}%`} color={phaseColor} />
        <MiniCard label="Crew" value={wp.crew || "—"} color="var(--text-secondary)" />
        <MiniCard label="Released" value={wp.released_date ? formatDate(wp.released_date) : "—"} color="var(--accent)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 10 }}>
        <CheckItem label="VIF Confirmed" done={wp.vif_confirmed} detail={wp.vif_confirmed_by} />
        <CheckItem label="Load List" done={wp.load_list_complete} />
        <CheckItem label="Sequence" done={wp.sequence_confirmed} />
      </div>
    </>
  );
}

function DrawingsTab({ wp, drawingMap }) {
  const ids = (wp.linked_drawing_ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!ids.length) {
    return (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
        No drawings linked — add via Edit.
      </div>
    );
  }

  const formatDate = (d) =>
    d
      ? formatLocalDate(`${d}T00:00:00Z`, "en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px 70px 80px", gap: 8 }}>
      <HeaderRow labels={["Sheet", "Title", "Stage", "Rev", "Due"]} />
      {ids.map((id) => {
        const d = drawingMap[id];
        const style = d ? STAGE_STYLES[d.stage] || STAGE_STYLES["Not Started"] : STAGE_STYLES["Not Started"];
        const overdue = d?.due_date && new Date(`${d.due_date}T00:00:00Z`) < new Date() && d.stage !== "Released";
        return (
          <React.Fragment key={id}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>{d?.sheet_number || id}</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {d?.title || "—"}
            </div>
            <div
              style={{
                background: style.bg,
                color: style.color,
                padding: "2px 7px",
                borderRadius: "var(--radius-badge)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {d?.stage || "Not Started"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{d?.revision_number || "0"}</div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: overdue ? "var(--status-error)" : "var(--text-muted)",
                fontWeight: overdue ? 700 : 500,
              }}
            >
              {d?.due_date ? formatDate(d.due_date).replace(", 2026", "") : "—"}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function HoursTab({ wp }) {
  const rows = [
    { label: "Shop", actual: wp.shop_hours_actual, budget: wp.shop_hours_budget },
    { label: "Field", actual: wp.field_hours_actual, budget: wp.field_hours_budget },
  ];

  const color = (a, b) => {
    if (!b) return "var(--text-muted)";
    return Number(a || 0) <= Number(b || 0) ? "var(--status-success)" : "var(--status-error)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => {
        const pct = r.budget ? Math.min(100, Math.round(((Number(r.actual) || 0) / Number(r.budget)) * 100)) : 0;
        const c = color(r.actual, r.budget);
        return (
          <div key={r.label}>
            <Label text={`${r.label} Hours`} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 6, background: "var(--bg-surface-high)", borderRadius: 3 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: c, borderRadius: 3 }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: c }}>
                {(r.actual || 0)}/{r.budget || 0}h ({pct}%)
              </span>
            </div>
          </div>
        );
      })}
      <div>
        <Label text="Total" />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)" }}>
          {(Number(wp.shop_hours_actual || 0) + Number(wp.field_hours_actual || 0)).toFixed(0)}/
          {(Number(wp.shop_hours_budget || 0) + Number(wp.field_hours_budget || 0)).toFixed(0)}h
        </div>
      </div>
    </div>
  );
}

function NotesTab({ notes }) {
  return (
    <div style={{ fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)" }}>
      {notes ? notes : "No notes recorded."}
    </div>
  );
}

function MiniCard({ label, value, color }) {
  return (
    <div
      className="sbd-card"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: 12,
      }}
    >
      <Label text={label} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function CheckItem({ label, done, detail }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: done ? "var(--status-success)" : "var(--text-muted)" }}>
      <span>{done ? "✓" : "○"}</span>
      {label}
      {detail && <span style={{ color: "var(--text-secondary)", marginLeft: 4 }}>· {detail}</span>}
    </div>
  );
}

function HeaderRow({ labels }) {
  return (
    <>
      {labels.map((l) => (
        <div
          key={l}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {l}
        </div>
      ))}
    </>
  );
}

function Pill({ text, color }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: "var(--radius-badge)",
        background: `${color}18`,
        color,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {text}
    </span>
  );
}

function Label({ text }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        color: "var(--text-muted)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        marginBottom: 4,
      }}
    >
      {text}
    </div>
  );
}
