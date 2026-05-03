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
import RoundTimeline from "@/components/submittals/RoundTimeline";
import NewRoundModal from "@/components/submittals/NewRoundModal";
import SheetResponseGrid from "@/components/submittals/SheetResponseGrid";
import { LinkedRFIs, LinkedTasks } from "@/components/submittals/LinkedEntities";
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
  "Revise and Resubmit","Rejected","Released for Fabrication","Void",
];

const TYPES = ["Shop Drawing","Product Data","Sample","Mock-up","Calculation","Other"];

const BIC_CHOICES = ["Contractor","Detailer","EOR","Architect","GC","Owner"];

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
  "Released for Fabrication": { color: "#0EA5E9", bg: "rgba(14,165,233,0.18)" }, // sky blue — past approval, into production
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
  const [showNewRound, setShowNewRound] = useState(false);
  const [showSheetResponse, setShowSheetResponse] = useState(null); // round object or null

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["submittals", projectId],
    queryFn: () => projectId
      ? base44.entities.Submittal.filter({ project_id: projectId }, "-submitted_date")
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Drawing sets for the active project — used by the "Linked drawing
  // sets" picker on the detail panel. Read-only here (the Drawings page
  // owns the create/edit flow), so a longer staleTime is fine.
  const { data: drawingSets = [] } = useQuery({
    queryKey: ["drawing_sets", projectId],
    queryFn: () => projectId
      ? base44.entities.DrawingSet.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Rounds for the selected submittal ────────────────────────────
  const { data: allRounds = [] } = useQuery({
    queryKey: ["submittal-rounds", projectId],
    queryFn: () => projectId
      ? base44.entities.SubmittalRound.filter({ project_id: projectId }, "round_number")
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });
  const roundsBySubmittal = useMemo(() => {
    const map = {};
    for (const r of allRounds) {
      if (!map[r.submittal_id]) map[r.submittal_id] = [];
      map[r.submittal_id].push(r);
    }
    for (const arr of Object.values(map)) {
      arr.sort((a, b) => (a.round_number || 1) - (b.round_number || 1));
    }
    return map;
  }, [allRounds]);

  // ── RFIs for linked-entity picker ────────────────────────────────
  const { data: allRfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => projectId
      ? base44.entities.RFI.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Schedule tasks for linked-entity picker ─────────────��────────
  const { data: allTasks = [] } = useQuery({
    queryKey: ["schedule-tasks", projectId],
    queryFn: () => projectId
      ? base44.entities.ScheduleTask.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Drawings for sheet-response grid ─────────────────────────────
  const { data: allDrawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId
      ? base44.entities.Drawing.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Sheet responses for the active round ─────────────────────────
  const { data: allSheetResponses = [] } = useQuery({
    queryKey: ["sheet-responses", projectId],
    queryFn: () => projectId
      ? base44.entities.SubmittalSheetResponse.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["submittals", projectId] });
    qc.invalidateQueries({ queryKey: ["submittal-rounds", projectId] });
    qc.invalidateQueries({ queryKey: ["sheet-responses", projectId] });
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

  // ── Round mutations ───────────────────────────────────────────────
  const createRoundMut = useMutation({
    mutationFn: async (data) => {
      const round = await base44.entities.SubmittalRound.create({
        ...data,
        project_id: projectId,
      });
      // Update parent submittal
      if (round?.id && data.submittal_id) {
        await base44.entities.Submittal.update(data.submittal_id, {
          current_round_id: round.id,
          total_rounds: data.round_number || 1,
          status: "Submitted",
          ball_in_court: data.ball_in_court || "EOR",
          submitted_date: data.submitted_date || new Date().toISOString().split("T")[0],
        });
      }
      return round;
    },
    onSuccess: () => { invalidate(); toast.success("Round created — submittal resubmitted"); setShowNewRound(false); },
    onError: (err) => toast.error(`Failed to create round: ${err.message}`),
  });

  const updateRoundMut = useMutation({
    mutationFn: ({ id, ...data }) => base44.entities.SubmittalRound.update(id, data),
    onSuccess: () => { invalidate(); toast.success("Round updated"); },
    onError: (err) => toast.error(`Failed to update round: ${err.message}`),
  });

  // ── Sheet response mutations ──────────────────────────────────────
  const saveSheetResponsesMut = useMutation({
    mutationFn: async ({ roundId, responses }) => {
      const results = { succeeded: 0, failed: 0 };
      for (const resp of responses) {
        try {
          if (resp.id) {
            await base44.entities.SubmittalSheetResponse.update(resp.id, {
              response_status: resp.response_status,
              reviewer_comment: resp.reviewer_comment || null,
            });
          } else {
            await base44.entities.SubmittalSheetResponse.create({
              project_id: projectId,
              submittal_round_id: roundId,
              drawing_id: resp.drawing_id || null,
              drawing_set_id: resp.drawing_set_id || null,
              sheet_number: resp.sheet_number || null,
              response_status: resp.response_status,
              reviewer_comment: resp.reviewer_comment || null,
            });
          }
          results.succeeded++;
        } catch {
          results.failed++;
        }
      }
      return results;
    },
    onSuccess: (results) => {
      invalidate();
      setShowSheetResponse(null);
      if (results.failed > 0) {
        toast.warning(`${results.succeeded} saved, ${results.failed} failed`);
      } else {
        toast.success(`${results.succeeded} sheet response(s) saved`);
      }
    },
    onError: (err) => toast.error(`Failed to save responses: ${err.message}`),
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
      if (["Approved","Approved as Noted","Released for Fabrication","Void"].includes(r.status)) return false;
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
            drawingSets={drawingSets}
            rounds={selected ? (roundsBySubmittal[selected.id] || []) : []}
            allRfis={allRfis}
            allTasks={allTasks}
            onClose={() => setSelectedId(null)}
            onEdit={() => selected && setEditingId(selected.id)}
            onDelete={() => selected && setToDelete(selected.id)}
            onStatusChange={(status) => selected && updateMut.mutate({ id: selected.id, status })}
            onBICChange={(bic) => selected && updateMut.mutate({ id: selected.id, ball_in_court: bic })}
            // Inline-edit hook — every editable cell in the detail
            // panel calls this with a single-field patch so we don't
            // need to round-trip through the modal for trivial fixes
            // like "fix the date" or "rename this submittal".
            onFieldChange={(patch) => selected && updateMut.mutate({ id: selected.id, ...patch })}
            onNewRound={() => setShowNewRound(true)}
            onReturnRound={(roundId) => {
              const round = allRounds.find((r) => r.id === roundId);
              if (round) setShowSheetResponse(round);
            }}
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

      {/* New Round modal — creates a new submittal round for the
          selected submittal. Carries forward drawing sets and
          increments the round number automatically. */}
      {showNewRound && selected && (
        <NewRoundModal
          open={showNewRound}
          submittal={selected}
          previousRound={
            (roundsBySubmittal[selected.id] || []).length > 0
              ? (roundsBySubmittal[selected.id] || []).at(-1)
              : null
          }
          onClose={() => setShowNewRound(false)}
          onSubmit={(data) => createRoundMut.mutate(data)}
        />
      )}

      {/* Sheet response grid — per-sheet response entry when a round
          is returned by the reviewer. Opens when "Mark Returned" is
          clicked on a timeline node. */}
      {showSheetResponse && (
        <Dialog open={!!showSheetResponse} onOpenChange={(o) => !o && setShowSheetResponse(null)}>
          <DialogContent className="sm:max-w-[900px]" style={{ padding: 0 }}>
            <SheetResponseGrid
              round={showSheetResponse}
              drawings={allDrawings.filter((d) => {
                const setIds = showSheetResponse.drawing_set_ids || [];
                return setIds.includes(d.drawing_set_id);
              })}
              existingResponses={allSheetResponses.filter(
                (r) => r.submittal_round_id === showSheetResponse.id
              )}
              onSave={(responses) =>
                saveSheetResponsesMut.mutate({
                  roundId: showSheetResponse.id,
                  responses,
                })
              }
              onClose={() => setShowSheetResponse(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────

function SubmittalRow({ row, selected, checked, onToggle, onClick }) {
  const cfg = STATUS_CFG[row.status] || STATUS_CFG.Draft;
  const overdue =
    row.required_date &&
    !["Approved","Approved as Noted","Released for Fabrication","Void"].includes(row.status) &&
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

function SubmittalDetail({ submittal, drawingSets = [], rounds = [], allRfis = [], allTasks = [], onClose, onEdit, onDelete, onStatusChange, onBICChange, onFieldChange, onNewRound, onReturnRound }) {
  // Wrap onFieldChange so a no-op edit (typing the same value back)
  // doesn't fire a network update — small UX nicety, also stops
  // accidental "Updated" toasts when the user just tabs through.
  const patch = (field, value) => {
    if (!onFieldChange) return;
    if ((submittal[field] ?? "") === (value ?? "")) return;
    onFieldChange({ [field]: value === "" ? null : value });
  };
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
    !["Approved","Approved as Noted","Released for Fabrication","Void"].includes(submittal.status) &&
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
            <InlineText
              value={submittal.title}
              onCommit={(v) => patch("title", v)}
              required
              style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.3 }}
              placeholder="Untitled submittal"
            />
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

        {/* Round History — vertical timeline of all submittal rounds
            with status badges, durations, and BIC. "New Round" creates
            a fresh resubmission round. */}
        <DetailSection title={`Round History (${rounds.length})`}>
          <RoundTimeline
            rounds={rounds}
            submittalId={submittal.id}
            onReturnRound={onReturnRound}
          />
          {onNewRound && (
            <button
              onClick={onNewRound}
              style={{
                marginTop: 8,
                padding: "6px 14px",
                borderRadius: 4,
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              + New Round
            </button>
          )}
        </DetailSection>

        {/* Meta grid — every cell is inline-editable. Click the value
            (or the dash for an empty field) to turn it into an
            editor; blur or Enter commits, Esc cancels. Saves a round
            trip through the Edit modal for one-field fixes like
            "submitted on the 14th, not the 15th." */}
        <DetailSection title="Details">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <EditableMeta
              label="Type"
              kind="select"
              value={submittal.submittal_type}
              choices={TYPES}
              allowClear
              onCommit={(v) => patch("submittal_type", v)}
            />
            <EditableMeta
              label="Discipline"
              value={submittal.discipline}
              onCommit={(v) => patch("discipline", v)}
            />
            <EditableMeta
              label="Spec Section"
              value={submittal.spec_section}
              onCommit={(v) => patch("spec_section", v)}
            />
            <EditableMeta
              label="Revision"
              value={submittal.revision}
              onCommit={(v) => patch("revision", v)}
            />
            <EditableMeta
              label="Submitted"
              kind="date"
              value={submittal.submitted_date}
              displayValue={formatDate(submittal.submitted_date)}
              onCommit={(v) => patch("submitted_date", v)}
            />
            <EditableMeta
              label="Required"
              kind="date"
              value={submittal.required_date}
              displayValue={formatDate(submittal.required_date)}
              warn={overdue}
              onCommit={(v) => patch("required_date", v)}
            />
            <EditableMeta
              label="Returned"
              kind="date"
              value={submittal.returned_date}
              displayValue={formatDate(submittal.returned_date)}
              onCommit={(v) => patch("returned_date", v)}
            />
            <EditableMeta
              label="Approved"
              kind="date"
              value={submittal.approved_date}
              displayValue={formatDate(submittal.approved_date)}
              onCommit={(v) => patch("approved_date", v)}
            />
            <EditableMeta
              label="Submitted by"
              value={submittal.submitted_by}
              onCommit={(v) => patch("submitted_by", v)}
            />
            <EditableMeta
              label="Reviewer"
              value={submittal.reviewer}
              onCommit={(v) => patch("reviewer", v)}
            />
            <EditableMeta
              label="Received From"
              value={submittal.received_from}
              onCommit={(v) => patch("received_from", v)}
            />
            <EditableMeta
              label="Distributed To"
              value={submittal.distributed_to}
              onCommit={(v) => patch("distributed_to", v)}
            />
            <EditableMeta
              label="Transmittal #"
              value={submittal.transmittal_number}
              onCommit={(v) => patch("transmittal_number", v)}
            />
            <EditableMeta
              label="Days in Review"
              value={submittal.days_in_review != null ? String(submittal.days_in_review) : ""}
              onCommit={(v) => patch("days_in_review", v ? parseInt(v, 10) : null)}
            />
          </div>
        </DetailSection>

        {/* Linked drawing sets — chips per linked set + a picker to
            link more. The submittal_drawing_sets relationship is
            stored as a uuid[] on the submittal row, so add/remove is
            a single-field patch on `drawing_set_ids`. */}
        <DetailSection title="Linked drawing sets">
          <LinkedDrawingSets
            value={submittal.drawing_set_ids || []}
            allSets={drawingSets}
            onChange={(next) => onFieldChange && onFieldChange({ drawing_set_ids: next })}
          />
        </DetailSection>

        {/* Linked RFIs */}
        <DetailSection title="Linked RFIs">
          <LinkedRFIs
            value={submittal.linked_rfi_ids || []}
            allRfis={allRfis}
            onChange={(next) => onFieldChange && onFieldChange({ linked_rfi_ids: next })}
          />
        </DetailSection>

        {/* Linked Tasks */}
        <DetailSection title="Linked Tasks">
          <LinkedTasks
            value={submittal.linked_task_ids || []}
            allTasks={allTasks}
            onChange={(next) => onFieldChange && onFieldChange({ linked_task_ids: next })}
          />
        </DetailSection>

        {/* Notes — always rendered (even when empty) so the user has a
            click target for adding the first note inline. */}
        <DetailSection title="Notes">
          <InlineTextarea
            value={submittal.notes || ""}
            onCommit={(v) => patch("notes", v)}
            placeholder="Click to add notes (cover-letter scope, known issues, etc.)"
          />
        </DetailSection>

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

// ── Inline-edit primitives ──────────────────────────────────────────
// Click-to-edit cells used throughout the SubmittalDetail panel.
// Common rules across all three:
//   • Esc cancels (restores prior value, exits edit mode).
//   • Enter commits for single-line; Cmd/Ctrl+Enter commits for
//     multi-line — bare Enter inside a textarea inserts a newline,
//     which is what users want for notes.
//   • Blur commits.
//   • A no-op commit (same value) silently exits without firing the
//     network call (the parent's `patch()` does the same guard but
//     belt-and-suspenders is cheap).

function InlineText({ value, onCommit, required, style, placeholder }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || "");
  React.useEffect(() => { setDraft(value || ""); }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (required && !next) { setDraft(value || ""); setEditing(false); return; }
    if (next === (value || "")) { setEditing(false); return; }
    onCommit(next);
    setEditing(false);
  };
  const cancel = () => { setDraft(value || ""); setEditing(false); };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title="Click to edit"
        style={{
          ...style,
          cursor: "text",
          padding: "2px 0",
          borderBottom: "1px dashed transparent",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderBottom = "1px dashed var(--border-default)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderBottom = "1px dashed transparent"; }}
      >
        {value || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{placeholder || "—"}</span>}
      </div>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); cancel(); }
      }}
      style={{
        ...style,
        width: "100%",
        background: "var(--bg-input, var(--bg-surface-low))",
        border: "1px solid var(--accent)",
        borderRadius: 3,
        padding: "2px 6px",
        outline: "none",
      }}
    />
  );
}

function InlineTextarea({ value, onCommit, placeholder }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || "");
  React.useEffect(() => { setDraft(value || ""); }, [value]);

  const commit = () => {
    if ((draft || "") === (value || "")) { setEditing(false); return; }
    onCommit(draft || "");
    setEditing(false);
  };
  const cancel = () => { setDraft(value || ""); setEditing(false); };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title="Click to edit"
        style={{
          padding: "8px 10px",
          background: "var(--bg-surface-low)",
          border: "1px dashed var(--border-default)",
          borderRadius: 4,
          fontFamily: "var(--font-body)",
          fontSize: 12,
          whiteSpace: "pre-wrap",
          color: value ? "var(--text-primary)" : "var(--text-muted)",
          fontStyle: value ? "normal" : "italic",
          cursor: "text",
          minHeight: 40,
        }}
      >
        {value || (placeholder || "Click to add notes")}
      </div>
    );
  }
  return (
    <textarea
      autoFocus
      rows={4}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
      }}
      style={{
        width: "100%",
        padding: "8px 10px",
        fontSize: 12,
        fontFamily: "var(--font-body)",
        background: "var(--bg-input, var(--bg-surface-low))",
        border: "1px solid var(--accent)",
        borderRadius: 4,
        resize: "vertical",
        outline: "none",
      }}
    />
  );
}

// LinkedDrawingSets — chip list of linked drawing sets with an add
// picker. The link is stored as `submittal.drawing_set_ids: uuid[]`,
// so add/remove just rewrites the array and patches the column.
//
// We render set names by joining against the project-wide drawingSets
// list passed in from the parent. A linked id with no matching set
// (deleted/soft-deleted set) still renders as a chip with a "(missing)"
// hint so the user can unlink it instead of being silently lost.
function LinkedDrawingSets({ value = [], allSets = [], onChange }) {
  const [picking, setPicking] = React.useState(false);
  // Index live sets for O(1) lookups when rendering chips.
  const setsById = React.useMemo(() => {
    const m = new Map();
    allSets.forEach((s) => m.set(s.id, s));
    return m;
  }, [allSets]);

  // Sets the user can still pick (not already linked, not soft-deleted).
  const available = React.useMemo(
    () => allSets.filter((s) => !value.includes(s.id) && !s.is_deleted),
    [allSets, value],
  );

  const remove = (id) => {
    if (!onChange) return;
    onChange(value.filter((v) => v !== id));
  };
  const add = (id) => {
    if (!onChange || !id) return;
    if (value.includes(id)) return;
    onChange([...value, id]);
    setPicking(false);
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {value.length === 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>
            No drawing sets linked.
          </span>
        )}
        {value.map((id) => {
          const set = setsById.get(id);
          const label = set
            ? `${set.set_name || "(unnamed set)"}${set.revision ? ` · R${set.revision}` : ""}`
            : "(missing set)";
          return (
            <span
              key={id}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "3px 4px 3px 10px", borderRadius: 999,
                background: set ? "var(--accent-muted)" : "var(--bg-surface-high)",
                color: set ? "var(--accent)" : "var(--text-muted)",
                border: set ? "1px solid var(--accent)" : "1px dashed var(--border-default)",
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                maxWidth: 360,
              }}
              title={set?.discipline ? `${label} · ${set.discipline}` : label}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {label}
              </span>
              <button
                onClick={() => remove(id)}
                title="Unlink this drawing set"
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "inherit", padding: "0 4px", fontSize: 12, lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      {picking ? (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => add(e.target.value)}
          onBlur={() => setPicking(false)}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 10, padding: "4px 8px",
            background: "var(--bg-input, var(--bg-surface-low))",
            border: "1px solid var(--accent)", borderRadius: 3,
            color: "var(--text-primary)", outline: "none",
            maxWidth: "100%",
          }}
        >
          <option value="">— pick a drawing set —</option>
          {available.length === 0 && (
            <option disabled value="__none">
              No more sets to link
            </option>
          )}
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {(s.set_name || "(unnamed set)") + (s.revision ? ` · R${s.revision}` : "")}
              {s.discipline ? ` · ${s.discipline}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <button
          onClick={() => setPicking(true)}
          disabled={available.length === 0}
          title={available.length === 0 ? "All project drawing sets are already linked" : "Link a drawing set to this submittal"}
          style={{
            padding: "4px 10px", borderRadius: 3,
            background: "transparent",
            border: "1px dashed var(--border-default)",
            color: available.length === 0 ? "var(--text-muted)" : "var(--accent)",
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            cursor: available.length === 0 ? "not-allowed" : "pointer",
            textTransform: "uppercase",
          }}
        >
          + Link drawing set
        </button>
      )}
    </div>
  );
}

// EditableMeta — drop-in replacement for <Meta>. `kind` selects the
// editor: "text" (default), "date" (HTML date input), "select"
// (constrained to `choices`). For date cells, pass a pre-formatted
// `displayValue` for the read-only state; the underlying `value`
// stays in ISO so the date input round-trips cleanly.
function EditableMeta({ label, value, displayValue, kind = "text", choices, allowClear, warn, onCommit }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  React.useEffect(() => { setDraft(value ?? ""); }, [value]);

  const commit = (next) => {
    const v = next === undefined ? draft : next;
    if ((v ?? "") === (value ?? "")) { setEditing(false); return; }
    onCommit(v === "" ? null : v);
    setEditing(false);
  };
  const cancel = () => { setDraft(value ?? ""); setEditing(false); };

  const labelEl = (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 2 }}>
      {label}
    </div>
  );

  if (!editing) {
    const shown = displayValue || value;
    return (
      <div>
        {labelEl}
        <div
          onClick={() => setEditing(true)}
          title="Click to edit"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: warn ? "var(--status-error)" : (shown ? "var(--text-primary)" : "var(--text-muted)"),
            fontWeight: warn ? 700 : 500,
            cursor: "text",
            padding: "2px 0",
            borderBottom: "1px dashed transparent",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderBottom = "1px dashed var(--border-default)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderBottom = "1px dashed transparent"; }}
        >
          {shown || "—"}
        </div>
      </div>
    );
  }

  // Editing state — input shape depends on kind.
  const baseStyle = {
    width: "100%",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    background: "var(--bg-input, var(--bg-surface-low))",
    border: "1px solid var(--accent)",
    borderRadius: 3,
    padding: "2px 6px",
    outline: "none",
  };

  if (kind === "select") {
    return (
      <div>
        {labelEl}
        <select
          autoFocus
          value={draft || ""}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
          onBlur={() => commit()}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } }}
          style={baseStyle}
        >
          {allowClear && <option value="">— none —</option>}
          {choices.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    );
  }

  if (kind === "date") {
    return (
      <div>
        {labelEl}
        <input
          type="date"
          autoFocus
          value={draft || ""}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          style={baseStyle}
        />
      </div>
    );
  }

  return (
    <div>
      {labelEl}
      <input
        autoFocus
        value={draft || ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        style={baseStyle}
      />
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
