/**
 * ChangeOrders — CO tracker rebuilt on Claude Design system.
 *
 * Shell owns: React-Query fetches + mutations, derived counts/values,
 * potential-CO detection (RFIs with cost impact not yet turned into
 * COs), and composition of design-system components.
 *
 * Lifecycle chevron: Draft → Submitted → Under Review → Approved
 * (Rejected / Void rendered as KPI tiles but not part of the forward
 * chevron).
 *
 * Negative amounts are supported and render with a minus sign +
 * red tint (per the baseline-audit D16 fix).
 */

import React, { useState, useEffect, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { computeRevisedContractValue } from "@/services/costRollup";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import COFormModal from "@/components/changeorders/COFormModal";
import ChangeOrderImportModal from "@/components/changeorders/ChangeOrderImportModal";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import { formatCurrency } from "@/components/shared/formatters";
import { toast } from "sonner";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { usePermissions } from "@/services/permissions";
import { supabase } from "@/lib/supabase";
import { batchProcess } from "@/utils/batchProcess";
import { invalidateEntity } from "@/services/cacheRegistry";
import { OperationsPageShell, OpsActionButton, OpsFilterPanel } from "@/components/operations/OperationsPageShell";
import { useFlag } from "@/hooks/useFeatureFlag";
import CoControlCenter from "./changeOrders/CoControlCenter";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";

import {
  KpiTile,
  PhaseChevron,
  BulkActionBar,
  EmptyState,
  Icon,
} from "@/components/design-system";
import CoRow, { CO_ROW_GRID } from "./changeOrders/CoRow";

const LIFECYCLE = [
  { id: "draft",  label: "DRAFT",     color: "var(--text-muted)"     },
  { id: "sub",    label: "SUBMITTED", color: "var(--status-warning)" },
  { id: "rev",    label: "REVIEW",    color: "var(--status-review)"  },
  { id: "appr",   label: "APPROVED",  color: "var(--status-success)" },
];

export default function ChangeOrders() {
  const qc = useQueryClient();
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();
  const { can } = usePermissions();
  const commandUi = useFlag("command_ui");

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [prefill, setPrefill] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open create modal when QuickAddFAB navigated here with ?new=1.
  useAutoOpenCreate(() => {
    setEditing(null);
    setModalOpen(true);
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  /* -- Data -- */
  const { data: cos = [], isLoading } = useQuery({
    queryKey: ["change-orders", projectId],
    queryFn: () =>
      projectId
        ? entities.ChangeOrder.filter({ project_id: projectId }, "-created_at")
        : [],
    enabled: !!projectId,
  });

  useRealtimeInvalidation("change_orders", projectId, [["change-orders", projectId]]);

  const coQueryKeys = [["change-orders", projectId], ["change_orders"]];

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  // SOV lines (to link a CO to a contract line) + cost-impact RFIs (eligible
  // to convert into a CO via ?fromRfi).
  const { data: sovItems = [] } = useQuery({
    queryKey: ["sov-items", projectId],
    queryFn: () => projectId
      ? entities.SOVItem.filter({ project_id: projectId }, "line_item_number")
      : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => projectId
      ? entities.RFI.filter({ project_id: projectId }, "-created_at")
      : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });

  // Convert a cost-impact RFI into a new CO: ?fromRfi=<id> opens the form
  // prefilled from the RFI (amount, schedule, title) tagged with source_rfi_id.
  // The param is stripped so a refresh / back navigation doesn't reopen it.
  useEffect(() => {
    const fromRfi = searchParams.get("fromRfi");
    if (!fromRfi || !rfis.length) return;
    const rfi = rfis.find((r) => r.id === fromRfi);
    if (rfi) {
      const label = rfi.rfi_number ? `RFI ${rfi.rfi_number}` : "RFI";
      setPrefill({
        source_rfi_id: rfi.id,
        project_id: projectId,
        title: `${label}: ${rfi.title || rfi.subject || "cost change"}`.slice(0, 200),
        description: rfi.question || rfi.description || "",
        reason_code: "Design Change",
        co_amount: Number(rfi.cost_impact_amount) || 0,
        schedule_impact_days: Number(rfi.schedule_impact_days) || 0,
      });
      setEditing(null);
      setModalOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("fromRfi");
    setSearchParams(next, { replace: true });
  }, [searchParams, rfis, projectId, setSearchParams]);

  // Label for the "converted from RFI" banner — works for both a fresh
  // conversion (prefill) and editing an already-linked CO. Derived (not stored
  // in the form) so it never gets written back to the record.
  const activeSourceRfiId = prefill?.source_rfi_id || editing?.source_rfi_id || null;
  const sourceRfiLabel = useMemo(() => {
    if (!activeSourceRfiId) return "";
    const r = rfis.find((x) => x.id === activeSourceRfiId);
    return r?.rfi_number ? `RFI ${r.rfi_number}` : (r ? "the source RFI" : "");
  }, [activeSourceRfiId, rfis]);

  /* -- Mutations -- */
  const createMut = useMutation({
    mutationFn: async (d) => {
      const userTyped = (d.co_number || "").trim();
      let coNumber = userTyped;
      const targetProjectId = d.project_id || projectId || null;
      if (!targetProjectId) {
        throw new Error("Select a project before creating a change order.");
      }
      if (!coNumber && targetProjectId) {
        try {
          coNumber = await getNextFormattedNumber({
            projectId: targetProjectId,
            recordType: "CO",
            entityName: "ChangeOrder",
            fieldName: "co_number",
            prefix: "CO #",
          });
          if (!coNumber) {
            throw new Error("Unable to reserve a change order number. Please retry.");
          }
        } catch {
          throw new Error("Unable to reserve a change order number. Please retry.");
        }
      }
      if (!coNumber) throw new Error("Unable to reserve a change order number. Please retry.");
      return entities.ChangeOrder.create({
        ...d,
        co_number: coNumber,
        project_id: targetProjectId,
      });
    },
    onSuccess: (created) => {
      appendRecordToCaches(qc, coQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Change order created");
    },
    onError: (e) => toastCrudError(e, "Failed to create change order"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.ChangeOrder.update(id, data),
    onSuccess: (updated) => {
      replaceRecordInCaches(qc, coQueryKeys, updated);
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Change order updated");
    },
    onError: (e) => toastCrudError(e, "Failed to update change order"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.ChangeOrder.delete(id),
    onSuccess: (_result, deletedId) => {
      removeRecordFromCaches(qc, coQueryKeys, deletedId);
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      setDeleteTarget(null);
      toast.success("Change order deleted");
    },
    onError: (e) => toastCrudError(e, "Failed to delete change order"),
  });

  /**
   * Bulk-approve. Approving a CO moves the project's revised contract value
   * (computeRevisedContractValue sums approved co_amount), so `approved_by`
   * must be recorded — the validation rules require it, and this path used to
   * write status + approved_date only, leaving no record of who approved it.
   *
   * Also batched: this fired one un-awaited mutation per id, so a failure
   * halfway through was invisible and every write invalidated the cache.
   */
  const bulkApprove = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    const approvedBy =
      user?.user_metadata?.full_name
      || user?.email?.split("@")[0]
      || null;
    if (!approvedBy) {
      toast.error("Could not identify the approver — sign in again before approving.");
      return;
    }

    const data = {
      status: "Approved",
      approved_date: new Date().toISOString().split("T")[0],
      approved_by: approvedBy,
    };
    const { succeeded, failed } = await batchProcess(ids, (id) =>
      entities.ChangeOrder.update(id, data),
    );

    setSelectedIds(new Set());
    await invalidateEntity(qc, "change_order", projectId);
    qc.invalidateQueries({ queryKey: ["projects"] });

    if (failed.length > 0) {
      toast.warning(`Approved ${succeeded.length} of ${ids.length} — ${failed.length} failed`);
    } else {
      toast.success(`Approved ${succeeded.length} change order${succeeded.length === 1 ? "" : "s"}`);
    }
  };

  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  /* -- Derived counts + values -- */
  const counts = useMemo(() => ({
    all:       cos.length,
    draft:     cos.filter((c) => c.status === "Draft").length,
    submitted: cos.filter((c) => c.status === "Submitted").length,
    review:    cos.filter((c) => c.status === "Under Review").length,
    approved:  cos.filter((c) => c.status === "Approved").length,
    rejected:  cos.filter((c) => c.status === "Rejected").length,
    voided:    cos.filter((c) => c.status === "Void").length,
  }), [cos]);

  const totalApproved = useMemo(
    () =>
      cos
        .filter((c) => c.status === "Approved")
        .reduce((s, c) => s + (Number(c.co_amount) || 0), 0),
    [cos]
  );

  const totalPending = useMemo(
    () =>
      cos
        .filter((c) => ["Submitted", "Under Review"].includes(c.status))
        .reduce((s, c) => s + (Number(c.co_amount) || 0), 0),
    [cos]
  );

  const totalDraft = useMemo(
    () =>
      cos
        .filter((c) => c.status === "Draft")
        .reduce((s, c) => s + (Number(c.co_amount) || 0), 0),
    [cos]
  );

  const atRiskValue = totalPending + totalDraft;

  // Read original_contract_value from the FRESH projects query result
  // rather than from ProjectContext. ProjectContext loads once on mount
  // and only refreshes when the user re-picks the project, so editing
  // the contract value via the project edit form left the REVISED
  // CONTRACT tile here showing a stale baseContract until the next page
  // load. The projects query has staleTime 5 min and is invalidated on
  // every CO mutation below, so this picks up edits right away.
  const liveProject = projects.find((p) => p.id === projectId) || activeProject;
  const baseContract = Number(liveProject?.original_contract_value) || 0;
  const revisedContract = computeRevisedContractValue(liveProject, cos);

  /* -- Filtered list -- */
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return cos.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      return (
        (c.co_number || "").toLowerCase().includes(q) ||
        (c.title || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q) ||
        (c.reason_code || "").toLowerCase().includes(q)
      );
    });
  }, [cos, filter, debouncedSearch]);

  /* -- Pipeline chevron -- */
  const pipelineStages = useMemo(() => [
    { ...LIFECYCLE[0], count: counts.draft },
    { ...LIFECYCLE[1], count: counts.submitted },
    { ...LIFECYCLE[2], count: counts.review },
    { ...LIFECYCLE[3], count: counts.approved },
  ], [counts]);

  const activePipelineIdx = useMemo(() => {
    if (counts.review > 0)    return 2;
    if (counts.submitted > 0) return 1;
    if (counts.draft > 0)     return 0;
    return 3;
  }, [counts]);

  /* -- Selection -- */
  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = (checked) =>
    setSelectedIds(checked ? new Set(filtered.map((c) => c.id)) : new Set());

  /* -- Guards -- */
  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 32, textAlign: "center" }}>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--text-secondary)",
          }}
        >
          Select a project to view change orders.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  const projectName = projects.find((p) => p.id === projectId)?.name || "";

  // Whole-dollar currency for the financial command bar + KPI tiles.
  // `formatCurrency(_, 0)` handles negatives natively (deducts/credits
  // render as `-$12,345`).
  const formatMoney = (n) => formatCurrency(n, 0);

  // Shared modal block — rendered in both the command_ui branch and the
  // classic branch so all mutation state is wired identically in both paths.
  const modals = (
    <>
      <COFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); setPrefill(null); }}
        onSave={handleSave}
        isSaving={createMut.isPending || updateMut.isPending}
        co={editing}
        prefill={prefill}
        sovItems={sovItems}
        sourceRfiLabel={sourceRfiLabel}
        projects={projects}
        nextNumber=""
      />
      <ChangeOrderImportModal
        open={importOpen}
        projectId={projectId}
        projectName={projectName}
        projects={projects}
        onClose={() => setImportOpen(false)}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Change Order"
        description={`Delete ${deleteTarget?.co_number}?`}
      />
    </>
  );

  // ── command_ui flag-branch ──────────────────────────────────────────────────
  if (commandUi) {
    return (
      <div className="co-page">
        <ListTruncationNotice count={cos.length} label="change orders" />
        <CoControlCenter
          projectName={projectName}
          cos={cos}
          filtered={filtered}
          search={search}
          onSearch={setSearch}
          statusFilter={filter}
          onFilterChange={setFilter}
          onOpenCo={(co) => { setEditing(co); setModalOpen(true); }}
          onExport={() => {
            // Simple CSV export matching the RFI pattern — filtered rows only.
            const rows = [
              ["CO #", "Title", "Status", "Reason Code", "Amount", "Sched Impact (d)", "Submitted", "Approved", "Approved By"].join(","),
              ...filtered.map((c) =>
                [
                  c.co_number || "",
                  `"${(c.title || "").replace(/"/g, '""')}"`,
                  c.status || "",
                  c.reason_code || "",
                  c.co_amount ?? "",
                  c.schedule_impact_days ?? "",
                  c.submitted_date || "",
                  c.approved_date || "",
                  `"${(c.approved_by || "").replace(/"/g, '""')}"`,
                ].join(",")
              ),
            ].join("\n");
            const blob = new Blob([rows], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `change-orders-${projectName.replace(/\s+/g, "-")}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          onCreate={can("create", "change_order") ? () => { setEditing(null); setPrefill(null); setModalOpen(true); } : null}
          onImport={can("create", "change_order") ? () => setImportOpen(true) : null}
          baseContract={baseContract}
          revisedContract={revisedContract}
          projectHealth={liveProject?.health_status || null}
          percentComplete={liveProject?.scope_complete_pct_override != null ? Number(liveProject.scope_complete_pct_override) : null}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
        />
        <BulkActionBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          actions={[
            {
              label: "SUBMIT SELECTED",
              icon: "arrow",
              onClick: () => {
                const ids = [...selectedIds];
                ids.forEach((id) => updateMut.mutate({ id, data: { status: "Submitted", submitted_date: new Date().toISOString().split("T")[0] } }));
                setSelectedIds(new Set());
              },
            },
            {
              label: "APPROVE",
              icon: "check",
              onClick: () => { void bulkApprove(); },
            },
            ...(can("delete", "change_order") ? [{
              label: "DELETE",
              icon: "x",
              variant: "danger",
              onClick: () => {
                const ids = [...selectedIds];
                if (window.confirm(`Delete ${ids.length} change order(s)?`)) {
                  ids.forEach((id) => deleteMut.mutate(id));
                  setSelectedIds(new Set());
                }
              },
            }] : []),
          ]}
        />
        {modals}
      </div>
    );
  }

  // ── Classic layout ──────────────────────────────────────────────────────────
  return (
    <div className="sb-dashboard-reference-page">
    <ListTruncationNotice count={cos.length} label="change orders" />
    <OperationsPageShell
      eyebrow={`Financial · ${projectName || activeProject?.project_number || "Project"}`}
      title="Change Orders"
      subtitle="Track contract exposure from draft pricing through approval with cost, schedule impact, and review status visible at a glance."
      meta={[
        { label: "Total COs", value: counts.all },
        { label: "At Risk", value: formatMoney(atRiskValue), color: "var(--status-review)" },
        { label: "Approved", value: counts.approved, color: "var(--status-success)" },
        { label: "Revised Contract", value: formatMoney(revisedContract), color: "var(--accent)" },
      ]}
      metrics={[
        { label: "Approved Value", value: formatMoney(totalApproved), sub: `${counts.approved} CO${counts.approved === 1 ? "" : "s"}`, color: "var(--status-success)" },
        { label: "Pending Value", value: formatMoney(totalPending), sub: `${counts.submitted + counts.review} pending`, color: "var(--status-warning)" },
        { label: "At Risk", value: formatMoney(atRiskValue), sub: "Draft + pending", color: "var(--status-review)" },
        { label: "Base Contract", value: formatMoney(baseContract), sub: "Original value" },
      ]}
      actions={can("create", "change_order") ? (
        <>
          <OpsActionButton
            onClick={() => setImportOpen(true)}
            title="Bulk import change orders from a CSV (Sage / Vista / Procore / Excel)"
          >
            Import CSV
          </OpsActionButton>
          <OpsActionButton
            variant="primary"
            onClick={() => { setEditing(null); setPrefill(null); setModalOpen(true); }}
          >
            New CO
          </OpsActionButton>
        </>
      ) : null}
    >
      {/* CO status filter tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
        <KpiTile compact label="ALL"        value={counts.all}       color="var(--text-secondary)" active={filter === "all"}           onClick={() => setFilter("all")} />
        <KpiTile compact label="DRAFT"      value={counts.draft}     color="var(--text-muted)"     active={filter === "Draft"}         onClick={() => setFilter("Draft")} />
        <KpiTile compact label="SUBMITTED"  value={counts.submitted} color="var(--status-warning)" active={filter === "Submitted"}     onClick={() => setFilter("Submitted")} />
        <KpiTile compact label="UNDER REVIEW" value={counts.review}  color="var(--status-review)"  active={filter === "Under Review"}  onClick={() => setFilter("Under Review")} />
        <KpiTile compact label="APPROVED"   value={counts.approved}  color="var(--status-success)" active={filter === "Approved"}      onClick={() => setFilter("Approved")} />
        <KpiTile compact label="REJECTED"   value={counts.rejected}  color="var(--status-error)"   active={filter === "Rejected"}      onClick={() => setFilter("Rejected")} />
        <KpiTile compact label="VOID"       value={counts.voided}    color="var(--text-disabled)"  active={filter === "Void"}          onClick={() => setFilter("Void")} />
      </div>

      {/* Lifecycle pipeline chevron */}
      <div
        className="sbd-card"
        style={{
          padding: "12px 14px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.14em",
            marginBottom: 8,
          }}
        >
          CHANGE ORDER LIFECYCLE
        </div>
        <PhaseChevron stages={pipelineStages} activeIdx={activePipelineIdx} showIcons={false} />
      </div>

      {/* Search bar */}
      <OpsFilterPanel>
        <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 420 }}>
          <div
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
            }}
          >
            <Icon name="search" size={12} />
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search CO #, title, or reason…"
            style={{
              width: "100%",
              height: 30,
              padding: "0 12px 0 30px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-input)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              outline: "none",
            }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.10em",
          }}
        >
          {filtered.length} of {cos.length}
        </span>
      </OpsFilterPanel>

      {/* Table */}
      <div
        className="sbd-card"
        style={{
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: CO_ROW_GRID,
            gap: 8,
            padding: "8px 12px",
            background: "var(--bg-surface-low)",
            borderBottom: "1px solid var(--border-default)",
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          <div>
            <input
              type="checkbox"
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onChange={(e) => toggleAll(e.target.checked)}
            />
          </div>
          <div>CO #</div>
          <div>Title</div>
          <div>Status</div>
          <div>Submitted</div>
          <div>Approved</div>
          <div style={{ textAlign: "right" }}>Amount</div>
          <div style={{ textAlign: "center" }}>Sched Impact</div>
          <div>Approved By</div>
          <div></div>
        </div>
        {filtered.length > 0 ? (
          filtered.map((c, i) => (
            <CoRow
              key={c.id}
              co={c}
              idx={i}
              selected={selectedIds.has(c.id)}
              onToggle={() => toggleSelect(c.id)}
              onOpen={() => { setEditing(c); setModalOpen(true); }}
            />
          ))
        ) : (
          <div style={{ padding: 24 }}>
            <EmptyState
              icon="co"
              title={cos.length === 0 ? "No change orders yet" : "No COs match your filters"}
              body={
                cos.length === 0
                  ? "Create your first CO to track scope changes and cost/schedule impacts. Negative amounts are supported for deducts."
                  : "Clear filters or adjust the search query."
              }
            />
          </div>
        )}
      </div>

      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: "SUBMIT SELECTED",
            icon: "arrow",
            onClick: () => {
              const ids = [...selectedIds];
              ids.forEach((id) => updateMut.mutate({ id, data: { status: "Submitted", submitted_date: new Date().toISOString().split("T")[0] } }));
              setSelectedIds(new Set());
            },
          },
          {
            label: "APPROVE",
            icon: "check",
            onClick: () => {
              const ids = [...selectedIds];
              ids.forEach((id) => updateMut.mutate({ id, data: { status: "Approved", approved_date: new Date().toISOString().split("T")[0] } }));
              setSelectedIds(new Set());
            },
          },
          ...(can("delete", "change_order") ? [{
            label: "DELETE",
            icon: "x",
            variant: "danger",
            onClick: () => {
              const ids = [...selectedIds];
              if (window.confirm(`Delete ${ids.length} change order(s)?`)) {
                ids.forEach((id) => deleteMut.mutate(id));
                setSelectedIds(new Set());
              }
            },
          }] : []),
        ]}
      />

      {modals}
    </OperationsPageShell>
    </div>
  );
}
