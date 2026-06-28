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
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export default function Punchlist() {
  const projectId = useProjectId();
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const qc = useQueryClient();
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
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const clearSelection = () => setSelectedIds([]);

  const { data: rawPunchlist = [] } = useQuery({
    queryKey: ["punchlist", projectId],
    queryFn: () =>
      projectId
        ? entities.PunchlistItem.filter({ project_id: projectId })
        : entities.PunchlistItem.list(),
  });

  useRealtimeInvalidation("punchlist_items", projectId, [["punchlist", projectId]]);

  const punchlist = React.useMemo(() => rawPunchlist.filter((r) => !r.is_deleted), [rawPunchlist]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const createMut = useMutation({
    mutationFn: (data) =>
      entities.PunchlistItem.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["punchlist", projectId] });
      setShowForm(false);
      setEditing(null);
      toast.success("Item created");
      logActivity("punchlist_item", "created", created, {
        projectId,
        description: created?.description?.slice(0, 80) || "",
      });
    },
    onError: (err) => toast.error(err.message),
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
    onError: (err) => toast.error(err.message),
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
    onError: () => toast.error("Delete failed"),
  });

  // C4 — Batch close-out with text signature.
  // Stamps each selected row with status=Completed, percent_complete=100,
  // closed_by + closed_at, and metadata.close_signature so the audit
  // trail captures *who* signed off (text, not a drawn signature — per
  // brief explicit guidance "keep it simple").
  const closeoutMut = useMutation({
    mutationFn: async ({ ids, signature }) => {
      if (!signature || !signature.trim()) throw new Error("Signature required");
      const stamp = new Date().toISOString();
      const updated = [];
      for (const id of ids) {
        const row = await entities.PunchlistItem.update(id, {
          status: "Completed",
          percent_complete: 100,
          closed_by: signature.trim(),
          closed_at: stamp,
          metadata: {
            close_signature: {
              by: signature.trim(),
              at: stamp,
              method: "text",
            },
          },
        });
        updated.push(row);
        logActivity("punchlist_item", "status_changed", row, {
          projectId,
          description: `Closed via batch · signature: ${signature.trim()}`,
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
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ ...data, id: editing.id, _prevStatus: editing.status });
    } else {
      createMut.mutate(data);
    }
  };

  const filtered = punchlist.filter((item) => {
    const statusMatch = filterStatus === "all" || item.status === filterStatus;
    const categoryMatch = filterCategory === "all" || item.category === filterCategory;
    const priorityMatch = filterPriority === "all" || item.priority === filterPriority;
    return statusMatch && categoryMatch && priorityMatch;
  });

  const stats = {
    total: punchlist.length,
    open: punchlist.filter((i) => i.status === "Open").length,
    inProgress: punchlist.filter((i) => i.status === "In Progress").length,
    completed: punchlist.filter((i) => i.status === "Completed").length,
    onHold: punchlist.filter((i) => i.status === "On Hold").length,
    critical: punchlist.filter((i) => i.priority === "Critical").length,
  };

  const completionRate = punchlist.length > 0 ? Math.round((stats.completed / punchlist.length) * 100) : 0;

  const statuses = ["Open", "In Progress", "Completed", "On Hold", "Deferred"];
  const categories = ["Structural", "Connections", "Painting/Coating", "Hardware", "Fit-Up", "Cleanup", "Documentation", "Other"];
  const priorities = ["Critical", "High", "Medium", "Low"];

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
        subtitle={`${completionRate}% complete · ${stats.critical} critical · close-out checklist`}
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
                 active={filterStatus === "Completed"} onClick={() => setFilterStatus(filterStatus === "Completed" ? "all" : "Completed")} />
        <KpiTile compact label="In Progress" value={stats.inProgress} color="var(--status-warning)"
                 active={filterStatus === "In Progress"} onClick={() => setFilterStatus(filterStatus === "In Progress" ? "all" : "In Progress")} />
        <KpiTile compact label="Open"        value={stats.open}       color="var(--status-error)"
                 active={filterStatus === "Open"} onClick={() => setFilterStatus(filterStatus === "Open" ? "all" : "Open")} />
        <KpiTile compact label="On Hold"     value={stats.onHold}     color="var(--status-review)"
                 active={filterStatus === "On Hold"} onClick={() => setFilterStatus(filterStatus === "On Hold" ? "all" : "On Hold")} />
        <KpiTile compact label="Critical"    value={stats.critical}   color="var(--status-error)"
                 active={filterPriority === "Critical"} onClick={() => setFilterPriority(filterPriority === "Critical" ? "all" : "Critical")} />
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
      <PunchlistList
        items={filtered}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onEdit={(item) => { setEditing(item); setShowForm(true); }}
        onDelete={setDeleteTarget}
      />

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
function CloseoutSignatureModal({ count, signature, onSignatureChange, onCancel, onConfirm, isSaving }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isSaving) onCancel(); }}
    >
      <div style={{
        background: "var(--bg-surface-secondary)",
        border: "1px solid var(--border-default)",
        borderRadius: 16,
        padding: 24,
        maxWidth: 480,
        width: "92%",
      }}>
        <h3 style={{
          fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700,
          margin: "0 0 14px", color: "var(--text-primary)",
          textTransform: "uppercase", letterSpacing: "0.10em",
        }}>
          Close {count} Item{count === 1 ? "" : "s"}
        </h3>
        <p style={{
          fontFamily: "var(--font-body)", fontSize: 12,
          color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.5,
        }}>
          This will mark all {count} selected item{count === 1 ? "" : "s"} as Completed (100%) and stamp
          your typed name as the close-out signature. Type your name to confirm.
        </p>
        <input
          type="text"
          autoFocus
          value={signature}
          onChange={(e) => onSignatureChange(e.target.value)}
          placeholder="Your name (text signature)"
          style={{
            width: "100%",
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 16,
          }}
          disabled={isSaving}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={isSaving || !signature.trim()}>
            {isSaving ? "Closing…" : "Sign & Close"}
          </Button>
        </div>
      </div>
    </div>
  );
}
