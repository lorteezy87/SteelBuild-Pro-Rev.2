import {
  filterLiveRecords,
  filterPunchlist,
  computePunchlistStats,
  toggleIdInList,
  nextFilterToggle,
  punchlistCommandSubtitle,
  createEmptyPunchlistFilters,
  buildPunchlistCloseoutPatch,
  requireCloseoutSignature,
  PUNCHLIST_STATUSES,
  PUNCHLIST_CATEGORIES,
  PUNCHLIST_PRIORITIES,
} from "./punchlist/punchlistPageHelpers";
import { useProjectId } from "@/hooks/useProjectId";
import React, { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import PunchlistFormModal from "@/components/punchlist/PunchlistFormModal";
import PunchlistList from "@/components/punchlist/PunchlistList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, KpiTile, ProgressBar, BulkActionBar, Button } from "@/components/design-system";
import { logActivity } from "@/services/auditLogger";
import { useOutbox } from "@/lib/field/OutboxContext";
import { makePunchCreateOp, newClientOpId, isLikelyOfflineError } from "@/lib/field/offlineQueue";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { RegisterFetchBody } from "@/components/shared/RegisterFetchStates";
import { CloseoutSignatureModal } from "./punchlist/PunchlistUi";

import { findById } from "@/pages/shared/findById";
export default function Punchlist() {
  const projectId = useProjectId();
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const qc = useQueryClient();
  const { enqueue: enqueueOutbox, flush: flushOutbox } = useOutbox();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // C4 — multi-select + signed close-out
  const [selectedIds, setSelectedIds] = useState([]);
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [closeoutSignature, setCloseoutSignature] = useState("");

  useAutoOpenCreate(() => {
    setEditing(null);
    setShowForm(true);
  });

  const toggleSelect = (id) => {
    setSelectedIds((prev) => toggleIdInList(prev, id));
  };
  const clearSelection = () => setSelectedIds([]);

  const {
    data: rawPunchlist = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["punchlist", projectId],
    queryFn: () =>
      projectId
        ? entities.PunchlistItem.filter({ project_id: projectId })
        : entities.PunchlistItem.list(),
  });

  useRealtimeInvalidation("punchlist_items", projectId, [["punchlist", projectId]]);

  const punchlist = React.useMemo(() => filterLiveRecords(rawPunchlist), [rawPunchlist]);

  // Field Hub rows deep-link here with ?id=<item>; open it for edit/close.
  useAutoOpenEdit(
    punchlist,
    (item) => { setEditing(item); setShowForm(true); },
    { enabled: !isLoading },
  );

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = findById(projects, projectId);

  const createMut = useMutation({
    mutationFn: (data) => entities.PunchlistItem.create(withProjectId(data, projectId)),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["punchlist", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Item created");
      logActivity("punchlist_item", "created", created, {
        projectId,
        description: created?.description?.slice(0, 80) || "",
      });
      flushOutbox(); // online write succeeded → drain any offline backlog
    },
    onError: (err, data) => {
      // No signal? Queue the create for replay instead of dropping it. The
      // client_op_id (minted in handleSave) rides both this attempt and the
      // retry, so a lost-response replay can't mint a duplicate (punchlist_items
      // has a partial-unique index on client_op_id — see baseline schema).
      if (isLikelyOfflineError(err)) {
        try {
          const record = withProjectId(data, projectId);
          enqueueOutbox(makePunchCreateOp(record, record.client_op_id, Date.now()));
          setShowForm(false);
          setEditing(null);
          toast.message("Saved offline — will sync when you're back online");
          return;
        } catch (scopeErr) {
          toast.error(scopeErr.message || err.message);
          return;
        }
      }
      toast.error(toUserErrorMessage(err, "Create failed"));
    },
  });

  // Update mutation receives { ...data, id, _prevStatus } so we can fire a
  // status_changed activity (and a "Completed" close event) deterministically
  // from the page rather than guessing on the backend.
  const updateMut = useMutation({
    mutationFn: ({ _prevStatus, ...data }) => entities.PunchlistItem.update(data.id, data),
    onSuccess: (updated, vars) => {
      qc.invalidateQueries({ queryKey: ["punchlist", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Item updated");

      const prev = vars?._prevStatus;
      const next = updated?.status;
      if (prev && next && prev !== next) {
        logActivity("punchlist_item", "status_changed", updated, {
          projectId,
          description: `${prev} → ${next}`,
        });
        if (next === "Completed") {
          logActivity("punchlist_item", "updated", updated, {
            projectId,
            description: `Closed (was ${prev})`,
          });
        }
      } else {
        logActivity("punchlist_item", "updated", updated, { projectId });
      }
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Update failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.PunchlistItem.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["punchlist", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success("Item deleted");
      logActivity("punchlist_item", "deleted", { id: deletedId }, { projectId });
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Delete failed")),
  });

  // C4 — Batch close-out with text signature.
  // Stamps each selected row with status=Completed, percent_complete=100,
  // closed_by + closed_at, and metadata.close_signature so the audit
  // trail captures *who* signed off (text, not a drawn signature — per
  // brief explicit guidance "keep it simple").
  const closeoutMut = useMutation({
    mutationFn: async ({ ids, signature }) => {
      const by = requireCloseoutSignature(signature);
      const stamp = new Date().toISOString();
      const patch = buildPunchlistCloseoutPatch(by, stamp);
      const updated = [];
      for (const id of ids) {
        const row = await entities.PunchlistItem.update(id, patch);
        updated.push(row);
        logActivity("punchlist_item", "status_changed", row, {
          projectId,
          description: `Closed via batch · signature: ${by}`,
        });
      }
      return updated;
    },
    onSuccess: (rows) => {
      qc.invalidateQueries({ queryKey: ["punchlist", projectId] });
      qc.invalidateQueries({ queryKey: ["punchlist-all"] });
      qc.invalidateQueries({ queryKey: ["field-hub-punchlist", projectId] });
      toast.success(`Closed ${rows.length} item${rows.length === 1 ? "" : "s"}`);
      setCloseoutOpen(false);
      setCloseoutSignature("");
      setSelectedIds([]);
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Close-out failed")),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ ...data, id: editing.id, _prevStatus: editing.status });
    } else {
      // Mint the idempotency key up front so it rides BOTH the online create and
      // any offline retry (dedup'd server-side on replay).
      createMut.mutate({ ...data, client_op_id: newClientOpId() });
    }
  };

  const filtered = filterPunchlist(punchlist, { filterStatus, filterCategory, filterPriority });
  const { completionRate, ...stats } = computePunchlistStats(punchlist);

  const statuses = PUNCHLIST_STATUSES;
  const categories = PUNCHLIST_CATEGORIES;
  const priorities = PUNCHLIST_PRIORITIES;

  return (
    <div
      className="sb-dashboard-reference-page"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Punchlist"
        count={filtered.length}
        unit=" · ITEMS"
        subtitle={punchlistCommandSubtitle(completionRate, stats.critical)}
      >
        <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setShowForm(true); }}>
          Add Item
        </Button>
      </CommandBar>

      {/* Completion Progress */}
      <div className="sbd-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
            Project Completion
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>
            {completionRate}%
          </span>
        </div>
        <ProgressBar value={completionRate} color="var(--status-success)" height={6} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"       value={stats.total}      color="var(--accent)" />
        <KpiTile compact label="Completed"   value={stats.completed}  color="var(--status-success)"
                 active={filterStatus === "Completed"} onClick={() => setFilterStatus(nextFilterToggle(filterStatus, "Completed"))} />
        <KpiTile compact label="In Progress" value={stats.inProgress} color="var(--status-warning)"
                 active={filterStatus === "In Progress"} onClick={() => setFilterStatus(nextFilterToggle(filterStatus, "In Progress"))} />
        <KpiTile compact label="Open"        value={stats.open}       color="var(--status-error)"
                 active={filterStatus === "Open"} onClick={() => setFilterStatus(nextFilterToggle(filterStatus, "Open"))} />
        <KpiTile compact label="On Hold"     value={stats.onHold}     color="var(--status-review)"
                 active={filterStatus === "On Hold"} onClick={() => setFilterStatus(nextFilterToggle(filterStatus, "On Hold"))} />
        <KpiTile compact label="Critical"    value={stats.critical}   color="var(--status-error)"
                 active={filterPriority === "Critical"} onClick={() => setFilterPriority(nextFilterToggle(filterPriority, "Critical"))} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Status:</span>
          {["all", ...statuses].map((status) => (
            <button key={status} onClick={() => setFilterStatus(status)} style={{ background: filterStatus === status ? "var(--accent)" : "var(--bg-surface-low)", color: filterStatus === status ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {status === "all" ? "All" : status.slice(0, 6)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Category:</span>
          {["all", ...categories.slice(0, 4)].map((cat) => (
            <button key={cat} onClick={() => setFilterCategory(cat)} style={{ background: filterCategory === cat ? "var(--accent)" : "var(--bg-surface-low)", color: filterCategory === cat ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {cat === "all" ? "All" : cat.slice(0, 5)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Priority:</span>
          {["all", ...priorities].map((pri) => (
            <button key={pri} onClick={() => setFilterPriority(pri)} style={{ background: filterPriority === pri ? "var(--accent)" : "var(--bg-surface-low)", color: filterPriority === pri ? "white" : "var(--text-secondary)", border: "none", borderRadius: "var(--radius-btn)", padding: "5px 12px", fontFamily: "var(--font-body)", fontSize: "8px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {pri === "all" ? "All" : pri}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && <PunchlistFormModal projectId={projectId} item={editing} onClose={() => {setShowForm(false); setEditing(null);}} onSave={handleSave} isSaving={createMut.isPending || updateMut.isPending} />}

      {/* Punchlist */}
      <RegisterFetchBody
        isLoading={isLoading}
        isError={isError}
        errorMessage={toUserErrorMessage(error, "Failed to load punchlist")}
        onRetry={() => refetch()}
        totalCount={punchlist.length}
        filteredCount={filtered.length}
        emptyTitle="No punchlist items yet"
        emptyBody="Track punch items and close them out as work completes."
        emptyActionLabel="+ New Item"
        onEmptyAction={() => { setEditing(null); setShowForm(true); }}
        onClearFilters={() => {
          const empty = createEmptyPunchlistFilters();
          setFilterStatus(empty.filterStatus);
          setFilterCategory(empty.filterCategory);
          setFilterPriority(empty.filterPriority);
        }}
      >
        <PunchlistList
          items={filtered}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onEdit={(item) => { setEditing(item); setShowForm(true); }}
          onDelete={setDeleteTarget}
        />
      </RegisterFetchBody>

      {/* Delete Dialog */}
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (!deleteMut.isPending && deleteTarget?.id) deleteMut.mutate(deleteTarget.id); }} title="Delete Item" description="Delete this record? This cannot be undone." />

      {/* C4 — Bulk action bar (only renders with selection) */}
      <BulkActionBar
        count={selectedIds.length}
        onClear={clearSelection}
        actions={[
          {
            label: "Close Selected",
            icon: "check",
            variant: "primary",
            onClick: () => setCloseoutOpen(true),
            disabled: closeoutMut.isPending,
          },
        ]}
      />

      {/* C4 — Signature confirm modal */}
      {closeoutOpen && (
        <CloseoutSignatureModal
          count={selectedIds.length}
          signature={closeoutSignature}
          onSignatureChange={setCloseoutSignature}
          onCancel={() => { setCloseoutOpen(false); setCloseoutSignature(""); }}
          onConfirm={() => closeoutMut.mutate({ ids: selectedIds, signature: closeoutSignature })}
          isSaving={closeoutMut.isPending}
        />
      )}
    </div>
  );
}

// ── Close-out signature modal (C4) ─────────────────────────────────
// Plain text signature line — explicit per the brief ("keep it simple
// — text-based name, not actual signature capture"). Records the typed
// name into `closed_by` + metadata.close_signature so the audit trail
// shows who batch-closed which items when.
