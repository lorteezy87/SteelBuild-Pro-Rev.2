/**
 * Constraints.jsx — Constraint Log page shell.
 *
 * Owns: complete project evidence,
 * create/update/delete mutations, the filter/derived-data useMemo
 * blocks, and composition of the feature-folder components.
 *
 * Every chunk of UI (KPI strip, priority bar, overdue strip, filters,
 * list/board views, expanded row, form modal, empty state) lives in
 * src/pages/constraints/.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import DeleteDialog from "@/components/shared/DeleteDialog";

import { useProjectId } from "@/hooks/useProjectId";
import { useResetOnProjectChange } from "@/hooks/useResetOnProjectChange";
import { useOrg } from "@/components/shared/OrgContext";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { Button } from "@/components/design-system";
import { isOverdue } from "./constraints/utils";
import KpiStrip from "./constraints/KpiStrip";
import PriorityBar from "./constraints/PriorityBar";
import OverdueStrip from "./constraints/OverdueStrip";
import FilterBar from "./constraints/FilterBar";
import EmptyState from "./constraints/EmptyState";
import ListView from "./constraints/ListView";
import BoardView from "./constraints/BoardView";
import ConstraintFormModal from "./constraints/ConstraintFormModal";
import { CONSTRAINT_TYPES, TYPE_COLORS, inputStyle } from "./constraints/constants";
import SequenceFilter, { matchesSequenceFilter } from "@/components/shared/SequenceFilter";
import { OperationsPageShell, OpsActionButton, OpsFilterPanel } from "@/components/operations/OperationsPageShell";
import { Plus, Search } from "lucide-react";
import { CONSTRAINT_STATUS, RESOLVED_STATUSES, PRIORITY, PRIORITY_ORDER } from "@/lib/enums";
import { ACTION_ITEM_CLOSED_STATUSES } from "@/lib/entityPredicates";

// Constraints are action_items rows (chk_action_items_status: Open / In Progress /
// Complete / Cancelled / Resolved / Closed). "Open" must exclude every terminal
// status, not just Resolved/Closed.
const isClosedConstraint = (c) => ACTION_ITEM_CLOSED_STATUSES.has(c?.status ?? "");
import { deriveOperationalConstraints } from "@/services/constraintEngine";
import { buildConstraintPrefillFromRfi } from "./constraints/rfiConstraintHandoff";
import { assertConstraintEvidence, constraintEvidenceKey, loadConstraintEvidence } from "./constraints/evidence";

const EMPTY_ENGINE_SOURCES = {
  items: [],
  workPackages: [],
  rfis: [],
  submittals: [],
  deliveries: [],
  scheduleTasks: [],
  drawings: [],
  inspections: [],
};

export default function Constraints() {
  const projectId = useProjectId();
  const { currentOrg, isLoadingOrgs } = useOrg();
  const orgId = currentOrg?.id;
  const scope = useMemo(() => ({ projectId, orgId, isLoadingOrgs }), [projectId, orgId, isLoadingOrgs]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  return <ProjectConstraints key={`${orgId}:${projectId}:${isLoadingOrgs}`} {...scope} scope={scope} currentScope={currentScope} />;
}

function ProjectConstraints({ projectId, orgId, isLoadingOrgs, scope, currentScope }) {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState("list");
  const [formScope, setFormScope] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const currentProject = useRef(projectId);
  currentProject.current = projectId;
  const currentForm = useRef(null);
  const currentDelete = useRef(null);
  const nextFormKey = useRef(0);
  const pendingWrites = useRef(new Set());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [seqFilter, setSeqFilter] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useResetOnProjectChange(projectId, () => {
    closeForm();
    closeDelete();
    setExpandedId(null);
  });

  // -- Data ----------------------------------------------------------------------
  const evidenceQuery = useQuery({
    queryKey: constraintEvidenceKey(projectId, orgId),
    queryFn: () => loadConstraintEvidence(projectId, orgId),
    enabled: Boolean(projectId && orgId && !isLoadingOrgs),
    staleTime: 30 * 1000,
  });
  const evidence = evidenceQuery.data?.projectId === projectId && evidenceQuery.data?.orgId === orgId ? evidenceQuery.data : null;
  const items = evidence?.items ?? EMPTY_ENGINE_SOURCES.items;
  const wps = evidence?.workPackages ?? EMPTY_ENGINE_SOURCES.workPackages;
  const engineSources = evidence ?? EMPTY_ENGINE_SOURCES;
  const canWrite = Boolean(evidence && evidenceQuery.status === "success" && evidenceQuery.fetchStatus === "idle" && !qc.getQueryState(constraintEvidenceKey(projectId, orgId))?.isInvalidated);

  function closeForm(scope = currentForm.current) {
    if (currentForm.current !== scope) return;
    currentForm.current = null;
    setFormScope(null);
  }

  function openForm(constraint = null, prefill = null) {
    if (!canWrite || currentProject.current !== projectId || constraint?._generated) return;
    const scope = { projectId, constraint, prefill, key: ++nextFormKey.current };
    currentForm.current = scope;
    setFormScope(scope);
  }

  function closeDelete(scope = currentDelete.current) {
    if (currentDelete.current !== scope) return;
    currentDelete.current = null;
    setDeleteTarget(null);
  }

  function openDelete(constraint) {
    if (!canWrite || currentProject.current !== projectId || constraint._generated) return;
    const scope = { projectId, constraint };
    currentDelete.current = scope;
    setDeleteTarget(scope);
  }

  // RFI → constraint handoff: ?fromRfi=<id> opens create form prefilled from the RFI.
  useEffect(() => {
    const fromRfi = searchParams.get("fromRfi");
    if (!fromRfi || !canWrite || !evidence) return;
    const rfi = evidence.rfis.find((r) => r.id === fromRfi);
    if (rfi) {
      const scope = { projectId, constraint: null, prefill: buildConstraintPrefillFromRfi(rfi, projectId), key: ++nextFormKey.current };
      currentForm.current = scope;
      setFormScope(scope);
    } else {
      toast.error("RFI not found in the selected project. No constraint draft was created.");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("fromRfi");
    setSearchParams(next, { replace: true });
  }, [searchParams, canWrite, evidence, projectId, setSearchParams]);

  // -- Mutations ----------------------------------------------------------------------
  async function writeConstraint(variables, operation) {
    if (!mounted.current || currentScope.current !== scope || !variables.projectId || currentProject.current !== variables.projectId
      || (variables.formScope && currentForm.current !== variables.formScope)
      || (variables.deleteScope && currentDelete.current !== variables.deleteScope)) {
      throw new Error("This constraint draft belongs to a previous project or dialog. Reopen it before saving.");
    }
    const complete = assertConstraintEvidence(qc, variables.projectId, orgId);
    if (variables.id && !complete.items.some(row => row.id === variables.id && row.category === "CONSTRAINT")) {
      throw new Error("Only a manual constraint in the selected project can be changed. Clear generated blockers at their source.");
    }
    if (variables.data?.work_package_id && !complete.workPackages.some(wp => wp.id === variables.data.work_package_id)) {
      throw new Error("The selected work package is no longer available in this project.");
    }
    const pendingKey = variables.id ? `${variables.projectId}:${variables.id}` : variables.formScope;
    if (pendingWrites.current.has(pendingKey)) throw new Error("This constraint is already saving.");
    pendingWrites.current.add(pendingKey);
    try {
      return await operation();
    } finally {
      pendingWrites.current.delete(pendingKey);
    }
  }

  function operationIsCurrent(variables) {
    return mounted.current && currentScope.current === scope && currentProject.current === variables.projectId
      && (!variables.formScope || currentForm.current === variables.formScope)
      && (!variables.deleteScope || currentDelete.current === variables.deleteScope);
  }

  function onSaved(variables, message) {
    void qc.invalidateQueries({ queryKey: ["constraints", variables.projectId] });
    if (!operationIsCurrent(variables)) return;
    if (variables.formScope) closeForm(variables.formScope);
    if (variables.deleteScope) closeDelete(variables.deleteScope);
    toast.success(message);
  }

  function onWriteError(error, variables) {
    if (operationIsCurrent(variables)) toast.error(toUserErrorMessage(error, "Constraint could not be saved"));
  }

  const createMut = useMutation({
    mutationFn: variables => writeConstraint(variables, () => entities.ActionItem.create(withProjectId({ ...variables.data, category: "CONSTRAINT" }, variables.projectId))),
    onSuccess: (_result, variables) => onSaved(variables, "Constraint logged"),
    onError: onWriteError,
  });
  const updateMut = useMutation({
    mutationFn: variables => writeConstraint(variables, () => entities.ActionItem.update(variables.id, withProjectId(variables.data, variables.projectId))),
    onSuccess: (_result, variables) => onSaved(variables, "Constraint updated"),
    onError: onWriteError,
  });
  const deleteMut = useMutation({
    mutationFn: variables => writeConstraint(variables, () => entities.ActionItem.delete(variables.id)),
    onSuccess: (_result, variables) => onSaved(variables, "Constraint deleted"),
    onError: onWriteError,
  });

  // -- Derived data ----------------------------------------------------------------------
  const generatedConstraints = useMemo(
    () =>
      deriveOperationalConstraints(
        {
          ...engineSources,
          workPackages: wps,
          existingConstraints: items,
        },
        { today: new Date() },
      ),
    [engineSources, items, wps],
  );

  const allConstraints = useMemo(
    () => [...generatedConstraints, ...items],
    [generatedConstraints, items],
  );

  const kpis = useMemo(() => {
    const open = allConstraints.filter((c) => !isClosedConstraint(c));
    const resolved = allConstraints.filter((c) => c.status === CONSTRAINT_STATUS.RESOLVED);
    const closed = allConstraints.filter((c) => c.status === CONSTRAINT_STATUS.CLOSED);
    const overdue = open.filter(isOverdue);
    const critical = open.filter((c) => c.priority === PRIORITY.CRITICAL);
    const inProg = allConstraints.filter((c) => c.status === CONSTRAINT_STATUS.IN_PROGRESS);
    const generated = allConstraints.filter((c) => c._generated);

    const oldestOpen = open.reduce((oldest, c) => {
      const d = new Date(c.created_date || c.created_at || c.due_date || Date.now());
      return !oldest || d < oldest ? d : oldest;
    }, null);
    const agedays = oldestOpen ? Math.floor((Date.now() - oldestOpen) / 86400000) : 0;

    const byType = CONSTRAINT_TYPES.map((t) => ({
      type: t,
      count: open.filter((c) => c.constraint_type === t).length,
      color: TYPE_COLORS[t],
    }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);

    const byPriority = Object.values(PRIORITY).map((p) => ({
      priority: p,
      count: open.filter((c) => c.priority === p).length,
    }));

    return { open, resolved, closed, overdue, critical, inProg, generated, agedays, byType, byPriority, total: allConstraints.length };
  }, [allConstraints]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allConstraints
      .filter((c) => {
        if (filterType !== "all" && c.constraint_type !== filterType) return false;
        if (filterStatus === "open" && isClosedConstraint(c)) return false;
        if (filterStatus !== "all" && filterStatus !== "open" && c.status !== filterStatus) return false;
        if (filterPriority !== "all" && c.priority !== filterPriority) return false;
        if (!matchesSequenceFilter(c, seqFilter)) return false;
        if (
          q &&
          ![c.title, c.description, c.project_area, c.assigned_to, c.constraint_number, c._source_ref, c._source_type]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        const aResolved = RESOLVED_STATUSES.includes(a.status);
        const bResolved = RESOLVED_STATUSES.includes(b.status);
        if (aResolved !== bResolved) return aResolved ? 1 : -1;
        const aP = PRIORITY_ORDER[a.priority] ?? 2;
        const bP = PRIORITY_ORDER[b.priority] ?? 2;
        if (aP !== bP) return aP - bP;
        const aOverdue = isOverdue(a);
        const bOverdue = isOverdue(b);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
        return 0;
      });
  }, [allConstraints, filterType, filterStatus, filterPriority, seqFilter, search]);

  const openCount = kpis.open.length;
  const overdueCount = kpis.overdue.length;

  // -- Handlers ----------------------------------------------------------------------

  const handleSave = (data) => {
    if (!formScope) return;
    const variables = { data, projectId: formScope.projectId, formScope };
    if (formScope.constraint?.id) {
      updateMut.mutate({ ...variables, id: formScope.constraint.id });
    } else {
      createMut.mutate(variables);
    }
  };
  const formBusy = [createMut, updateMut].some(mutation => mutation.isPending && mutation.variables?.formScope === formScope);
  const deleteBusy = deleteMut.isPending && deleteMut.variables?.deleteScope === deleteTarget;
  const quickUpdate = (id, data) => updateMut.mutate({ id, data, projectId });

  // -- No-project early return ----------------------------------------------------------------------
  if (!orgId || isLoadingOrgs) {
    return <div className="sb-dashboard-reference-page" role="status" aria-label="Constraint evidence" style={{ padding: 24 }}>
      {isLoadingOrgs ? "Loading workspace access before evaluating blockers." : "Select a workspace to review constraints."}
    </div>;
  }
  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page" style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>—</div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          Select a Project
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
          Constraint tracking is project-scoped. Choose a project from the top nav.
        </div>
      </div>
    );
  }

  if (!evidence && !evidenceQuery.isError) {
    return (
      <div className="sb-dashboard-reference-page" role="status" aria-label="Constraint evidence" style={{ padding: 24 }}>
        <p>Loading complete project evidence before evaluating blockers.</p>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  if (!evidence && evidenceQuery.isError) {
    return (
      <div className="sb-dashboard-reference-page" role="alert" aria-label="Constraint evidence" style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        gap: 16,
      }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
          Couldn’t verify constraint evidence
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
          {toUserErrorMessage(evidenceQuery.error, "Something went wrong. Try again.")}
        </p>
        <Button variant="outline" onClick={() => evidenceQuery.refetch()}>Retry</Button>
      </div>
    );
  }

  // -- Render ----------------------------------------------------------------------
  return (
    <div className="sb-dashboard-reference-page">
    <OperationsPageShell
      eyebrow={evidence.project.name || "Selected Project"}
      title="Constraint Log"
      subtitle="Track upstream blockers, due dates, priority, mitigation, and the work packages they affect before field execution is held up."
      meta={[
        { label: "Total", value: kpis.total },
        { label: "Open", value: openCount, color: openCount > 0 ? "var(--status-warning)" : "var(--status-success)" },
        { label: "Overdue", value: overdueCount, color: overdueCount > 0 ? "var(--status-error)" : "var(--status-success)" },
        { label: "System", value: kpis.generated.length, color: kpis.generated.length > 0 ? "var(--accent)" : "var(--text-muted)" },
        { label: "View", value: view },
      ]}
      metrics={[
        { label: "Open Constraints", value: openCount, sub: `${kpis.critical.length} critical`, color: kpis.critical.length > 0 ? "var(--status-error)" : "var(--status-warning)" },
        { label: "Overdue", value: overdueCount, sub: "Past due blockers", color: overdueCount > 0 ? "var(--status-error)" : "var(--status-success)" },
        { label: "System Generated", value: kpis.generated.length, sub: "From RFIs, drawings, tasks, deliveries", color: kpis.generated.length > 0 ? "var(--accent)" : "var(--text-muted)" },
        { label: "Oldest Open", value: `${kpis.agedays}d`, sub: "Age of oldest blocker", color: kpis.agedays > 7 ? "var(--status-warning)" : undefined },
      ]}
      actions={(
        <>
          <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
            {[["list", "List"], ["board", "Board"]].map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  background: view === v ? "var(--accent-muted)" : "transparent",
                  color: view === v ? "var(--accent)" : "var(--text-secondary)",
                  border: "none",
                  borderRight: v === "list" ? "1px solid var(--border-default)" : "none",
                  padding: "8px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <OpsActionButton
            variant="primary"
            disabled={!canWrite}
            onClick={() => openForm()}
            icon={<Plus size={13} />}
          >
            Log Constraint
          </OpsActionButton>
        </>
      )}
    >
      {!canWrite && (
        <div role={evidenceQuery.isError ? "alert" : "status"} aria-label="Constraint evidence" style={{ border: "1px solid var(--warning-border)", background: "var(--warning-muted)", color: "var(--text-primary)", padding: 16, marginBottom: 16 }}>
          <p style={{ margin: 0 }}>Showing the last complete project evidence. Changes are paused until all sources are verified.</p>
          {evidenceQuery.isError && <p>{toUserErrorMessage(evidenceQuery.error, "A project source could not be read.")}</p>}
          {evidenceQuery.isError && <Button variant="outline" onClick={() => evidenceQuery.refetch()}>Retry</Button>}
        </div>
      )}
      <OpsFilterPanel>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search constraints..."
            style={{ ...inputStyle, paddingLeft: 30, width: "100%" }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>
          {filtered.length} shown
        </span>
      </OpsFilterPanel>
      <KpiStrip kpis={kpis} />

      {kpis.open.length > 0 && <PriorityBar byPriority={kpis.byPriority} />}

      {kpis.overdue.length > 0 && (
        <OverdueStrip
          overdue={kpis.overdue}
          onClickItem={(id) => setExpandedId((prev) => (prev === id ? null : id))}
        />
      )}

      <FilterBar
        filterStatus={filterStatus}
        filterPriority={filterPriority}
        filterType={filterType}
        setFilterStatus={setFilterStatus}
        setFilterPriority={setFilterPriority}
        setFilterType={setFilterType}
      />

      <SequenceFilter items={allConstraints} value={seqFilter} onChange={setSeqFilter} />

      <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {filtered.length === 0 ? (
        <EmptyState hasOpen={filterStatus === "open"} />
      ) : view === "list" ? (
        <ListView
          items={filtered}
          wps={wps}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onQuickUpdate={quickUpdate}
          onEdit={openForm}
          onDelete={openDelete}
        />
      ) : (
        <BoardView
          items={filtered}
          wps={wps}
          onQuickUpdate={quickUpdate}
          onEdit={openForm}
          onDelete={openDelete}
        />
      )}
      </fieldset>

      {formScope?.projectId === projectId && (
        <ConstraintFormModal
          key={formScope.key}
          projectId={projectId}
          constraint={formScope.constraint}
          prefill={formScope.prefill}
          wps={wps}
          disabled={!canWrite || formBusy}
          onClose={() => closeForm(formScope)}
          onSave={handleSave}
        />
      )}

      <DeleteDialog
        open={Boolean(deleteTarget?.projectId === projectId && deleteTarget)}
        onClose={() => closeDelete(deleteTarget)}
        onConfirm={() => deleteMut.mutateAsync({ id: deleteTarget.constraint.id, projectId: deleteTarget.projectId, deleteScope: deleteTarget })}
        busy={deleteBusy}
        title="Delete Constraint"
        description={canWrite
          ? `Delete "${deleteTarget?.constraint.title || ""}"? This cannot be undone.`
          : "Project evidence is incomplete or refreshing. Close this dialog and retry after the evidence is verified."}
      />
    </OperationsPageShell>
    </div>
  );
}
