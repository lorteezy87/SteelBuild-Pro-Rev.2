/**
 * TeamWorkflowSection — fourth panel of the project dashboard.
 *
 * Layout:
 *   1. Four role cards: Project Manager / Superintendent / GC / Detailer.
 *      Pulled from canonical projects columns (project_manager,
 *      superintendent, general_contractor) plus a metadata.detailer
 *      slot since the projects table doesn't have a detailer column
 *      yet. Each card falls back to "Unassigned" when blank and is
 *      click-to-edit via InlineEditField — the original prototype
 *      hid empty cards, but the user explicitly asked the dashboard
 *      to surface gaps so PMs can fill them in without leaving the
 *      page.
 *
 *   2. Task Distribution by Type — 6-column count grid keyed off
 *      `task_type` (Fabrication / Delivery / Install / Submittal /
 *      Task / Milestone) with `tasks` total and an `in progress`
 *      sub-count. Replaced the prototype's "by Party" split because
 *      neither schedule_tasks nor action_items carries a party
 *      column in this schema.
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
  Layers, Grid3x3, Wrench,
} from "lucide-react";
import SectionCard from "./SectionCard";
import { taskDistributionByType } from "../projectMetrics";
import InlineEditField from "@/components/shared/InlineEditField";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useProjectContext } from "@/components/shared/useProjectContext";

export default function TeamWorkflowSection({
  project,
  actionItems = [],
  scheduleTasks = [],
  onNavigate,
}) {
  // Task distribution panel: distributes by `task_type` (the column
  // that's actually populated). Previously distributed by responsible
  // party, but no party column exists on schedule_tasks /
  // action_items in this schema, so it always read zero.
  const distribution = useMemo(
    () => taskDistributionByType(scheduleTasks),
    [scheduleTasks],
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

  // Canonical project columns: project_manager, superintendent,
  // general_contractor (NOT gc_company / superintendent_name —
  // those names were holdovers from the prototype and never matched
  // the schema). Detailer doesn't have its own column yet, so we
  // store it under metadata.detailer until a migration adds one.
  //
  // Joist / deck columns shipped with the kickoff-fields migration
  // (063_project_kickoff_fields.sql). They surface here as four
  // additional contact tiles so the project's full vendor stack is
  // visible on the dashboard without diving into the project profile.
  const detailerValue = project?.metadata?.detailer || null;
  const roles = [
    { icon: UserRound, label: "Project Manager",     field: "project_manager",      value: project?.project_manager || null },
    { icon: HardHat,   label: "Superintendent",      field: "superintendent",       value: project?.superintendent || null },
    { icon: Briefcase, label: "General Contractor",  field: "general_contractor",   value: project?.general_contractor || null },
    // Detailer rides on metadata until we get a column, so it routes
    // through a special metadata-aware mutation rather than the
    // generic InlineEditField.
    { icon: Compass,   label: "Detailer",            field: "metadata.detailer",    value: detailerValue },
    { icon: Layers,    label: "Joist Mfr",           field: "joist_manufacturer",   value: project?.joist_manufacturer || null },
    { icon: Grid3x3,   label: "Deck Mfr",            field: "deck_manufacturer",    value: project?.deck_manufacturer || null },
    { icon: Wrench,    label: "Deck Installer",      field: "deck_installer",       value: project?.deck_installer || null },
  ];

  return (
    <SectionCard
      icon={Users}
      iconColor="info"
      title="Team & Workflow"
      subtitle="Task assignments and collaboration"
      stats={stats}
    >
      {/* Role cards — click to edit. Auto-fit lets the grid wrap to
          two rows on narrower viewports rather than crushing all 7
          cards into a single row. minmax floor of 150px keeps each
          tile comfortable for the longer labels (e.g. "General
          Contractor", "Deck Installer"). */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 8,
        marginBottom: 16,
      }}>
        {roles.map((r) => (
          <RoleCard
            key={r.label}
            project={project}
            icon={r.icon}
            label={r.label}
            value={r.value}
            field={r.field}
          />
        ))}
      </div>

      {/* Distribution */}
      <div style={{ marginBottom: 16 }}>
        <SubHeading>Task Distribution by Type</SubHeading>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 8,
        }}>
          {Object.entries(distribution).map(([type, { tasks, inProgress }]) => (
            <PartyCell key={type} party={type} tasks={tasks} inProgress={inProgress} />
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

function RoleCard({ project, icon: IconCmp, label, value, field }) {
  // Detailer is stored on metadata until the projects table grows a
  // dedicated column. Route those edits through a small ad-hoc
  // mutation instead of the generic InlineEditField so the metadata
  // jsonb stays well-formed.
  const isMetadata = field?.startsWith("metadata.");

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
      {isMetadata ? (
        <MetadataInlineEdit
          project={project}
          metaKey={field.replace(/^metadata\./, "")}
          value={value}
          placeholder={label === "Detailer" ? "Internal Team" : "Unassigned"}
          emptyText={label === "Detailer" ? "Internal Team" : "Unassigned"}
        />
      ) : (
        <InlineEditField
          project={project}
          field={field}
          value={value}
          type="text"
          display="label"
          placeholder="Unassigned"
          emptyText="Unassigned"
        />
      )}
    </div>
  );
}

/**
 * Tiny shim that mimics InlineEditField but writes to a JSONB key
 * inside `metadata`. Used for fields without a dedicated column
 * (currently just `metadata.detailer`).
 */
function MetadataInlineEdit({ project, metaKey, value, placeholder, emptyText }) {
  const qc = useQueryClient();
  const { updateActiveProject } = useProjectContext();
  const mutation = useMutation({
    mutationFn: async (newValue) => {
      const merged = {
        ...(project?.metadata && typeof project.metadata === "object" ? project.metadata : {}),
        [metaKey]: newValue,
      };
      await base44.entities.Project.update(project.id, { metadata: merged });
      return merged;
    },
    onSuccess: (mergedMetadata) => {
      // Push the new metadata into ProjectContext so the parent
      // dashboard re-renders with the saved value (rather than
      // bouncing back to the placeholder while it waits for a
      // refetch). React-Query query-key invalidation alone wasn't
      // enough because ProjectContext maintains its own state.
      updateActiveProject?.({ metadata: mergedMetadata });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", project?.id] });
      qc.invalidateQueries({ queryKey: ["projects-summary"] });
    },
    onError: (err) => toast.error(`Save failed: ${err.message || "unknown"}`),
  });

  // Re-use InlineEditField's UI by funnelling its onAfterSave hook
  // through a synthetic project shape. We don't want a second copy of
  // the editor markup; instead we render a one-off button + input.
  // To avoid a parallel implementation, just render an InlineEditField
  // with a "shadow" project where the field lives at top level, and
  // intercept the value via onAfterSave is fragile — so we inline a
  // tiny editor here.
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || "");
  React.useEffect(() => setDraft(value || ""), [value]);

  if (!editing) {
    const isEmpty = !value;
    return (
      <button
        type="button"
        onClick={() => project?.id && setEditing(true)}
        disabled={!project?.id}
        title={project?.id ? "Click to edit" : "No project selected"}
        style={{
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "1px dashed transparent",
          borderRadius: 4,
          padding: "2px 6px",
          cursor: project?.id ? "pointer" : "default",
          fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
          color: isEmpty ? "var(--text-muted)" : "var(--text-primary)",
          fontStyle: isEmpty ? "italic" : "normal",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          if (!project?.id) return;
          e.currentTarget.style.borderColor = "var(--accent-border)";
          e.currentTarget.style.background = "var(--hover-bg)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "transparent";
          e.currentTarget.style.background = "transparent";
        }}
      >
        {value || emptyText || placeholder}
      </button>
    );
  }

  const commit = () => {
    const next = (draft || "").trim() || null;
    if (next !== (value || null)) mutation.mutate(next);
    setEditing(false);
  };

  return (
    <input
      autoFocus
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); setDraft(value || ""); setEditing(false); }
      }}
      placeholder={placeholder}
      style={{
        width: "100%",
        background: "var(--bg-page)",
        border: "1px solid var(--accent-border)",
        borderRadius: 4,
        padding: "2px 6px",
        fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
        color: "var(--text-primary)",
        outline: "none",
        boxShadow: "0 0 0 2px var(--accent-muted)",
      }}
    />
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
