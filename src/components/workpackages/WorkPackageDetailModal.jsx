import React, { useEffect, useMemo, useState } from "react";
import { formatShortDate, localToday, toLocalDay } from "@/utils/dates";
import PieceRelationshipManager from "@/components/pieceControl/PieceRelationshipManager";
import CanonicalFabReleasePanel from "@/components/pieceControl/CanonicalFabReleasePanel";
import { PieceProductionControl } from "@/components/pieceControl/PieceProductionControl";
import { PieceLogisticsControl } from "@/components/pieceControl/PieceLogisticsControl";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { describePieceCounts } from "@/pages/workPackages/canonical";
import "@/styles/piece-control-command.css";

const PHASE_COLORS = {
  Detailing: "var(--phase-detailing)",
  Fabrication: "var(--phase-fab)",
  Delivery: "var(--phase-delivery)",
  Erection: "var(--phase-erection)",
};

const STATUS_COLORS = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

// Corrected 7-stage flow (migration 077): Not Started → IFA → OFA → BFA
// → OFS → IFC → Released.
const STAGE_COLORS = {
  "Not Started": "var(--text-muted)",
  IFA: "var(--status-info)",
  OFA: "var(--status-info)",
  BFA: "var(--status-warning)",
  OFS: "var(--accent)",
  IFC: "var(--status-success)",
  Released: "var(--status-success)",
};

const TABS = ["scope", "release gate", "production", "logistics", "field"];

/**
 * Work package drawer.
 *
 * `wp` is the enriched row from the Control Center (carries `_signals` with
 * the Fab Release + piece rollup join) — the page passes the live cache row,
 * so a status change or realtime refetch shows here without reopening.
 *
 * Navigation and mutations are injected (`onNavigate`, `onSetStatus`,
 * `onDelete`) so the drawer renders without a Router in unit tests and the
 * page keeps ownership of data access.
 */
export default function WorkPackageDetailModal({
  wp,
  drawings = [],
  onClose,
  onEdit = null,
  onDelete = null,
  onSetStatus = null,
  statusPending = false,
  onNavigate = null,
}) {
  const [tab, setTab] = useState("scope");
  const { activeProject } = useProjectContext();

  const drawingMap = useMemo(() => {
    const m = {};
    drawings.forEach((d) => (m[d.id] = d));
    return m;
  }, [drawings]);

  // Escape closes the drawer; every other modal in the app already does.
  useEffect(() => {
    if (!wp) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wp, onClose]);

  if (!wp) return null;

  const signals = wp._signals || {};
  const phase = signals.phase || wp.phase;
  const status = signals.status || wp.status;
  const phaseColor = PHASE_COLORS[phase] || "var(--text-muted)";
  const statusColorVal = STATUS_COLORS[status] || "var(--text-muted)";
  const percent = Math.min(100, Math.max(0, Number(wp.percent_complete) || 0));
  const pieceControlMode =
    activeProject?.id === wp.project_id ? String(activeProject?.piece_control_mode ?? "off") : "off";
  const release = signals.release || null;

  return (
    <>
      <button
        type="button"
        aria-label="Close work package details"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "color-mix(in srgb, var(--bg-base) 55%, transparent)",
          border: 0,
          padding: 0,
          zIndex: 999,
        }}
      />
      <div
        className="sbd-card-strong"
        role="dialog"
        aria-modal="true"
        aria-label={`Work package ${wp.wp_number || ""}`}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(680px, 100vw)",
          background: "var(--bg-surface-low)",
          borderLeft: `3px solid ${phaseColor}`,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          style={{
            background: "var(--bg-surface-low)",
            padding: "20px 24px",
            borderBottom: "1px solid var(--divider)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em" }}>
                {wp.wp_number}
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                {wp.name}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <Pill
                  text={`${phase || "—"}${signals.phaseMismatch ? "*" : ""}`}
                  color={phaseColor}
                  title={signals.phaseMismatch ? `Derived from pieces; stored phase is ${signals.storedPhase}` : undefined}
                />
                <Pill text={status || "—"} color={statusColorVal} />
                {release && (
                  <Pill
                    text={!release.released ? "Release pending" : release.isException ? "Exception release" : "Released"}
                    color={!release.released ? "var(--text-muted)" : release.isException ? "var(--status-warning)" : "var(--status-success)"}
                    title={release.releaseNumber || undefined}
                  />
                )}
                {signals.pieceDriven && <Pill text="Piece-driven" color="var(--status-info)" title="Status and % complete come from the piece rollup" />}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          <QuickActions
            wp={wp}
            signals={signals}
            onSetStatus={onSetStatus}
            statusPending={statusPending}
            onNavigate={onNavigate}
            pieceControlMode={pieceControlMode}
          />
        </div>

        <div style={{ display: "flex", gap: 6, padding: "10px 16px", borderBottom: "1px solid var(--divider)", flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              style={tabButtonStyle(tab === t)}
            >
              {t}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {onEdit && (
            <button type="button" onClick={() => onEdit(wp)} style={tabButtonStyle(false)}>
              EDIT
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(wp)}
              style={{ ...tabButtonStyle(false), color: "var(--status-error)" }}
            >
              DELETE
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {tab === "scope" && (
            <>
              <SectionTitle
                eyebrow="Scope"
                title="Package scope and execution context"
                detail="Identity, sequence, schedule, readiness, and package notes."
              />
              <OverviewTab wp={wp} signals={signals} phaseColor={phaseColor} percent={percent} />
              <NotesTab notes={wp.notes} />
            </>
          )}

          {tab === "release gate" && (
            <div className="work-package-piece-control-drawer" data-skin="command">
              <SectionTitle
                eyebrow="Release Gate"
                title="Drawings and release authority"
                detail="Drawing approval evidence and the canonical fabrication release gate."
              />
              <DrawingsTab wp={wp} drawingMap={drawingMap} onNavigate={onNavigate} />
              <CanonicalFabReleasePanel
                projectId={wp.project_id}
                workPackageId={wp.id}
                pieceControlMode={pieceControlMode}
              />
            </div>
          )}

          {tab === "production" && (
            <div className="work-package-piece-control-drawer" data-skin="command">
              <SectionTitle
                eyebrow="Production"
                title="Piece and shop execution"
                detail="Package assignment, shop stations, and labor performance."
              />
              <PieceRelationshipManager
                projectId={wp.project_id}
                focusedWorkPackageId={wp.id}
                compact
              />
              <PieceProductionControl
                projectId={wp.project_id}
                workPackageId={wp.id}
                pieceControlMode={pieceControlMode}
              />
              <HoursTab wp={wp} />
            </div>
          )}

          {tab === "logistics" && (
            <div className="work-package-piece-control-drawer" data-skin="command">
              <SectionTitle
                eyebrow="Logistics"
                title="Load and shipment execution"
                detail="Piece logistics stay tied to the canonical package and piece register."
              />
              <PieceLogisticsControl
                projectId={wp.project_id}
                workPackageId={wp.id}
                pieceControlMode={pieceControlMode}
              />
            </div>
          )}

          {tab === "field" && (
            <FieldTab wp={wp} signals={signals} />
          )}
        </div>
      </div>
    </>
  );
}

function tabButtonStyle(active) {
  return {
    padding: "6px 10px",
    borderRadius: "var(--radius-btn)",
    border: "1px solid var(--border-default)",
    background: active ? "var(--bg-surface)" : "var(--bg-surface-low)",
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 700,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    cursor: "pointer",
  };
}

const actionButtonStyle = (tone = "var(--text-secondary)", disabled = false) => ({
  padding: "5px 9px",
  borderRadius: "var(--radius-btn)",
  border: `1px solid color-mix(in srgb, ${tone} 40%, var(--border-default))`,
  background: `color-mix(in srgb, ${tone} 8%, transparent)`,
  color: tone,
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  whiteSpace: "nowrap",
});

/**
 * The next thing a PM does from a package: hold / resume / complete when the
 * status is hand-set, and jump to the page that owns the other work
 * (release, piece stations, drawing log, loads).
 */
function QuickActions({ wp, signals, onSetStatus, statusPending, onNavigate, pieceControlMode }) {
  const status = signals.status || wp.status;
  const statusActions = [];
  if (onSetStatus) {
    if (status === "On Hold") {
      statusActions.push({ label: "Resume", status: "In Progress", tone: "var(--status-success)" });
    } else {
      statusActions.push({ label: "Hold", status: "On Hold", tone: "var(--status-warning)" });
    }
    if (status !== "Complete") {
      statusActions.push({ label: "Mark complete", status: "Complete", tone: "var(--status-success)" });
    }
    if (status === "Not Started") {
      statusActions.push({ label: "Start", status: "In Progress", tone: "var(--status-info)" });
    }
  }
  const navActions = onNavigate
    ? [
      { target: "fab_release", label: signals.released ? "Fab Release" : "Release gate", tone: "var(--phase-fab)" },
      ...(pieceControlMode !== "off" ? [{ target: "piece_register", label: "Piece register", tone: "var(--accent)" }] : []),
      { target: "drawings", label: "Drawing log", tone: "var(--phase-detailing)" },
      { target: "deliveries", label: "Loads", tone: "var(--phase-delivery)" },
    ]
    : [];
  if (!statusActions.length && !navActions.length) return null;
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
      {statusActions.map((action) => (
        <button
          key={action.label}
          type="button"
          disabled={statusPending}
          onClick={() => onSetStatus(wp, action.status)}
          style={actionButtonStyle(action.tone, statusPending)}
        >
          {action.label}
        </button>
      ))}
      {statusActions.length > 0 && navActions.length > 0 && (
        <span style={{ width: 1, height: 16, background: "var(--divider)" }} />
      )}
      {navActions.map((action) => (
        <button
          key={action.target}
          type="button"
          onClick={() => onNavigate(action.target, wp)}
          style={actionButtonStyle(action.tone)}
        >
          {action.label} →
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ eyebrow, title, detail }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 3,
        paddingBottom: 10,
        borderBottom: "1px solid var(--divider)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          color: "var(--accent)",
          letterSpacing: "0.11em",
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </div>
      <strong style={{ color: "var(--text-primary)", fontSize: 14 }}>{title}</strong>
      <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{detail}</span>
    </div>
  );
}

function FieldTab({ wp, signals }) {
  const pieces = signals.pieces || null;
  const fieldHours = Number(wp.field_hours_actual || 0);
  const fieldBudget = Number(wp.field_hours_budget || 0);
  const fieldBurn = fieldBudget > 0 ? Math.round((fieldHours / fieldBudget) * 100) : null;
  const fieldReady = Boolean(
    wp.vif_confirmed &&
    wp.sequence_confirmed &&
    (wp.load_list_complete || pieces?.delivered || pieces?.erected),
  );

  return (
    <>
      <SectionTitle
        eyebrow="Field"
        title="Erection readiness"
        detail="Known field prerequisites, delivered/erected piece state, and field labor."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <CheckItem label="VIF Confirmed" done={wp.vif_confirmed} detail={wp.vif_confirmed_by} />
        <CheckItem label="Load List" done={wp.load_list_complete} />
        <CheckItem label="Sequence" done={wp.sequence_confirmed} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <MiniCard
          label="Field Readiness"
          value={fieldReady ? "Ready" : "Prerequisites open"}
          color={fieldReady ? "var(--status-success)" : "var(--status-warning)"}
        />
        <MiniCard
          label="Field Hours"
          value={fieldBudget > 0 ? `${fieldHours.toFixed(0)}/${fieldBudget.toFixed(0)}h · ${fieldBurn}%` : `${fieldHours.toFixed(0)}h · budget unknown`}
          color={fieldBurn != null && fieldBurn > 100 ? "var(--status-error)" : "var(--text-secondary)"}
        />
        <MiniCard
          label="Delivered Pieces"
          value={pieces ? String(pieces.delivered || 0) : "Unknown"}
          color="var(--text-secondary)"
        />
        <MiniCard
          label="Erected Pieces"
          value={pieces ? String(pieces.erected || 0) : "Unknown"}
          color="var(--text-secondary)"
        />
      </div>

      <div>
        <Label text="Field sequence" />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            ["Area", wp.area],
            ["Sequence", wp.sequence_number],
            ["Install", wp.install_phase],
            ["Start", wp.scheduled_start_date ? formatShortDate(wp.scheduled_start_date) : null],
            ["Finish", wp.scheduled_end_date ? formatShortDate(wp.scheduled_end_date) : null],
          ].filter(([, value]) => value).map(([label, value]) => (
            <span key={label} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-badge)", padding: "3px 7px" }}>
              {label}: {value}
            </span>
          ))}
          {![wp.area, wp.sequence_number, wp.install_phase, wp.scheduled_start_date, wp.scheduled_end_date].some(Boolean) && (
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Field sequence evidence unavailable.</span>
          )}
        </div>
      </div>
    </>
  );
}

function OverviewTab({ wp, signals, phaseColor, percent }) {
  const tons = Number(wp.tonnage) || 0;
  const release = signals.release || null;
  const flags = signals.flags || [];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <MiniCard label="Tonnage" value={tons > 0 ? `${tons.toFixed(1)}T` : "— (not set)"} color={tons > 0 ? "var(--text-primary)" : "var(--text-muted)"} />
        <MiniCard label={signals.pieceDriven ? "% Complete (pieces)" : "% Complete"} value={`${percent}%`} color={phaseColor} />
        <MiniCard label="Crew" value={wp.crew || "—"} color="var(--text-secondary)" />
        <MiniCard label="Readiness" value={signals.readinessScore != null ? `${signals.readinessScore}%` : "—"} color="var(--text-secondary)" />
        <MiniCard label="Scheduled" value={`${formatShortDate(wp.scheduled_start_date)} → ${formatShortDate(wp.scheduled_end_date)}`} color={signals.overdue ? "var(--status-error)" : "var(--text-secondary)"} />
        <MiniCard
          label="Fab release"
          value={release
            ? `${release.released ? "Released" : "Pending"}${release.releaseDate ? ` ${formatShortDate(release.releaseDate)}` : ""}`
            : wp.released_date ? `Stamped ${formatShortDate(wp.released_date)}` : "—"}
          color={release?.released ? (release.isException ? "var(--status-warning)" : "var(--status-success)") : "var(--text-muted)"}
        />
      </div>

      {release && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
          {release.releaseNumber || "Release"}
          {release.weightTons != null ? ` · ${release.weightTons.toFixed(1)}T released` : ""}
          {release.count > 1 ? ` · ${release.count} release rows` : ""}
          {release.isException ? " · exception release (see Risks)" : ""}
        </div>
      )}

      {signals.pieces && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
          Pieces: {describePieceCounts(signals.pieces)}
        </div>
      )}

      {(wp.area || wp.sequence_number || wp.trade_phase || wp.shipping_phase || wp.install_phase) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            ["Area", wp.area],
            ["Seq", wp.sequence_number],
            ["Trade", wp.trade_phase],
            ["Ship", wp.shipping_phase],
            ["Install", wp.install_phase],
          ].filter(([, value]) => value).map(([label, value]) => (
            <span key={label} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-badge)", padding: "2px 7px" }}>
              {label}: {value}
            </span>
          ))}
        </div>
      )}

      {flags.length > 0 && (
        <div>
          <Label text="Flags" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {flags.map((flag) => (
              <Pill
                key={flag.key || flag.label}
                text={flag.label}
                color={flag.severity === "high" ? "var(--status-error)" : flag.severity === "medium" ? "var(--status-warning)" : "var(--text-muted)"}
              />
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 10 }}>
        <CheckItem label="VIF Confirmed" done={wp.vif_confirmed} detail={wp.vif_confirmed_by} />
        <CheckItem label="Load List" done={wp.load_list_complete} />
        <CheckItem label="Sequence" done={wp.sequence_confirmed} />
      </div>
    </>
  );
}

function DrawingsTab({ wp, drawingMap, onNavigate }) {
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

  const today = toLocalDay(localToday());
  const groups = new Map();
  for (const id of ids) {
    const d = drawingMap[id];
    const key = (d?.drawing_set_name || "").trim() || "Unassigned set";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id, d });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {onNavigate && (
        <button type="button" onClick={() => onNavigate("drawings", wp)} style={actionButtonStyle("var(--phase-detailing)")}>
          Open drawing log →
        </button>
      )}
      {[...groups.entries()].map(([setName, rows]) => (
        <div key={setName}>
          <Label text={`${setName} · ${rows.length} sheet${rows.length === 1 ? "" : "s"}`} />
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px 50px 70px", gap: 8, alignItems: "center" }}>
            <HeaderRow labels={["Sheet", "Title", "Stage", "Rev", "Due"]} />
            {rows.map(({ id, d }) => {
              const stage = d?.stage || "Not Started";
              const stageColor = STAGE_COLORS[stage] || "var(--text-muted)";
              const due = toLocalDay(d?.due_date);
              const overdue = Boolean(due && today && due < today && stage !== "Released" && stage !== "IFC");
              return (
                <React.Fragment key={id}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: d ? "var(--accent)" : "var(--text-muted)", fontWeight: 700 }} title={d ? undefined : "Sheet not found in the drawing log (deleted or another project)"}>
                    {d?.sheet_number || "missing"}
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d?.title || "—"}
                  </div>
                  <div
                    style={{
                      background: `color-mix(in srgb, ${stageColor} 14%, transparent)`,
                      color: stageColor,
                      padding: "2px 7px",
                      borderRadius: "var(--radius-badge)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    {stage}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{d?.revision_number ?? "0"}</div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: overdue ? "var(--status-error)" : "var(--text-muted)",
                      fontWeight: overdue ? 700 : 500,
                    }}
                  >
                    {due ? formatShortDate(due, { withYear: false }) : "—"}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ))}
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
    <div style={{ fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
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
        minWidth: 0,
      }}
    >
      <Label text={label} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
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

function Pill({ text, color, title }) {
  return (
    <span
      title={title}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: "var(--radius-badge)",
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
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
