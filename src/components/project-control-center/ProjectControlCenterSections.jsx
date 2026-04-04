import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  getSeverityBackground,
  getSeverityColor,
  PHASE_OPTIONS,
  PROJECT_CONTROL_CENTER_RISK_CATEGORIES,
  PROJECT_CONTROL_CENTER_WAITING_BUCKETS,
  RESPONSIBLE_PARTY_OPTIONS,
} from "./controlCenterRules";

function Panel({ title, right, children, minHeight }) {
  return (
    <section
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: 16,
        minHeight,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--accent)", textTransform: "uppercase", marginBottom: 4 }}>
            Project Control Center
          </div>
          <h3 style={{ margin: 0, fontSize: 15, color: "var(--text-primary)" }}>{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function EmptyPanelState({ title, detail }) {
  return (
    <div
      style={{
        minHeight: 120,
        border: "1px dashed var(--border-default)",
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 6,
        color: "var(--text-muted)",
        textAlign: "center",
        padding: 18,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, letterSpacing: "0.12em" }}>OK</div>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, maxWidth: 260 }}>{detail}</div>
    </div>
  );
}

function Pill({ label, color, background }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 8px",
        borderRadius: 999,
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        background,
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {label}
    </span>
  );
}

function LinkButton({ route, label }) {
  return (
    <Link
      to={createPageUrl(route)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid var(--border-default)",
        background: "var(--bg-elevated)",
        color: "var(--text-primary)",
        textDecoration: "none",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </Link>
  );
}

function InlineSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        background: "var(--bg-input)",
        border: "1px solid var(--border-default)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-body)",
        fontSize: 12,
        borderRadius: 8,
        padding: "7px 10px",
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function RecordLinks({ records }) {
  if (!records?.length) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {records.slice(0, 3).map((record) => (
        <Link
          key={`${record.entityType}-${record.entityId || record.label}`}
          to={createPageUrl(record.route)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "var(--text-secondary)",
            textDecoration: "none",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <span>{record.entityType}</span>
          <span style={{ color: "var(--text-primary)" }}>{record.label}</span>
        </Link>
      ))}
    </div>
  );
}

export function ControlCenterHeader({ projectName, filters, setFilters }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 16, marginBottom: 18 }}>
      <div
        style={{
          background: "linear-gradient(135deg, rgba(0,229,255,0.08), rgba(255,122,0,0.04))",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 18,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--accent)", textTransform: "uppercase", marginBottom: 8 }}>
          Project Control Center
        </div>
        <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.05, color: "var(--text-primary)" }}>
          Deterministic control for steel project risk, follow-up, and next actions.
        </h1>
        <p style={{ margin: "12px 0 0", color: "var(--text-secondary)", maxWidth: 780, fontSize: 14, lineHeight: 1.5 }}>
          Today's priorities, waiting-on items, revision pressure, cost exposure, and schedule risk are ranked from live project records for {projectName || "the active project"}.
        </p>
      </div>

      <div
        style={{
          background: "rgba(255,122,0,0.05)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase" }}>
          Filters
        </div>
        <InlineSelect value={filters.severity} onChange={(value) => setFilters((prev) => ({ ...prev, severity: value }))} options={["All", "Critical", "High", "Medium", "Low"]} />
        <InlineSelect value={filters.phase} onChange={(value) => setFilters((prev) => ({ ...prev, phase: value }))} options={PHASE_OPTIONS} />
        <InlineSelect value={filters.owner} onChange={(value) => setFilters((prev) => ({ ...prev, owner: value }))} options={RESPONSIBLE_PARTY_OPTIONS} />
        <InlineSelect value={filters.status} onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))} options={["All", "Open", "Pending", "In Progress", "Submitted", "Under Review", "Answered", "Resolved"]} />
      </div>
    </div>
  );
}

export function KeyMetricsPanel({ metrics }) {
  if (!metrics) {
    return (
      <Panel title="Key Metrics">
        <EmptyPanelState title="No project metrics yet" detail="Select a project to compute control-center KPIs." />
      </Panel>
    );
  }

  const cards = [
    ["Open RFIs", metrics.openRFIs],
    ["Overdue RFIs", metrics.overdueRFIs],
    ["Pending Submittals", metrics.pendingSubmittals],
    ["Pending Change Orders", metrics.pendingChangeOrders],
    ["Potential CO Exposure", `$${metrics.potentialCOExposure.toLocaleString()}`],
    ["Committed vs Budget", metrics.committedCostVsBudget],
    ["Actual vs Budget", metrics.actualCostVsBudget],
    ["Fab Completion", `${metrics.fabCompletionPercentage}%`],
    ["Erection Progress", `${metrics.erectionProgressPercentage}%`],
    ["Overdue Tasks", metrics.overdueTasks],
    ["Unresolved Revisions", metrics.unresolvedRevisions],
    ["Hottest Risk This Week", metrics.hottestRiskThisWeek],
  ];

  return (
    <Panel title="Key Project Metrics">
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        {cards.map(([label, value]) => (
          <div key={label} style={{ padding: 12, borderRadius: 10, background: "var(--bg-surface-low)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
            <div style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PriorityCard({ item }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: getSeverityBackground(item.severity), border: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{item.title}</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45 }}>{item.reason}</div>
        </div>
        <Pill label={item.severity} color={getSeverityColor(item.severity)} background="rgba(0,0,0,0.18)" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <Pill label={item.category} color="var(--text-primary)" background="rgba(255,255,255,0.06)" />
        <Pill label={item.status || "Open"} color="var(--accent)" background="rgba(0,229,255,0.08)" />
        {item.phase && <Pill label={item.phase} color="var(--text-secondary)" background="rgba(255,255,255,0.05)" />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Due</div>
          <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{item.dueDate || "No due date"}</div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Owner</div>
          <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{item.owner || "Unassigned"}</div>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <RecordLinks records={item.linkedRecords} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Score {item.score}</div>
        <LinkButton route={item.route} label={item.quickActionLabel || "Open"} />
      </div>
    </div>
  );
}

export function PrioritiesPanel({ items }) {
  return (
    <Panel title="Today's Priorities" right={<div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{items.length} ranked</div>} minHeight={420}>
      {!items.length ? <EmptyPanelState title="No urgent priorities" detail="No immediate project control items are crossing the current rule thresholds." /> : <div style={{ display: "grid", gap: 10 }}>{items.map((item) => <PriorityCard key={item.id} item={item} />)}</div>}
    </Panel>
  );
}

export function RecommendedActionsPanel({ items }) {
  return (
    <Panel title="Recommended Next Actions" right={<div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Rules-based</div>}>
      {!items.length ? (
        <EmptyPanelState title="No recommended actions" detail="Current project records do not require immediate follow-up actions." />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => (
            <div key={item.id} style={{ padding: 12, borderRadius: 10, background: "var(--bg-surface-low)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{item.title}</div>
                <Pill label={item.priority} color={getSeverityColor(item.priority)} background={getSeverityBackground(item.priority)} />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45, marginBottom: 10 }}>{item.reason}</div>
              <div style={{ marginBottom: 10 }}>
                <RecordLinks records={[item.linkedRecord]} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{item.linkedRecord.label}</div>
                <LinkButton route={item.route} label={item.oneClickLabel || "Open"} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function RiskWatchlistPanel({ items }) {
  return (
    <Panel title="Risk Watchlist" right={<div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{PROJECT_CONTROL_CENTER_RISK_CATEGORIES.length} categories</div>} minHeight={520}>
      {!items.length ? (
        <EmptyPanelState title="No live risks" detail="The current project records are not surfacing acute schedule, cost, revision, procurement, field, or approval risks." />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => (
            <div key={item.id} style={{ padding: 12, borderRadius: 10, background: "var(--bg-surface-low)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45 }}>{item.impactSummary}</div>
                </div>
                <Pill label={item.severity} color={getSeverityColor(item.severity)} background={getSeverityBackground(item.severity)} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                <Pill label={item.category} color="var(--text-primary)" background="rgba(255,255,255,0.06)" />
                <Pill label={item.mitigationStatus || "Open"} color="var(--accent)" background="rgba(0,229,255,0.08)" />
                {item.phase && <Pill label={item.phase} color="var(--text-secondary)" background="rgba(255,255,255,0.05)" />}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Owner</div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{item.owner || "Unassigned"}</div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Due</div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{item.dueDate || "No due date"}</div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Linked</div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{item.linkedRecords[0]?.label || "Record"}</div>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <RecordLinks records={item.linkedRecords} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function WaitingOnPanel({ items }) {
  const bucketCounts = PROJECT_CONTROL_CENTER_WAITING_BUCKETS.map((bucket) => ({
    bucket,
    count: items.filter((item) => item.waitingOn === bucket).length,
  })).filter((entry) => entry.count > 0);

  return (
    <Panel title="Waiting On / Stuck Items" right={<div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{PROJECT_CONTROL_CENTER_WAITING_BUCKETS.length} buckets</div>} minHeight={420}>
      {!items.length ? (
        <EmptyPanelState title="No stuck items" detail="No live records are currently waiting on GC, engineer, architect, detailer, shop, field, or vendor responses." />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {bucketCounts.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {bucketCounts.map((entry) => (
                <Pill key={entry.bucket} label={`${entry.bucket} · ${entry.count}`} color="var(--status-warning)" background="rgba(255,184,0,0.10)" />
              ))}
            </div>
          )}
          {items.map((item) => (
            <div key={item.id} style={{ padding: 12, borderRadius: 10, background: "var(--bg-surface-low)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{item.title}</div>
                <Pill label={item.waitingOn} color="var(--status-warning)" background="rgba(255,184,0,0.12)" />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45, marginBottom: 10 }}>{item.impact}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Age</div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{item.ageDays} days</div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Last update</div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{item.latestUpdate || "Unknown"}</div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Phase</div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{item.phase || "Active"}</div>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <RecordLinks records={[item.linkedRecord]} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{item.followUpAction}</div>
                <LinkButton route={item.linkedRecord.route} label="Open record" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function RecentRevisionsPanel({ items }) {
  return (
    <Panel title="Recent Revisions">
      {!items.length ? (
        <EmptyPanelState title="No recent revisions" detail="Recent drawing revision activity will appear here." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((item) => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, background: "var(--bg-surface-low)" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{item.title}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  Rev {item.revision} · {item.stage} · {item.updatedDate || "No update date"}
                </div>
              </div>
              <LinkButton route={item.route} label="Open" />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function OverdueItemsPanel({ items }) {
  return (
    <Panel title="Overdue Items">
      {!items.length ? (
        <EmptyPanelState title="No overdue items" detail="The current project does not have overdue RFIs, deliveries, tasks, or unresolved constraints under the active filters." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((item) => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, background: "rgba(255,61,61,0.08)" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{item.title}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {item.type} · {item.owner || "Unassigned"} · {item.dueDate || "No due date"}
                </div>
              </div>
              <LinkButton route={item.route} label="Open" />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
