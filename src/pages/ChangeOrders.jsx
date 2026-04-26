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
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { useSearchParams } from "react-router-dom";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import COFormModal from "@/components/changeorders/COFormModal";
import ChangeOrderImportModal from "@/components/changeorders/ChangeOrderImportModal";
import { getNextNumber } from "@/components/shared/numberSequencing";
import { formatCurrency } from "@/components/shared/formatters";
import { toast } from "sonner";

import {
  CommandBar,
  KpiTile,
  PhaseChevron,
  BulkActionBar,
  EmptyState,
  Button,
  Icon,
} from "@/components/design-system";
import CoRow, { CO_ROW_GRID } from "./changeOrders/CoRow";

const LIFECYCLE = [
  { id: "draft",  label: "DRAFT",     color: "var(--text-muted)"     },
  { id: "sub",    label: "SUBMITTED", color: "var(--status-warning)" },
  { id: "rev",    label: "REVIEW",    color: "var(--status-review)"  },
  { id: "appr",   label: "APPROVED",  color: "var(--status-success)" },
];

const STATUS_INDEX = {
  Draft:          0,
  Submitted:      1,
  "Under Review": 2,
  Approved:       3,
  Rejected:       3, // visually rests on approved column but styled as stopped
  Void:           3,
};

export default function ChangeOrders() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [searchParams] = useSearchParams();

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Auto-open create modal when QuickAddFAB navigated here with ?new=1.
  useAutoOpenCreate(() => {
    setEditing(null);
    setModalOpen(true);
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Data ── */
  const { data: cos = [], isLoading } = useQuery({
    queryKey: ["change-orders", activeProject?.id],
    queryFn: () =>
      activeProject?.id
        ? base44.entities.ChangeOrder.filter({ project_id: activeProject.id }, "-created_at")
        : [],
    enabled: !!activeProject?.id,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: async (d) => {
      let coNumber;
      try {
        coNumber = activeProject?.id ? await getNextNumber(activeProject.id, "CO") : null;
      } catch {
        coNumber = null;
      }
      if (!coNumber) coNumber = `CO-${String((cos.length || 0) + 1).padStart(3, "0")}`;
      return base44.entities.ChangeOrder.create({
        ...d,
        co_number: coNumber,
        project_id: d.project_id || activeProject?.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Change order created");
    },
    onError: (err) => toast.error("Failed to create change order: " + (err?.message || "Unknown error")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ChangeOrder.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Change order updated");
    },
    onError: (err) => toast.error("Failed to update change order: " + (err?.message || "Unknown error")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ChangeOrder.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      setDeleteTarget(null);
      toast.success("Change order deleted");
    },
    onError: () => toast.error("Failed to delete change order"),
  });

  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  /* ── Derived counts + values ── */
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

  const baseContract = Number(activeProject?.original_contract_value) || 0;
  const revisedContract = baseContract + totalApproved;

  /* ── Filtered list ── */
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

  /* ── Pipeline chevron ── */
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

  /* ── Selection ── */
  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = (checked) =>
    setSelectedIds(checked ? new Set(filtered.map((c) => c.id)) : new Set());

  /* ── Guards ── */
  if (!activeProject?.id) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
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
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  const projectName = projects.find((p) => p.id === activeProject.id)?.name || "";

  // Whole-dollar currency for the financial command bar + KPI tiles.
  // `formatCurrency(_, 0)` handles negatives natively (deducts/credits
  // render as `-$12,345`).
  const formatMoney = (n) => formatCurrency(n, 0);

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <CommandBar
        eyebrow={`FINANCIAL · ${projectName.toUpperCase()}`}
        title="Change Orders"
        count={counts.all}
        unit={` · ${formatMoney(atRiskValue)} AT RISK`}
        subtitle="Draft → Submitted → Under Review → Approved. Deducts and credits supported."
      >
        <Button
          variant="secondary"
          icon="upload"
          onClick={() => setImportOpen(true)}
          title="Bulk import change orders from a CSV (Sage / Vista / Procore / Excel)"
        >
          IMPORT CSV
        </Button>
        <Button
          variant="primary"
          icon="plus"
          onClick={() => { setEditing(null); setModalOpen(true); }}
        >
          NEW CO
        </Button>
      </CommandBar>

      {/* Financial KPI row (revised contract + deltas) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <KpiTile
          label="APPROVED VALUE"
          value={formatMoney(totalApproved)}
          sub={`${counts.approved} CO${counts.approved === 1 ? "" : "s"}`}
          color="var(--status-success)"
          icon="check"
        />
        <KpiTile
          label="PENDING VALUE"
          value={formatMoney(totalPending)}
          sub={`${counts.submitted + counts.review} CO${(counts.submitted + counts.review) === 1 ? "" : "s"}`}
          color="var(--status-warning)"
          icon="clock"
        />
        <KpiTile
          label="AT RISK"
          value={formatMoney(atRiskValue)}
          sub="Draft + Pending"
          color="var(--status-review)"
          icon="alert"
        />
        <KpiTile
          label="REVISED CONTRACT"
          value={formatMoney(revisedContract)}
          sub={`Base: ${formatMoney(baseContract)}`}
          color="var(--accent)"
          icon="financials"
        />
      </div>

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
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
        }}
      >
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
      </div>

      {/* Table */}
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
          {
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
          },
        ]}
      />

      {/* Modals */}
      <COFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        co={editing}
        projects={projects}
        nextNumber={`CO-${String((cos.length || 0) + 1).padStart(3, "0")}`}
      />
      <ChangeOrderImportModal
        open={importOpen}
        projectId={activeProject?.id}
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
    </div>
  );
}
