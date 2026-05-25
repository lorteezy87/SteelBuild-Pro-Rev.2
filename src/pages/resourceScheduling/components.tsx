import { AlertTriangle, Clock3, UserCheck, Users } from "lucide-react";
import { formatHours, formatShortDate } from "./format";

export function ResourceGuruCommandStrip({ plan, focus, onFocusChange }) {
  const focusOptions = [
    { id: "all", label: "All", count: plan.resourceRows.length },
    { id: "personnel", label: "People", count: plan.personnelCount },
    { id: "equipment", label: "Equipment", count: plan.equipmentCount },
    { id: "available", label: "Available", count: plan.resourceRows.filter((row) => !row.unavailable && row.remainingHours > 0).length },
    { id: "issues", label: "Clashes", count: plan.issueRows.length },
  ];
  const roster = plan.resourceRows.slice(0, 6);
  const queue = plan.waitingList.slice(0, 5);

  return (
    <section className="resource-guru-strip" style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)",
      gap: 12,
      padding: 14,
      border: "1px solid var(--border-default)",
      borderRadius: 12,
      background: "var(--bg-surface)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 800 }}>
              Resource Guru Lens
            </div>
            <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, marginTop: 4 }}>
              People, bookings, capacity, and clashes in one planning strip.
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {focusOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onFocusChange(option.id)}
                style={{
                  minHeight: 34,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: focus === option.id ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                  background: focus === option.id ? "var(--accent-muted)" : "var(--bg-input)",
                  color: focus === option.id ? "var(--accent)" : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {option.label} {option.count}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 12 }}>
          <GuruMetric icon={Users} label="People" value={plan.personnelCount} sub={`${plan.onLeaveCount} unavailable`} color="var(--accent)" />
          <GuruMetric icon={UserCheck} label="Open Capacity" value={formatHours(plan.openCapacityHours)} sub={`${plan.utilizationPct}% booked`} color={plan.utilizationPct > 100 ? "var(--status-error)" : "var(--status-success)"} />
          <GuruMetric icon={AlertTriangle} label="Clashes" value={plan.clashCount} sub={`${plan.nearCapacityCount} tight`} color={plan.clashCount ? "var(--status-error)" : "var(--status-success)"} />
          <GuruMetric icon={Clock3} label="Waiting List" value={plan.waitingList.length} sub="Needs assignment" color={plan.waitingList.length ? "var(--status-warning)" : "var(--status-success)"} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
          {roster.map((row) => (
            <div key={row.resource.id} style={{
              minWidth: 0,
              padding: 10,
              borderRadius: 10,
              border: row.overAllocated ? "1px solid var(--danger-border)" : "1px solid var(--border-default)",
              background: row.overAllocated ? "var(--danger-muted)" : "var(--bg-surface-low)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.resource.name || "Unnamed resource"}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 2, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {row.type} / {row.resource.role || "No role"}
                  </div>
                </div>
                <span style={{ color: row.overAllocated ? "var(--status-error)" : row.unavailable ? "var(--text-muted)" : "var(--status-success)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, whiteSpace: "nowrap" }}>
                  {row.unavailable ? row.status : `${row.utilizationPct}%`}
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: "var(--border-default)", overflow: "hidden", margin: "8px 0 6px" }}>
                <div style={{
                  width: `${Math.min(100, row.utilizationPct)}%`,
                  height: "100%",
                  background: row.overAllocated ? "var(--status-error)" : row.nearCapacity ? "var(--status-warning)" : "var(--accent)",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8 }}>
                <span>{formatHours(row.assignedHours)} / {formatHours(row.capacityHours)}</span>
                <span>{formatShortDate(row.nextBookingDate)}</span>
              </div>
              {row.flags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  {row.flags.slice(0, 2).map((flag) => (
                    <span key={flag} style={{
                      border: "1px solid var(--border-default)",
                      borderRadius: 999,
                      padding: "2px 6px",
                      color: row.overAllocated ? "var(--status-error)" : "var(--text-secondary)",
                      background: "var(--bg-input)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}>
                      {flag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <aside style={{ minWidth: 0, border: "1px solid var(--border-default)", borderRadius: 10, background: "var(--bg-surface-low)", padding: 10 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 800, marginBottom: 8 }}>
          Waiting List / Approval Queue
        </div>
        {queue.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {queue.map((item) => (
              <div key={item.key} style={{ padding: 8, border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--bg-input)" }}>
                <div style={{ color: "var(--text-primary)", fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.label}
                </div>
                <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {item.type} / {item.reason}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5, padding: "12px 4px" }}>
            No unassigned demand or over-capacity bookings in the current filter.
          </div>
        )}
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 10, lineHeight: 1.6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          No auto-overbooking. Move the booking, adjust dates, or approve capacity changes from the project team.
        </div>
      </aside>
    </section>
  );
}

export function GuruMetric({ icon: Icon, label, value, sub, color }) {
  return (
    <div style={{ minWidth: 0, padding: 10, border: "1px solid var(--border-default)", borderRadius: 10, background: "var(--bg-surface-low)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color }}>
        <Icon size={14} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{ color, fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, marginTop: 7, lineHeight: 1 }}>{value}</div>
      <div style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 5 }}>{sub}</div>
    </div>
  );
}
