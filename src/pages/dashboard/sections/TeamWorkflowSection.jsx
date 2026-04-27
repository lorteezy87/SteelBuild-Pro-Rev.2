/**
 * TeamWorkflowSection — fourth panel of the project dashboard.
 *
 * Layout:
 *   1. Four role cards: Project Manager / Superintendent / GC / Detailer.
 *      Pulled from project columns (project_manager, superintendent_name,
 *      gc_company, detailer_company); falls back to "Unassigned" when
 *      blank so the card is still visible (the prototype hides empty
 *      cards but the user has explicitly asked for the dashboard to
 *      surface gaps so they can be filled in).
 *
 *   2. Task Distribution by Party — 4-column count grid (S&H / GC /
 *      EOR / Architect) with `tasks` total and an `in progress` sub.
 *
 *   3. In-Progress Tasks — list of up to 5 active items pulled from
 *      action_items + schedule_tasks. Empty state mirrors the prototype.
 *
 *   4. Quick Actions — 4 buttons matching the prototype: New RFI /
 *      New Submittal / Change Order / Field Report. Each fires
 *      `onNavigate("rfis|submittals|change-orders|field-reports")`
 *      with the new-form auto-open hint.
 */

import React, { useMemo } from "react";
import {
  Users,
  FileText, FilePlus, FileEdit, ClipboardList,
  HardHat, UserRound, Briefcase, Compass,
} from "lucide-react";
import SectionCard from "./SectionCard";
import { taskDistributionByParty } from "../projectMetrics";

export default function TeamWorkflowSection({
  project,
  actionItems = [],
  scheduleTasks = [],
  onNavigate,
}) {
  const distribution = useMemo(
    () => taskDistributionByParty(actionItems, scheduleTasks),
    [actionItems, scheduleTasks],
  );

  const inProgress = useMemo(() => {
    const all = [
      ...actionItems.map((a) => ({ id: `ai-${a.id}`, kind: "Action Item", title: a.title, status: a.status, party: a.assigned_party || a.responsible_party })),
      ...scheduleTasks.map((t) => ({ id: `st-${t.id}`, kind: "Task", title: t.title || t.name, status: t.status, party: t.assigned_party || t.responsible_party })),
    ];
    return all
      .filter((t) => ["In Progress", "Active", "Open"].includes(t.status))
      .slice(0, 5);
  }, [actionItems, scheduleTasks]);

  const overdueCount = useMemo(() => {
    const now = new Date();
    return actionItems.filter(
      (a) => a.due_date && new Date(a.due_date) < now &&
             !["Complete", "Cancelled"].includes(a.status),
    ).length;
  }, [actionItems]);

  // Punchlist isn't in scope here; show 0 unless the parent passes a count.
  const punchCount = 0;

  const stats = [
    { value: inProgress.length, label: "Active", color: "info" },
    { value: overdueCount, label: "Overdue",
      color: overdueCount > 0 ? "error" : "muted" },
    { value: punchCount, label: "Punch", color: "muted" },
  ];

  const roles = [
    { icon: UserRound, label: "Project Manager",     value: project?.project_manager || project?.pm || "Unassigned" },
    { icon: HardHat,   label: "Superintendent",      value: project?.superintendent_name || project?.superintendent || "Unassigned" },
    { icon: Briefcase, label: "General Contractor",  value: project?.gc_company || project?.contractor || "Unassigned" },
    { icon: Compass,   label: "Detailer",            value: project?.detailer_company || project?.detailer || "Internal Team" },
  ];

  return (
    <SectionCard
      icon={Users}
      iconColor="info"
      title="Team & Workflow"
      subtitle="Task assignments and collaboration"
      stats={stats}
    >
      {/* Role cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        marginBottom: 16,
      }}>
        {roles.map((r) => (
          <RoleCard key={r.label} icon={r.icon} label={r.label} value={r.value} />
        ))}
      </div>

      {/* Distribution */}
      <div style={{ marginBottom: 16 }}>
        <SubHeading>Task Distribution by Party</SubHeading>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
        }}>
          {Object.entries(distribution).map(([party, { tasks, inProgress }]) => (
            <PartyCell key={party} party={party} tasks={tasks} inProgress={inProgress} />
          ))}
        </div>
      </div>

      {/* In-progress tasks */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 10,
        }}>
          <SubHeading>In-Progress Tasks</SubHeading>
          <button
            onClick={() => onNavigate?.("schedule")}
            style={{
              background: "none", border: "none", padding: 0,
              color: "var(--accent)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            View Schedule →
          </button>
        </div>
        {inProgress.length === 0 ? (
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 12,
            color: "var(--text-muted)", fontStyle: "italic",
            textAlign: "center", padding: "16px 0",
          }}>
            No active tasks
          </div>
        ) : (
          inProgress.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px",
                marginBottom: 4,
                background: "var(--bg-surface-low)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
              }}
            >
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase",
                color: "var(--text-muted)",
                minWidth: 80,
              }}>
                {t.kind}
              </span>
              <span style={{
                flex: 1,
                fontFamily: "var(--font-body)", fontSize: 12,
                color: "var(--text-secondary)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {t.title}
              </span>
              {t.party && (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.06em",
                  padding: "2px 6px", borderRadius: 3,
                  background: "var(--bg-surface-high)",
                  color: "var(--text-muted)",
                }}>
                  {t.party}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Quick actions */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
      }}>
        <ActionBtn icon={FileText}     label="New RFI"        onClick={() => onNavigate?.("rfis", { create: true })} />
        <ActionBtn icon={FilePlus}     label="New Submittal"  onClick={() => onNavigate?.("submittals", { create: true })} />
        <ActionBtn icon={FileEdit}     label="Change Order"   onClick={() => onNavigate?.("change-orders", { create: true })} />
        <ActionBtn icon={ClipboardList} label="Field Report"  onClick={() => onNavigate?.("field-reports", { create: true })} />
      </div>
    </SectionCard>
  );
}

function RoleCard({ icon: IconCmp, label, value }) {
  const unassigned = value === "Unassigned";
  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderRadius: 8,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-muted)", marginBottom: 8,
      }}>
        <IconCmp size={12} />
        <span>{label}</span>
      </div>
      <div style={{
        fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
        color: unassigned ? "var(--text-muted)" : "var(--text-primary)",
        fontStyle: unassigned ? "italic" : "normal",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </div>
    </div>
  );
}

function PartyCell({ party, tasks, inProgress }) {
  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderRadius: 8,
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
        letterSpacing: "0.06em", color: "var(--text-secondary)",
        marginBottom: 8,
      }}>
        {party}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
        color: "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {tasks} {tasks === 1 ? "task" : "tasks"}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9,
        color: "var(--text-muted)", marginTop: 4,
      }}>
        {inProgress} in progress
      </div>
    </div>
  );
}

function ActionBtn({ icon: IconCmp, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "12px 14px",
        background: "var(--bg-surface-low)",
        border: "1px solid var(--accent-border)",
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
        letterSpacing: "0.06em",
        color: "var(--accent)",
        transition: "all 0.12s",
        justifyContent: "center",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--accent-muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-surface-low)";
      }}
    >
      <IconCmp size={13} />
      {label}
    </button>
  );
}

function SubHeading({ children }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.10em", textTransform: "uppercase",
      color: "var(--text-muted)", marginBottom: 10,
    }}>
      {children}
    </div>
  );
}
