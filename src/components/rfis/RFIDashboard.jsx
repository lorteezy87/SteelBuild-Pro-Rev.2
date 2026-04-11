import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const BIC_COLORS_MAP = {
  Contractor: "var(--accent)",
  GC: "#8B5CF6",
  Engineer: "var(--status-warning)",
  Architect: "var(--status-success)",
  Owner: "var(--status-error)",
};
import { formatDate, daysOverdue, isOverdue } from "../shared/formatters";
import StatusBadge from "../shared/StatusBadge";

const CLOSED_STATUSES = ["Answered", "Closed"];

const StatCard = ({ label, value, color, sublabel }) => {
  const colors = {
    teal:   { bg: "var(--info-muted)",       border: "var(--info-border)",       text: "var(--accent)" },
    red:    { bg: "var(--danger-muted)",     border: "rgba(255,23,68,0.25)",     text: "var(--status-error)" },
    amber:  { bg: "var(--warning-muted)",    border: "rgba(255,179,0,0.25)",     text: "var(--status-warning)" },
    green:  { bg: "var(--success-muted)",    border: "rgba(0,230,118,0.25)",     text: "#00E676" },
    slate:  { bg: "var(--hover-bg)", border: "var(--bg-surface-high)", text: "var(--text-secondary)" },
  };
  const c = colors[color] || colors.slate;

  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 12,
      padding: "16px 20px",
      flex: 1,
      minWidth: 110,
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 600, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 34, fontWeight: 700, color: c.text, lineHeight: 1 }}>{value}</div>
      {sublabel && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 6 }}>{sublabel}</div>}
    </div>
  );
};

const SectionHeader = ({ title, count, color = "var(--accent)" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, marginTop: 20 }}>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color, textTransform: "uppercase" }}>{title}</div>
    {count != null && (
      <span style={{ background: `${color}25`, border: `1px solid ${color}55`, color, borderRadius: 8, padding: "1px 7px", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700 }}>{count}</span>
    )}
    <div style={{ flex: 1, height: 1, background: "var(--divider)" }} />
  </div>
);

const MiniRow = ({ rfi, onClick }) => {
  const overdue = isOverdue(rfi.due_date, rfi.status, CLOSED_STATUSES);
  const days = overdue ? daysOverdue(rfi.due_date) : null;

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "8px 14px",
        borderBottom: "1px solid var(--hover-bg)",
        borderLeft: overdue
          ? (days > 14 ? `3px solid var(--status-error)` : `3px solid var(--status-warning)`)
          : "3px solid var(--accent)",
        background: overdue
          ? (days > 14 ? "var(--danger-muted)" : "var(--warning-muted)")
          : "rgba(0,229,255,0.06)",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
      onMouseLeave={(e) => e.currentTarget.style.background = overdue ? (days > 14 ? "var(--danger-muted)" : "var(--warning-muted)") : "rgba(0,229,255,0.06)"}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 600, minWidth: 70, flexShrink: 0 }}>{rfi.rfi_number || "—"}</div>
      <div style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rfi.title}</div>
      <div style={{ flexShrink: 0 }}><StatusBadge status={rfi.priority} /></div>
      <div style={{ flexShrink: 0, minWidth: 70, textAlign: "right" }}>
        {overdue
          ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: days > 14 ? "var(--status-error)" : "var(--status-warning)" }}>{days}d overdue</span>
          : <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{rfi.due_date ? `Due ${formatDate(rfi.due_date)}` : "No due date"}</span>
        }
      </div>
      <div style={{ flexShrink: 0 }}><StatusBadge status={rfi.status} /></div>
    </div>
  );
};

export default function RFIDashboard({ rfis = [], onEditRFI }) {
  const [collapsed, setCollapsed] = useState(false);

  const stats = useMemo(() => {
    const open = rfis.filter((r) => r.status === "Open").length;
    const underReview = rfis.filter((r) => r.status === "Under Review").length;
    const answered = rfis.filter((r) => r.status === "Answered").length;
    const closed = rfis.filter((r) => r.status === "Closed").length;
    const critical = rfis.filter((r) => r.priority === "Critical" && !CLOSED_STATUSES.includes(r.status)).length;
    const overdueItems = rfis.filter((r) => isOverdue(r.due_date, r.status, CLOSED_STATUSES));
    const blockingFab = overdueItems.filter((r) => r.work_package_id).length;

    // Upcoming: due within 7 days, not closed/answered
    const today = new Date();
    const in7 = new Date(today); in7.setDate(today.getDate() + 7);
    const upcoming = rfis.filter((r) => {
      if (!r.due_date || CLOSED_STATUSES.includes(r.status)) return false;
      const due = new Date(r.due_date);
      return due >= today && due <= in7;
    }).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    return { open, underReview, answered, closed, critical, overdueItems, blockingFab, upcoming };
  }, [rfis]);

  const avgResponseDays = useMemo(() => {
    const answered = rfis.filter((r) => r.responded_date && r.submitted_date);
    if (!answered.length) return null;
    const total = answered.reduce((sum, r) => {
      const diff = (new Date(r.responded_date) - new Date(r.submitted_date)) / 86400000;
      return sum + diff;
    }, 0);
    return Math.round(total / answered.length);
  }, [rfis]);

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 14,
      marginBottom: 16,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px",
          background: "var(--info-muted)",
          borderBottom: collapsed ? "none" : "1px solid var(--divider)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14 }}>⚑</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--accent)", textTransform: "uppercase" }}>RFI Summary Dashboard</span>
          {stats.overdueItems.length > 0 && (
            <span style={{ background: "var(--danger-muted)", border: "1px solid rgba(255,23,68,0.35)", color: "var(--status-error)", borderRadius: 8, padding: "1px 8px", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700 }}>
              {stats.overdueItems.length} OVERDUE
            </span>
          )}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", transition: "transform 0.2s", display: "inline-block", transform: collapsed ? "rotate(-90deg)" : "rotate(0)" }}>▾</span>
      </div>

      {!collapsed && (
        <div style={{ padding: "16px 20px 20px" }}>

          {/* Stat Cards Row */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <StatCard label="Open" value={stats.open} color="teal" />
            <StatCard label="Under Review" value={stats.underReview} color="amber" />
            <StatCard label="Answered" value={stats.answered} color="green" sublabel="of total" />
            <StatCard label="Closed" value={stats.closed} color="slate" />
            <StatCard label="Critical" value={stats.critical} color={stats.critical > 0 ? "red" : "slate"} sublabel="active" />
            <StatCard label="Overdue" value={stats.overdueItems.length} color={stats.overdueItems.length > 0 ? "red" : "slate"} sublabel={stats.blockingFab > 0 ? `${stats.blockingFab} blocking fab` : undefined} />
            {avgResponseDays != null && (
              <StatCard label="Avg Response" value={`${avgResponseDays}d`} color="teal" sublabel="turnaround" />
            )}
          </div>

          {/* Overdue RFIs */}
          {stats.overdueItems.length > 0 && (
            <div>
              <SectionHeader title="Overdue Items" count={stats.overdueItems.length} color="var(--status-error)" />
              <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--divider)" }}>
                {stats.overdueItems.slice(0, 8).map((r) => (
                  <MiniRow key={r.id} rfi={r} onClick={() => onEditRFI?.(r)} />
                ))}
                {stats.overdueItems.length > 8 && (
                  <div style={{ padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>
                    +{stats.overdueItems.length - 8} more overdue — use filters below
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Upcoming (7 days) */}
          {stats.upcoming.length > 0 && (
            <div>
              <SectionHeader title="Due Within 7 Days" count={stats.upcoming.length} color="var(--status-warning)" />
              <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--divider)" }}>
                {stats.upcoming.map((r) => (
                  <MiniRow key={r.id} rfi={r} onClick={() => onEditRFI?.(r)} />
                ))}
              </div>
            </div>
          )}

          {/* Ball in Court breakdown */}
          {(() => {
            const bicBreakdown = ["Contractor", "GC", "Engineer", "Architect", "Owner"]
              .map(party => ({
                party,
                count: rfis.filter(r =>
                  !["Answered", "Closed"].includes(r.status) &&
                  (r.ball_in_court === party || (!r.ball_in_court && party === "Contractor"))
                ).length,
              }))
              .filter(b => b.count > 0);

            if (!bicBreakdown.length) return null;
            return (
              <div style={{
                marginTop: 16,
                background: "var(--bg-surface-low)",
                borderRadius: "var(--radius-card)",
                padding: "14px 16px",
              }}>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "var(--text-primary)",
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}>
                  Ball in Court
                </div>
                <ResponsiveContainer width="100%" height={Math.max(60, bicBreakdown.length * 26)}>
                  <BarChart data={bicBreakdown} layout="vertical" barSize={14} margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="party"
                      tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--bg-surface-high)", border: "none", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 10 }}
                      cursor={{ fill: "var(--hover-bg)" }}
                    />
                    <Bar dataKey="count" radius={[0, 2, 2, 0]}>
                      {bicBreakdown.map((entry) => (
                        <Cell key={entry.party} fill={BIC_COLORS_MAP[entry.party] || "var(--accent)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* Avg response time */}
          {avgResponseDays !== null && (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              background: "var(--bg-surface-low)",
              borderRadius: "var(--radius-card)",
              marginTop: 8,
            }}>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9, fontWeight: 700,
                letterSpacing: "0.12em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}>
                Avg Response Time
              </span>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 24, fontWeight: 700,
                color: avgResponseDays > 14
                  ? "var(--status-error)"
                  : avgResponseDays > 7
                  ? "var(--status-warning)"
                  : "var(--status-success)",
                lineHeight: 1,
              }}>
                {avgResponseDays}
                <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4 }}>days</span>
              </span>
            </div>
          )}

          {stats.overdueItems.length === 0 && stats.upcoming.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0 4px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-success)", letterSpacing: "0.10em" }}>
              ✓ NO OVERDUE OR UPCOMING ITEMS
            </div>
          )}
        </div>
      )}
    </div>
  );
}