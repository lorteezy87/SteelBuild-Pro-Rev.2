import React, { useState } from "react";
import { toast } from "sonner";
import {
  CONSTRAINT_TYPES,
  PRIORITY_CONFIG,
  STATUS_CONFIG,
  TYPE_COLORS,
  TYPE_ICONS,
  abbreviateType,
  formatDate,
  formatShortDate,
  inputStyle,
  labelStyle,
} from "./constraintsConfig";

export function KpiStrip({ kpis }) {
  const cards = [
    { label: "Open", value: kpis.open.length, color: kpis.open.length ? "var(--status-warning)" : "var(--status-success)" },
    { label: "Overdue", value: kpis.overdue.length, color: kpis.overdue.length ? "var(--status-error)" : "var(--text-muted)" },
    { label: "Critical", value: kpis.critical.length, color: kpis.critical.length ? "var(--status-error)" : "var(--text-muted)" },
    { label: "In Progress", value: kpis.inProg.length, color: "var(--accent)" },
    { label: "Resolved", value: kpis.resolved.length, color: "var(--status-success)" },
    { label: "Total", value: kpis.total, color: "var(--text-muted)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
      {cards.map((c) => (
        <div key={c.label} style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-card)", borderTop: `2px solid ${c.color}`, padding: "12px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600, color: c.color, lineHeight: 1.1 }}>{c.value}</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

export function PriorityBar({ byPriority }) {
  const openTotal = byPriority.reduce((s, p) => s + p.count, 0);
  if (!openTotal) return null;
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Open Constraint Priority Distribution</div>
      <div style={{ display: "flex", height: 8, borderRadius: "var(--radius-card)", overflow: "hidden", background: "var(--bg-surface-high)" }}>
        {byPriority.map((p) => {
          const width = openTotal ? Math.max((p.count / openTotal) * 100, 3) : 0;
          return <div key={p.priority} style={{ width: `${width}%`, background: PRIORITY_CONFIG[p.priority].dot }} />;
        })}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
        {byPriority.map((p) => (
          <div key={p.priority} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: PRIORITY_CONFIG[p.priority].dot }} />
            <span style={{ color: PRIORITY_CONFIG[p.priority].color }}>{p.priority}</span>
            <span>{p.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverdueStrip({ overdue, onClickItem }) {
  return (
    <div style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderLeft: "4px solid var(--status-error)", borderRadius: "var(--radius-card)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
        Alert {overdue.length} Constraint{overdue.length === 1 ? "" : "s"} Past Due | Immediate Resolution Required
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {overdue.map((c) => (
          <div key={c.id} onClick={() => onClickItem(c.id)} style={{ background: "rgba(255,180,171,0.15)", border: "1px solid var(--danger-border)", borderRadius: "var(--radius-badge)", padding: "3px 10px", whiteSpace: "nowrap", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", display: "flex", alignItems: "center", gap: 6 }} title={c.title}>
            <span>{TYPE_ICONS[c.constraint_type] || "OTH"}</span>
            <span>{(c.title || "").slice(0, 30)}</span>
            <span>| Due {formatShortDate(c.due_date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FilterBar({ filterStatus, filterPriority, filterType, setFilterStatus, setFilterPriority, setFilterType }) {
  const statusOptions = ["all", "open", "In Progress", "Resolved", "Closed"];
  const priorityOptions = ["all", "Critical", "High", "Medium", "Low"];
  const activeCount = (filterStatus !== "open" ? 1 : 0) + (filterPriority !== "all" ? 1 : 0) + (filterType !== "all" ? 1 : 0);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 6 }}>
        {statusOptions.map((s) => (
          <button key={s} type="button" onClick={() => setFilterStatus(s)} style={{ background: filterStatus === s ? "var(--accent)" : "var(--bg-surface-low)", color: filterStatus === s ? "#0A0A0B" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
            {s === "open" ? "Open" : s}
          </button>
        ))}
      </div>
      <span style={{ color: "var(--border-strong)" }}>|</span>
      <div style={{ display: "flex", gap: 6 }}>
        {priorityOptions.map((p) => (
          <button key={p} type="button" onClick={() => setFilterPriority(p)} style={{ background: filterPriority === p ? PRIORITY_CONFIG[p]?.bg || "var(--accent)" : "var(--bg-surface-low)", color: filterPriority === p ? PRIORITY_CONFIG[p]?.color || "#0A0A0B" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
            {p}
          </button>
        ))}
      </div>
      <span style={{ color: "var(--border-strong)" }}>|</span>
      <div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...inputStyle, width: "auto", height: 32 }}>
          <option value="all">All Types</option>
          {CONSTRAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {activeCount > 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--accent)", background: "var(--accent-muted)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-badge)", padding: "3px 8px", letterSpacing: "0.10em", textTransform: "uppercase" }}>{activeCount} Filters Active</div>}
    </div>
  );
}

export function EmptyState({ hasOpen }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)" }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>CN</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--status-success)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{hasOpen ? "No Open Constraints" : "No Constraints Found"}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{hasOpen ? "All constraints are resolved. Good standing." : "Try adjusting your filters."}</div>
    </div>
  );
}

export function ListView({ items, wps, expandedId, setExpandedId, onQuickUpdate, onEdit, onDelete }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          borderBottom: "1px solid var(--divider)",
          padding: "9px 16px",
          display: "grid",
          gridTemplateColumns: "6px 28px 1fr 110px 80px 90px 80px 100px",
          gap: 12,
          alignItems: "center",
        }}
      >
        {["", "!", "Constraint", "Type", "WP", "Area", "Due", "Actions"].map((h) => (
          <div
            key={h}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            {h}
          </div>
        ))}
      </div>

      {items.map((c) => {
        const typeColor = TYPE_COLORS[c.constraint_type] || "var(--text-muted)";
        const overdue = c.due_date && new Date(`${c.due_date}T00:00:00Z`) < new Date() && !["Resolved", "Closed"].includes(c.status);
        const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.Open;
        const wp = wps.find((w) => w.id === c.work_package_id);
        const expanded = expandedId === c.id;

        return (
          <div key={c.id} style={{ borderBottom: "1px solid var(--divider)" }}>
            <div
              style={{
                padding: "10px 16px",
                display: "grid",
                gridTemplateColumns: "6px 28px 1fr 110px 80px 90px 80px 100px",
                gap: 12,
                alignItems: "center",
                background: expanded ? "var(--bg-surface-low)" : "transparent",
              }}
            >
              <div style={{ width: 6, height: 44, borderRadius: 2, background: typeColor }} />

              <button
                type="button"
                onClick={() => setExpandedId((prev) => (prev === c.id ? null : c.id))}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-surface-high)",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                {expanded ? "-" : "+"}
              </button>

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.title || "Untitled constraint"}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    color: "var(--text-muted)",
                  }}
                >
                  <span
                    style={{
                      color: typeColor,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    {abbreviateType(c.constraint_type)}
                  </span>
                  <span
                    style={{
                      background: statusCfg.bg,
                      color: statusCfg.color,
                      borderRadius: "var(--radius-badge)",
                      padding: "1px 6px",
                      fontSize: 8,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {statusCfg.label}
                  </span>
                  <span style={{ color: PRIORITY_CONFIG[c.priority]?.color || "var(--text-muted)" }}>{c.priority || "Medium"}</span>
                  {overdue && <span style={{ color: "var(--status-error)", fontWeight: 700 }}>OVERDUE</span>}
                </div>
              </div>

              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: typeColor }}>
                {abbreviateType(c.constraint_type)}
              </div>

              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>
                {wp ? wp.wp_number : "-"}
              </div>

              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>
                {c.project_area || "-"}
              </div>

              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: overdue ? "var(--status-error)" : "var(--text-secondary)",
                }}
              >
                {formatShortDate(c.due_date)}
              </div>

              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <MiniBtn label="Edit" tone="accent" onClick={() => onEdit(c)} />
                <MiniBtn label="Delete" tone="muted" onClick={() => onDelete(c)} />
              </div>
            </div>

            {expanded && (
              <div
                style={{
                  padding: "14px 16px 16px 62px",
                  background: "var(--bg-surface-low)",
                  borderTop: "1px solid var(--divider)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {c.description && (
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {c.description}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12 }}>
                  <Meta label="Work Package" value={wp ? `${wp.wp_number} | ${wp.name}` : "None"} />
                  <Meta label="Area" value={c.project_area || "-"} />
                  <Meta label="Assigned To" value={c.assigned_to || "-"} />
                  <Meta label="Due Date" value={formatDate(c.due_date)} />
                  <Meta label="Created" value={formatDate(c.created_date)} />
                  <Meta label="Priority" value={c.priority || "Medium"} />
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {c.status === "Open" && (
                    <ActionBtn label="Start" tone="accent" onClick={() => onQuickUpdate(c.id, { status: "In Progress" })} />
                  )}
                  {!["Resolved", "Closed"].includes(c.status) && (
                    <ActionBtn label="Resolve" tone="success" onClick={() => onQuickUpdate(c.id, { status: "Resolved" })} />
                  )}
                  {c.status === "Resolved" && (
                    <ActionBtn label="Reopen" tone="warning" onClick={() => onQuickUpdate(c.id, { status: "Open" })} />
                  )}
                  {c.status !== "Closed" && (
                    <ActionBtn label="Close" tone="muted" onClick={() => onQuickUpdate(c.id, { status: "Closed" })} />
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BoardView({ items, wps, onQuickUpdate, onEdit, onDelete }) {
  const lanes = [
    { status: "Open", title: "Open", items: items.filter((c) => c.status === "Open") },
    { status: "In Progress", title: "In Progress", items: items.filter((c) => c.status === "In Progress") },
    { status: "Resolved", title: "Resolved", items: items.filter((c) => c.status === "Resolved") },
    { status: "Closed", title: "Closed", items: items.filter((c) => c.status === "Closed") },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, alignItems: "start" }}>
      {lanes.map((lane) => {
        const statusCfg = STATUS_CONFIG[lane.status] || STATUS_CONFIG.Open;

        return (
          <div
            key={lane.status}
            style={{
              background: "var(--bg-surface-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--divider)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: statusCfg.color,
                }}
              >
                {statusCfg.label}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  background: "var(--bg-surface-high)",
                  borderRadius: "var(--radius-badge)",
                  padding: "2px 8px",
                }}
              >
                {lane.items.length}
              </div>
            </div>

            <div style={{ padding: 10 }}>
              {lane.items.length === 0 ? (
                <div
                  style={{
                    padding: "24px 12px",
                    textAlign: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  No open constraints
                </div>
              ) : (
                lane.items.map((c) => {
                  const typeColor = TYPE_COLORS[c.constraint_type] || "var(--text-muted)";
                  const overdue = c.due_date && new Date(`${c.due_date}T00:00:00Z`) < new Date() && !["Resolved", "Closed"].includes(c.status);
                  const cardStatusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.Open;
                  const wp = wps.find((w) => w.id === c.work_package_id);

                  return (
                    <div
                      key={c.id}
                      style={{
                        background: "var(--bg-surface)",
                        border: overdue ? "1px solid var(--danger-border)" : "1px solid var(--border-default)",
                        borderLeft: `3px solid ${typeColor}`,
                        borderRadius: "var(--radius-card)",
                        padding: "12px",
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 14, color: typeColor }}>{TYPE_ICONS[c.constraint_type] || "OTH"}</span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 7,
                              fontWeight: 700,
                              color: typeColor,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: 140,
                            }}
                          >
                            {abbreviateType(c.constraint_type)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onEdit(c)}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-btn)",
                            padding: "3px 7px",
                            color: "var(--text-secondary)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 8,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          EDIT
                        </button>
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          lineHeight: 1.3,
                          marginBottom: 6,
                          maxHeight: 34,
                          overflow: "hidden",
                        }}
                      >
                        {c.title || "Untitled constraint"}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          fontSize: 9,
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-muted)",
                          marginBottom: 8,
                        }}
                      >
                        {c.assigned_to && <span>ASGN {c.assigned_to}</span>}
                        {c.due_date && <span>DUE {formatShortDate(c.due_date)}</span>}
                        <span
                          style={{
                            background: cardStatusCfg.bg,
                            color: cardStatusCfg.color,
                            borderRadius: "var(--radius-badge)",
                            padding: "1px 6px",
                            fontSize: 8,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          {cardStatusCfg.label}
                        </span>
                        {overdue && <span style={{ color: "var(--status-error)", fontWeight: 700 }}>OVERDUE</span>}
                      </div>

                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          color: "var(--text-muted)",
                          marginBottom: 8,
                        }}
                      >
                        {wp ? wp.wp_number : "No WP"} | {c.project_area || "No Area"}
                      </div>

                      <div style={{ display: "flex", gap: 4, borderTop: "1px solid var(--divider)", paddingTop: 8 }}>
                        {c.status === "Open" && (
                          <MiniBtn label="Start" tone="accent" onClick={() => onQuickUpdate(c.id, { status: "In Progress" })} />
                        )}
                        {!["Resolved", "Closed"].includes(c.status) && (
                          <MiniBtn label="Resolve" tone="success" onClick={() => onQuickUpdate(c.id, { status: "Resolved" })} />
                        )}
                        {c.status === "Resolved" && (
                          <MiniBtn label="Reopen" tone="warning" onClick={() => onQuickUpdate(c.id, { status: "Open" })} />
                        )}
                        <MiniBtn label="Delete" tone="muted" onClick={() => onDelete(c)} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--text-muted)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-primary)",
          fontWeight: 600,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick, tone = "accent" }) {
  const styles = {
    accent: {
      background: "var(--accent-muted)",
      border: "1px solid var(--accent-border)",
      color: "var(--accent)",
    },
    success: {
      background: "var(--success-muted)",
      border: "1px solid var(--success-border)",
      color: "var(--status-success)",
    },
    warning: {
      background: "var(--warning-muted)",
      border: "1px solid var(--warning-border)",
      color: "var(--status-warning)",
    },
    muted: {
      background: "transparent",
      border: "1px solid var(--border-strong)",
      color: "var(--text-muted)",
    },
    neutral: {
      background: "var(--bg-surface-high)",
      border: "1px solid var(--border-default)",
      color: "var(--text-secondary)",
    },
  };
  const s = styles[tone] || styles.accent;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...s,
        borderRadius: "var(--radius-btn)",
        padding: "5px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {label}
    </button>
  );
}

function MiniBtn({ label, onClick, tone = "muted" }) {
  const tones = {
    accent: { bg: "var(--accent-muted)", border: "var(--accent-border)", color: "var(--accent)" },
    success: { bg: "var(--success-muted)", border: "var(--success-border)", color: "var(--status-success)" },
    warning: { bg: "var(--warning-muted)", border: "var(--warning-border)", color: "var(--status-warning)" },
    muted: { bg: "transparent", border: "var(--border-default)", color: "var(--text-muted)" },
  };
  const t = tones[tone] || tones.muted;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.color,
        borderRadius: "var(--radius-btn)",
        padding: "3px 8px",
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export function ConstraintFormModal({ projectId, constraint, wps, onClose, onSave }) {
  const isEdit = !!constraint;
  const [form, setForm] = useState(
    constraint
      ? { ...constraint }
      : {
          title: "",
          constraint_type: "Other",
          description: "",
          project_area: "",
          work_package_id: "",
          assigned_to: "",
          due_date: "",
          status: "Open",
          priority: "High",
          project_id: projectId || "",
        }
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title?.trim()) {
      toast.error("Title is required");
      return;
    }
    onSave(form);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 24,
          maxWidth: 580,
          width: "95%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
              textTransform: "uppercase",
              letterSpacing: "0.10em",
            }}
          >
            {isEdit ? `Edit - ${constraint.title}` : "New Constraint"}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
          {CONSTRAINT_TYPES.map((type) => {
            const active = form.constraint_type === type;
            const color = TYPE_COLORS[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => set("constraint_type", type)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background: active ? `${color}18` : "var(--bg-surface-low)",
                  border: `1px solid ${active ? color : "var(--border-default)"}`,
                  borderRadius: "var(--radius-btn)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.1s",
                }}
              >
                <span style={{ fontSize: 14, color: active ? color : "var(--text-muted)", flexShrink: 0 }}>
                  {TYPE_ICONS[type] || "?"}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    color: active ? color : "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    lineHeight: 1.3,
                  }}
                >
                  {type}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input
              style={inputStyle}
              value={form.title}
              placeholder="Brief description of what is blocking progress"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Details</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              value={form.description}
              placeholder="What is blocking? What is needed to resolve? Any relevant context."
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Project Area / Grid</label>
              <input
                style={inputStyle}
                value={form.project_area}
                onChange={(e) => set("project_area", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Work Package</label>
              <select
                style={inputStyle}
                value={form.work_package_id || ""}
                onChange={(e) => set("work_package_id", e.target.value)}
              >
                <option value="">None</option>
                {wps.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.wp_number} | {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Assigned To</label>
              <input
                style={inputStyle}
                value={form.assigned_to}
                onChange={(e) => set("assigned_to", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input
                style={inputStyle}
                type="date"
                value={form.due_date || ""}
                onChange={(e) => set("due_date", e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select
                style={inputStyle}
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {["Open", "In Progress", "Resolved", "Closed"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <div style={{ display: "flex", gap: 6 }}>
                {["Critical", "High", "Medium", "Low"].map((p) => {
                  const cfg = PRIORITY_CONFIG[p];
                  const active = form.priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set("priority", p)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        background: active ? cfg.bg : "var(--bg-surface-low)",
                        border: `1px solid ${active ? cfg.border : "var(--border-default)"}`,
                        borderRadius: "var(--radius-btn)",
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        fontWeight: 700,
                        color: active ? cfg.color : "var(--text-muted)",
                        textTransform: "uppercase",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        transition: "all 0.1s",
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? cfg.dot : "var(--text-muted)" }} />
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "8px 16px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              style={{
                background: "var(--status-error)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "8px 20px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {isEdit ? "Save Changes" : "Log Constraint"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
