import React, { useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "../components/shared/useProjectContext";
import { CommandBar, KpiTile, Button, BulkActionBar } from "@/components/design-system";
import { PhoenixPanel } from "../components/shared/PhoenixPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import DeleteDialog from "../components/shared/DeleteDialog";
import { daysUntil } from "@/lib/dateMath";
import { formatDate } from "../components/shared/formatters";
import CommentThread from "@/components/collaboration/CommentThread";
import SubmittalBulkEditModal from "@/components/submittals/SubmittalBulkEditModal";
import SubmittalBulkAddModal from "@/components/submittals/SubmittalBulkAddModal";
import { batchProcess } from "@/utils/batchProcess";

/**
 * Submittals — formal transmittal register.
 *
 * Separate from `drawings` (individual sheets) and `drawing_sets` (a
 * package in review). A submittal is the workflow artifact: what was
 * sent, when, to whom, which round, current status, who the ball is
 * with.
 *
 * Layout mirrors the RFI page — list on the left, detail panel on the
 * right, stage pills across the top. Comment thread is embedded in the
 * detail panel.
 */

const STATUSES = [
  "Draft","Submitted","Under Review","Approved","Approved as Noted",
  "Revise and Resubmit","Rejected","Void",
];

const TYPES = ["Shop Drawing","Product Data","Sample","Mock-up","Calculation","Other"];

const BIC_CHOICES = ["Contractor","EOR","Architect","GC","Owner"];

// One-color-per-status palette so adjacent statuses don't blur into
// each other. Earlier scheme collapsed eight statuses onto four
// tokens — Approved / Approved as Noted both green, Revise and
// Resubmit / Rejected both red, Draft / Void both gray — which made
// the badges in the table impossible to distinguish at a glance.
const STATUS_CFG = {
  "Draft":               { color: "#64748B", bg: "rgba(100,116,139,0.16)" }, // slate
  "Submitted":           { color: "#2563EB", bg: "rgba(37,99,235,0.18)"   }, // blue
  "Under Review":        { color: "#0D9488", bg: "rgba(13,148,136,0.18)"  }, // teal — distinct from blue
  "Approved":            { color: "#10B981", bg: "rgba(16,185,129,0.18)"  }, // emerald
  "Approved as Noted":   { color: "#84CC16", bg: "rgba(132,204,22,0.18)"  }, // lime — yellow-green, related to Approved
  "Revise and Resubmit": { color: "#F97316", bg: "rgba(249,115,22,0.18)"  }, // orange — action, warm
  "Rejected":            { color: "#DC2626", bg: "rgba(220,38,38,0.18)"   }, // red — failure
  "Void":                { color: "#94A3B8", bg: "rgba(148,163,184,0.14)" }, // cool gray — distinct from Draft slate
};

export default function Submittals() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;

  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBIC, setFilterBIC] = useState("all");
  const [search, setSearch] = useState("");
  // Bulk-op state — mirrors the RFI page. selectedIds is a Set so
  // toggling a single row is O(1) and React's structural compare
  // (we always replace the Set) keeps re-renders predictable.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["submittals", projectId],
    queryFn: () => projectId
      ? base44.entities.Submittal.filter({ project_id: projectId }, "-submitted_date")
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["submittals", projectId] });
  }, [qc, projectId]);

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Submittal.create(data),
    onSuccess: (row) => { invalidate(); setSelectedId(row?.id || null); toast.success("Submittal created"); },
    onError: (err) => toast.error(`Create failed: ${err.message}`),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => base44.entities.Submittal.update(id, data),
    onSuccess: () => { invalidate(); toast.success("Updated"); },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Submittal.delete(id),
    onSuccess: () => { invalidate(); setSelectedId(null); setToDelete(null); toast.success("Deleted"); },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  // ── Bulk mutations ────────────────────────────────────────────────
  // Bulk update — handles the special "__notes_append" sentinel from
  // SubmittalBulkEditModal. When present, we read each row's existing
  // notes off the cache and append the new text per row instead of
  // overwriting. Every other field is a flat patch applied uniformly.
  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }) => {
      const { __notes_append: notesAppend, ...patch } = data || {};
      // Snapshot the current cache once — avoids N reads per row.
      const cached = qc.getQueryData(["submittals", projectId]) || [];
      const byId = new Map(cached.map((r) => [r.id, r]));
      return batchProcess(ids, (id) => {
        const existing = byId.get(id);
        const rowPatch = { ...patch };
        if (notesAppend) {
          const prior = (existing?.notes || "").trimEnd();
          rowPatch.notes = prior ? `${prior}\n\n${notesAppend}` : notesAppend;
        }
        return base44.entities.Submittal.update(id, rowPatch);
      });
    },
    onSuccess: (results) => {
      invalidate();
      setSelectedIds(new Set());
      const ok = results.succeeded.length;
      if (results.failed.length > 0) {
        toast.warning(`${ok} updated, ${results.failed.length} failed`);
      } else {
        toast.success(`Updated ${ok} submittal${ok === 1 ? "" : "s"}`);
      }
    },
    onError: (err) => toast.error(`Bulk update failed: ${err.message}`),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => batchProcess(ids, (id) => base44.entities.Submittal.delete(id)),
    onSuccess: (results) => {
      invalidate();
      const ok = results.succeeded.length;
      if (selectedId && [...selectedIds].includes(selectedId)) setSelectedId(null);
      setSelectedIds(new Set());
      setShowBulkDelete(false);
      if (results.failed.length > 0) {
        toast.warning(`${ok} deleted, ${results.failed.length} failed`);
      } else {
        toast.success(`Deleted ${ok} submittal${ok === 1 ? "" : "s"}`);
      }
    },
    onError: (err) => toast.error(`Bulk delete failed: ${err.message}`),
  });

  const bulkCreateMut = useMutation({
    mutationFn: async (rows) => batchProcess(rows, (row) =>
      base44.entities.Submittal.create({
        project_id: projectId,
        project_name: activeProject?.project_name || activeProject?.name || "",
        round_number: 1,
        ...row,
      }),
    ),
    onSuccess: (results) => {
      invalidate();
      setShowBulkAdd(false);
      const ok = results.succeeded.length;
      if (results.failed.length > 0) {
        toast.warning(`${ok} added, ${results.failed.length} failed`);
      } else {
        toast.success(`Added ${ok} submittal${ok === 1 ? "" : "s"}`);
      }
    },
    onError: (err) => toast.error(`Bulk add failed: ${err.message}`),
  });

  // ── Filter/search ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = rows;
    if (filterStatus !== "all") list = list.filter((r) => r.status === filterStatus);
    if (filterBIC    !== "all") list = list.filter((r) => r.ball_in_court === filterBIC);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.submittal_number || "").toLowerCase().includes(q) ||
        (r.title           || "").toLowerCase().includes(q) ||
        (r.spec_section    || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, filterStatus, filterBIC, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((r) => ["Submitted","Under Review"].includes(r.status)).length;
    const approved = rows.filter((r) => r.status === "Approved" || r.status === "Approved as Noted").length;
    const rejected = rows.filter((r) => ["Rejected","Revise and Resubmit"].includes(r.status)).length;
    const overdue = rows.filter((r) => {
      if (!r.required_date) return false;
      if (["Approved","Approved as Noted","Void"].includes(r.status)) return false;
      return daysUntil(r.required_date) < 0;
    }).length;
    return { total, pending, approved, rejected, overdue };
  }, [rows]);

  const selected = selectedId ? rows.find((r) => r.id === selectedId) : null;
  const editing  = editingId  ? rows.find((r) => r.id === editingId)  : null;

  // ── Selection helpers ─────────────────────────────────────────────
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  // toggleAll uses the *filtered* list, not all rows — matches the
  // RFI pattern. Without this, "select all" while a status filter
  // was active would silently grab hidden rows too.
  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (filtered.length > 0 && filtered.every((r) => prev.has(r.id))) return new Set();
      const next = new Set(prev);
      filtered.forEach((r) => next.add(r.id));
      return next;
    });
  }, [filtered]);

  if (!projectId) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
        Select a project to view Submittals
      </div>
    </div>
  );

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, height: "100%", overflow: "hidden" }}>
      <CommandBar
        eyebrow={`${activeProject?.project_name || "PROJECT"} · SUBMITTALS`}
        title="Submittal Register"
        count={filtered.length}
        unit={filtered.length !== rows.length ? ` OF ${rows.length}` : ""}
        subtitle={stats.overdue > 0
          ? `${stats.overdue} overdue · ${stats.pending} awaiting review`
          : `${stats.pending} awaiting review · ${stats.approved} approved`}
      >
        <Button variant="secondary" icon="upload" onClick={() => setShowBulkAdd(true)}>
          BULK ADD
        </Button>
        <Button variant="primary" icon="plus" onClick={() => setShowCreate(true)}>
          NEW SUBMITTAL
        </Button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"   value={stats.total}    color="var(--accent)"
          active={filterStatus === "all" && filterBIC === "all"}
          onClick={() => { setFilterStatus("all"); setFilterBIC("all"); }} />
        <KpiTile compact label="Pending" value={stats.pending}  color="var(--status-warning)"
          active={filterStatus === "Under Review" || filterStatus === "Submitted"}
          onClick={() => setFilterStatus("Under Review")} />
        <KpiTile compact label="Approved" value={stats.approved} color="var(--status-success)"
          active={filterStatus === "Approved"}
          onClick={() => setFilterStatus("Approved")} />
        <KpiTile compact label="Rejected" value={stats.rejected} color="var(--status-error)"
          active={filterStatus === "Rejected"}
          onClick={() => setFilterStatus("Rejected")} />
        <KpiTile compact label="Overdue" value={stats.overdue} color="var(--status-error)" />
      </div>

      <PhoenixPanel style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Filter bar */}
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)", alignItems: "center" }}>
          {/* Master checkbox — operates on the *filtered* list so it
              respects the active status / BIC filters. The
              indeterminate state is set imperatively because <input>
              doesn't expose it as a controllable React prop. */}
          <input
            type="checkbox"
            aria-label="Select all visible submittals"
            ref={(el) => {
              if (!el) return;
              const some = filtered.some((r) => selectedIds.has(r.id));
              el.indeterminate = some && !allSelected;
            }}
            checked={allSelected}
            onChange={toggleAll}
            disabled={filtered.length === 0}
            style={{ margin: 0, marginRight: 4, cursor: filtered.length === 0 ? "not-allowed" : "pointer" }}
          />
          <input
            placeholder="Search # / title / spec section"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, maxWidth: 360, padding: "6px 10px", fontSize: 12 }}
          />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBIC} onValueChange={setFilterBIC}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Ball-in-court" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Ball-in-Court</SelectItem>
              {BIC_CHOICES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", borderRight: "1px solid var(--divider)" }}>
            {isLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {rows.length === 0 ? "No submittals yet. Click NEW SUBMITTAL to log one." : "No submittals match the current filters."}
              </div>
            ) : filtered.map((r) => (
              <SubmittalRow
                key={r.id}
                row={r}
                selected={r.id === selectedId}
                checked={selectedIds.has(r.id)}
                onToggle={() => toggleSelect(r.id)}
                onClick={() => setSelectedId(r.id)}
              />
            ))}
          </div>

          {/* Detail panel */}
          <SubmittalDetail
            submittal={selected}
            onClose={() => setSelectedId(null)}
            onEdit={() => selected && setEditingId(selected.id)}
            onDelete={() => selected && setToDelete(selected.id)}
            onStatusChange={(status) => selected && updateMut.mutate({ id: selected.id, status })}
            onBICChange={(bic) => selected && updateMut.mutate({ id: selected.id, ball_in_court: bic })}
          />
        </div>
      </PhoenixPanel>

      {(showCreate || editing) && (
        <SubmittalFormModal
          open={showCreate || !!editing}
          initial={editing || {}}
          projectId={projectId}
          projectName={activeProject?.project_name || activeProject?.name || ""}
          onClose={() => { setShowCreate(false); setEditingId(null); }}
          onSubmit={async (data) => {
            if (editing) await updateMut.mutateAsync({ id: editing.id, ...data });
            else await createMut.mutateAsync(data);
            setShowCreate(false);
            setEditingId(null);
          }}
        />
      )}

      {toDelete && (
        <DeleteDialog
          open={!!toDelete}
          onClose={() => setToDelete(null)}
          onConfirm={() => deleteMut.mutate(toDelete)}
          title="Delete submittal"
          description="This submittal and its comment thread will be soft-deleted. This cannot be undone from the UI."
        />
      )}

      {/* Bulk actions — bottom-fixed, only renders when ≥1 row is
          selected. Mirrors the RFI page exactly so muscle memory
          carries over. */}
      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: "EDIT SELECTED",
            icon: "edit",
            onClick: () => setShowBulkEdit(true),
          },
          {
            label: "DELETE",
            icon: "x",
            variant: "danger",
            onClick: () => setShowBulkDelete(true),
          },
        ]}
      />

      <SubmittalBulkEditModal
        open={showBulkEdit}
        count={selectedIds.size}
        onCancel={() => setShowBulkEdit(false)}
        onSubmit={(data) => {
          bulkUpdateMut.mutate({ ids: [...selectedIds], data });
          setShowBulkEdit(false);
        }}
      />

      <SubmittalBulkAddModal
        open={showBulkAdd}
        onCancel={() => setShowBulkAdd(false)}
        onSubmit={(rows) => bulkCreateMut.mutate(rows)}
      />

      <DeleteDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={() => bulkDeleteMut.mutate([...selectedIds])}
        title={`Delete ${selectedIds.size} submittal${selectedIds.size === 1 ? "" : "s"}`}
        description={`Soft-delete ${selectedIds.size} selected submittal${selectedIds.size === 1 ? "" : "s"}? This cannot be undone from the UI.`}
      />
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────

function SubmittalRow({ row, selected, checked, onToggle, onClick }) {
  const cfg = STATUS_CFG[row.status] || STATUS_CFG.Draft;
  const overdue =
    row.required_date &&
    !["Approved","Approved as Noted","Void"].includes(row.status) &&
    daysUntil(row.required_date) < 0;

  // The list is dense — give each row a status-tinted left rail and a
  // very faint status-tinted background wash so adjacent statuses
  // separate visually before the user even reads the chip.
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--divider)",
        cursor: "pointer",
        background: selected
          ? "var(--accent-muted)"
          : `linear-gradient(90deg, ${cfg.bg} 0%, transparent 22%)`,
        borderLeft: `3px solid ${selected ? "var(--accent)" : cfg.color}`,
      }}
      onMouseEnter={(e) => {
        if (selected) return;
        e.currentTarget.style.background =
          `linear-gradient(90deg, ${cfg.bg} 0%, var(--hover-bg) 30%)`;
      }}
      onMouseLeave={(e) => {
        if (selected) return;
        e.currentTarget.style.background =
          `linear-gradient(90deg, ${cfg.bg} 0%, transparent 22%)`;
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        {/* Selection checkbox — stops propagation so toggling the
            checkbox doesn't also pop the detail panel for that row.
            Hit area is intentionally larger than the input itself
            (10px padding around) for thumb-friendliness on tablets. */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          style={{ padding: "2px 6px 2px 0", display: "flex", alignItems: "center", cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={!!checked}
            onChange={(e) => { e.stopPropagation(); onToggle?.(); }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select submittal ${row.submittal_number || row.title}`}
            style={{ margin: 0, cursor: "pointer" }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.06em" }}>
            {row.submittal_number}
            {row.round_number > 1 && <span style={{ marginLeft: 6, color: "var(--status-warning)" }}>R{row.round_number}</span>}
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.title}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
            {row.spec_section ? `Spec ${row.spec_section} · ` : ""}
            {row.discipline || row.submittal_type || ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            padding: "2px 8px", borderRadius: 3, letterSpacing: "0.06em",
            color: cfg.color, background: cfg.bg, whiteSpace: "nowrap",
          }}>
            {row.status}
          </span>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: overdue ? "var(--status-error)" : "var(--text-muted)", marginTop: 4 }}>
            {row.required_date ? formatDate(row.required_date) : "—"}
            {overdue && " ⚠"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────────

function SubmittalDetail({ submittal, onClose, onEdit, onDelete, onStatusChange, onBICChange }) {
  if (!submittal) {
    return (
      <div style={{ width: 480, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, color: "var(--text-muted)", background: "var(--bg-surface)" }}>
        <div style={{ fontSize: 32 }}>◆</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>Select a submittal</div>
      </div>
    );
  }

  const cfg = STATUS_CFG[submittal.status] || STATUS_CFG.Draft;
  const overdue =
    submittal.required_date &&
    !["Approved","Approved as Noted","Void"].includes(submittal.status) &&
    daysUntil(submittal.required_date) < 0;

  return (
    <div style={{ width: 480, flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--bg-surface)", minHeight: 0 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.08em" }}>
              {submittal.submittal_number}
              {submittal.round_number > 1 && <span style={{ marginLeft: 8, color: "var(--status-warning)" }}>ROUND {submittal.round_number}</span>}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.3 }}>
              {submittal.title}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3, color: cfg.color, background: cfg.bg }}>
                {submittal.status}
              </span>
              {submittal.ball_in_court && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3, color: "var(--text-secondary)", background: "var(--bg-surface-high)" }}>
                  BIC · {submittal.ball_in_court}
                </span>
              )}
              {overdue && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)" }}>
                  ⚠ {Math.abs(daysUntil(submittal.required_date))}d overdue
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, marginLeft: 10 }}>×</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
        {/* Status pills — click to transition */}
        <DetailSection title="Status workflow">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => s !== submittal.status && onStatusChange(s)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: s === submittal.status ? `1px solid ${cfg.color}` : "1px solid var(--border-default)",
                  background: s === submittal.status ? cfg.bg : "transparent",
                  color: s === submittal.status ? cfg.color : "var(--text-muted)",
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                  cursor: s === submittal.status ? "default" : "pointer",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </DetailSection>

        {/* Ball-in-court chooser */}
        <DetailSection title="Ball in court">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {BIC_CHOICES.map((b) => (
              <button
                key={b}
                onClick={() => b !== submittal.ball_in_court && onBICChange(b)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: b === submittal.ball_in_court ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                  background: b === submittal.ball_in_court ? "var(--accent-muted)" : "transparent",
                  color: b === submittal.ball_in_court ? "var(--accent)" : "var(--text-muted)",
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                  cursor: b === submittal.ball_in_court ? "default" : "pointer",
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </DetailSection>

        {/* Meta grid */}
        <DetailSection title="Details">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Meta label="Type"          value={submittal.submittal_type} />
            <Meta label="Discipline"    value={submittal.discipline} />
            <Meta label="Spec Section"  value={submittal.spec_section} />
            <Meta label="Revision"      value={submittal.revision} />
            <Meta label="Submitted"     value={formatDate(submittal.submitted_date)} />
            <Meta label="Required"      value={formatDate(submittal.required_date)} warn={overdue} />
            <Meta label="Returned"      value={formatDate(submittal.returned_date)} />
            <Meta label="Approved"      value={formatDate(submittal.approved_date)} />
            <Meta label="Submitted by"  value={submittal.submitted_by} />
            <Meta label="Reviewer"      value={submittal.reviewer} />
          </div>
        </DetailSection>

        {submittal.notes && (
          <DetailSection title="Notes">
            <div style={{ padding: "8px 10px", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 4, fontFamily: "var(--font-body)", fontSize: 12, whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>
              {submittal.notes}
            </div>
          </DetailSection>
        )}

        {/* Comments */}
        <DetailSection title="Discussion">
          <div style={{ height: 320 }}>
            <CommentThread
              entityType="submittal"
              entityId={submittal.id}
              projectId={submittal.project_id}
              compact
            />
          </div>
        </DetailSection>
      </div>

      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--divider)", background: "var(--bg-surface-low)", display: "flex", gap: 8 }}>
        <button
          onClick={onEdit}
          style={{ flex: 1, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em" }}
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          style={{ background: "var(--bg-surface)", border: "1px solid var(--danger-border)", color: "var(--status-error)", borderRadius: 4, padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em" }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Meta({ label, value, warn }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: warn ? "var(--status-error)" : "var(--text-primary)", fontWeight: warn ? 700 : 500 }}>
        {value || "—"}
      </div>
    </div>
  );
}

// ── Create/edit modal ───────────────────────────────────────────────

function SubmittalFormModal({ open, initial, projectId, projectName, onClose, onSubmit }) {
  const [form, setForm] = useState({
    submittal_number: initial.submittal_number || "",
    title:            initial.title            || "",
    submittal_type:   initial.submittal_type   || "Shop Drawing",
    discipline:       initial.discipline       || "",
    spec_section:     initial.spec_section     || "",
    revision:         initial.revision         || "0",
    round_number:     initial.round_number     || 1,
    submitted_date:   initial.submitted_date   || "",
    required_date:    initial.required_date    || "",
    status:           initial.status           || "Draft",
    ball_in_court:    initial.ball_in_court    || "EOR",
    submitted_by:     initial.submitted_by     || "",
    reviewer:         initial.reviewer         || "",
    notes:            initial.notes            || "",
  });

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const isEdit = !!initial.id;

  const handleSubmit = async () => {
    if (!form.submittal_number.trim() || !form.title.trim()) {
      toast.error("Submittal number + title are required");
      return;
    }
    const record = {
      ...form,
      project_id:    projectId,
      project_name:  projectName,
      round_number:  Number(form.round_number) || 1,
      submitted_date: form.submitted_date || null,
      required_date:  form.required_date  || null,
    };
    await onSubmit(record);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Submittal" : "New Submittal"}</DialogTitle>
        </DialogHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
          <div style={{ gridColumn: "1 / span 1" }}>
            <Label>Submittal # *</Label>
            <Input value={form.submittal_number} onChange={(e) => setField("submittal_number", e.target.value)} placeholder="e.g. 05-1000" />
          </div>
          <div>
            <Label>Revision</Label>
            <Input value={form.revision} onChange={(e) => setField("revision", e.target.value)} placeholder="0" />
          </div>
          <div style={{ gridColumn: "1 / span 2" }}>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Structural steel shop drawings - Area A" />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.submittal_type} onValueChange={(v) => setField("submittal_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Discipline</Label>
            <Input value={form.discipline} onChange={(e) => setField("discipline", e.target.value)} placeholder="Structural" />
          </div>
          <div>
            <Label>Spec Section</Label>
            <Input value={form.spec_section} onChange={(e) => setField("spec_section", e.target.value)} placeholder="051200" />
          </div>
          <div>
            <Label>Round</Label>
            <Input type="number" min="1" value={form.round_number} onChange={(e) => setField("round_number", e.target.value)} />
          </div>
          <div>
            <Label>Submitted Date</Label>
            <Input type="date" value={form.submitted_date} onChange={(e) => setField("submitted_date", e.target.value)} />
          </div>
          <div>
            <Label>Required Date</Label>
            <Input type="date" value={form.required_date} onChange={(e) => setField("required_date", e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setField("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ball-in-court</Label>
            <Select value={form.ball_in_court} onValueChange={(v) => setField("ball_in_court", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BIC_CHOICES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Submitted By</Label>
            <Input value={form.submitted_by} onChange={(e) => setField("submitted_by", e.target.value)} placeholder="Detailer / fabricator" />
          </div>
          <div>
            <Label>Reviewer</Label>
            <Input value={form.reviewer} onChange={(e) => setField("reviewer", e.target.value)} placeholder="EOR / Architect" />
          </div>
          <div style={{ gridColumn: "1 / span 2" }}>
            <Label>Notes</Label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Transmittal scope, cover letter text, known issues…"
              style={{ width: "100%", padding: "8px 10px", fontSize: 12, fontFamily: "var(--font-body)", borderRadius: 4, resize: "vertical" }}
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            style={{ padding: "8px 14px", background: "transparent", border: "1px solid var(--border-default)", borderRadius: 4, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            style={{ padding: "8px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}
          >
            {isEdit ? "SAVE" : "CREATE"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
