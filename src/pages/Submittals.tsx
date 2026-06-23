import { useCallback, useMemo, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { lockLinkedSetsIfApproved, addSubmittalRound } from "@/hooks/useSubmittals";
import { logActivity, logTransition } from "@/services/auditLogger";
import { runSubmittalStatusTriggers } from "@/lib/submittalSmartTriggers";
import { localToday } from "@/utils/dates";
import { useProjectContext } from "@/components/shared/ProjectContext";
import {
  CommandBar as CommandBarRaw,
  KpiTile as KpiTileRaw,
  Button as ButtonRaw,
  BulkActionBar as BulkActionBarRaw,
} from "@/components/design-system";
import { PhoenixPanel as PhoenixPanelRaw } from "@/components/shared/PhoenixPanel";
import { toast } from "sonner";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { daysUntil } from "@/lib/dateMath";
import SubmittalBulkEditModal from "@/components/submittals/SubmittalBulkEditModal";
import SubmittalBulkAddModal from "@/components/submittals/SubmittalBulkAddModal";
import NewRoundModalRaw from "@/components/submittals/NewRoundModal";
import ReleaseGateOverrideModalRaw from "@/components/submittals/ReleaseGateOverrideModal";
import SheetResponseGridRaw from "@/components/submittals/SheetResponseGrid";
import { FabReleaseBlockedError, isFabReleaseBlocked } from "@/lib/fabRelease/releaseStatus";
import {
  collectOpenItems,
  pickCarryForwardResponses,
  formatCarryForwardNotes,
} from "@/lib/submittalResubmittal";
import { forecastPortfolio } from "@/lib/submittalForecast";
import { batchProcess } from "@/utils/batchProcess";
import { usePermissions } from "@/services/permissions";
import { BIC_CHOICES, STATUSES, compareSubmittalsByDrawingSet } from "./submittals/format";
import { Dialog, DialogContent, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./submittals/uiCompat";
import { SubmittalDetail, SubmittalVirtualList } from "./submittals/components";
import SubmittalFormModal from "./submittals/SubmittalFormModal";
import type { DrawingSet, DrawingSetsById, Submittal } from "./submittals/types";

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

// The design-system primitives + PhoenixPanel are still .jsx; these casts
// are removable once the shared layer is typed.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const CommandBar = CommandBarRaw as unknown as ComponentType<AnyProps>;
const KpiTile = KpiTileRaw as unknown as ComponentType<AnyProps>;
const Button = ButtonRaw as unknown as ComponentType<AnyProps>;
const BulkActionBar = BulkActionBarRaw as unknown as ComponentType<AnyProps>;
const PhoenixPanel = PhoenixPanelRaw as unknown as ComponentType<AnyProps>;
// These modals are still .jsx, so TS infers their array props from `[]` default
// params as `never[]`; cast at the boundary (removable once each is typed) so
// the typed parent can pass real arrays. Runtime is unchanged.
const NewRoundModal = NewRoundModalRaw as unknown as ComponentType<AnyProps>;
const ReleaseGateOverrideModal = ReleaseGateOverrideModalRaw as unknown as ComponentType<AnyProps>;
const SheetResponseGrid = SheetResponseGridRaw as unknown as ComponentType<AnyProps>;

export default function Submittals() {
  const qc = useQueryClient();
  const activeProject = useProjectContext().activeProject as any;
  const projectId = activeProject?.id as string | undefined;
  const { can } = usePermissions();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBIC, setFilterBIC] = useState("all");
  const [search, setSearch] = useState("");
  // Bulk-op state — mirrors the RFI page. selectedIds is a Set so
  // toggling a single row is O(1) and React's structural compare
  // (we always replace the Set) keeps re-renders predictable.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showNewRound, setShowNewRound] = useState(false);
  // Pending "Release for Fabrication" move blocked by open RFIs — drives the
  // override dialog (the server gate refused; PM can release with a reason).
  const [releaseBlock, setReleaseBlock] = useState<{ input: any; rfis: string[] } | null>(null);
  const [showSheetResponse, setShowSheetResponse] = useState<any>(null); // round object or null

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["submittals", projectId],
    queryFn: () => projectId
      ? entities.Submittal.filter({ project_id: projectId }, "-submitted_date")
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
      ? entities.DrawingSet.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const drawingSetsById: DrawingSetsById = useMemo(() => {
    // Bridge the generated DB row to the page's domain `DrawingSet` view (same
    // data, nullable columns modeled as optional). Cast preserves runtime; the
    // map only ever holds real drawing-set rows. Removable once `types` models
    // the nullable columns directly.
    const map = new Map<string, DrawingSet>();
    for (const set of drawingSets) {
      if (set?.id) map.set(set.id, set as DrawingSet);
    }
    return map;
  }, [drawingSets]);

  // ── Rounds for the selected submittal ────────────────────────────
  const { data: allRounds = [] } = useQuery({
    queryKey: ["submittal-rounds", projectId],
    queryFn: () => projectId
      ? entities.SubmittalRound.filter({ project_id: projectId }, "round_number")
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });
  const roundsBySubmittal = useMemo(() => {
    const map: Record<string, any[]> = {};
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
      ? entities.RFI.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Schedule tasks for linked-entity picker ─────────────────────��─
  const { data: allTasks = [] } = useQuery({
    queryKey: ["schedule-tasks", projectId],
    queryFn: () => projectId
      ? entities.ScheduleTask.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Drawings for sheet-response grid ─────────────────────────────
  const { data: allDrawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId
      ? entities.Drawing.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Sheet responses for the active round ─────────────────────────
  const { data: allSheetResponses = [] } = useQuery({
    queryKey: ["sheet-responses", projectId],
    queryFn: () => projectId
      ? entities.SubmittalSheetResponse.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["submittals", projectId] });
    qc.invalidateQueries({ queryKey: ["submittal-rounds", projectId] });
    qc.invalidateQueries({ queryKey: ["sheet-responses", projectId] });
    // Status moves can auto-queue a detailing task (submittalSmartTriggers).
    qc.invalidateQueries({ queryKey: ["action-items", projectId] });
    qc.invalidateQueries({ queryKey: ["action-items"] });
  }, [qc, projectId]);

  const createMut = useMutation({
    mutationFn: (data: any) => entities.Submittal.create(data),
    onSuccess: (row) => { invalidate(); logActivity("submittal", "created", row, { projectId }); setSelectedId(row?.id || null); toast.success("Submittal created"); },
    onError: (err: any) => {
      const msg = String(err?.message || "");
      toast.error(
        /submittals_unique_per_project|duplicate key/i.test(msg)
          ? "That submittal number already exists in this project — use a different number."
          : `Create failed: ${err.message}`,
      );
    },
  });
  const updateMut = useMutation({
    // Lock-aware: terminal-approved statuses auto-lock the linked drawing sets
    // (§20 moat). Routes through the canonical lockLinkedSetsIfApproved so this
    // page's inline status edits + the verb CTA can't release a package to fab
    // without locking it. (Previously this page's update bypassed the lock.)
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      const prevStatus = rows.find((r: any) => r.id === id)?.status ?? null;
      const updated = await entities.Submittal.update(id, data);
      await lockLinkedSetsIfApproved(updated as any);
      // Smart triggers: moves into Rejected / R&R / Approved-as-Noted queue a
      // draft detailing task (deduped inside; never throws).
      if (typeof data.status === "string") {
        await runSubmittalStatusTriggers({ submittal: updated as any, prevStatus, nextStatus: data.status });
        logTransition("submittal", updated as any, prevStatus ?? "—", data.status, { projectId });
      } else {
        logActivity("submittal", "updated", updated as any, { projectId });
      }
      return updated;
    },
    onSuccess: () => { invalidate(); toast.success("Updated"); },
    onError: (err: any) => {
      const msg = String(err?.message || "");
      toast.error(
        isFabReleaseBlocked(err)
          ? `Release blocked by open RFIs — use the "Release for Fabrication" action to override, or resolve the RFIs.`
          : /submittals_unique_per_project|duplicate key/i.test(msg)
            ? "That submittal number already exists in this project — use a different number."
            : `Update failed: ${err.message}`,
      );
    },
  });
  // Verb CTA → the single audited write path: logs a submittal_rounds row +
  // patches + auto-locks, atomically (activates the previously-empty round log).
  const advanceMut = useMutation({
    mutationFn: (input: Parameters<typeof addSubmittalRound>[0]) => addSubmittalRound(input),
    onSuccess: () => { invalidate(); toast.success("Round logged"); setReleaseBlock(null); },
    onError: (err: any, variables) => {
      // A blocked "Release for Fabrication" opens the override dialog with the
      // pending move so a PM can release with a reason (or cancel + resolve).
      if (err instanceof FabReleaseBlockedError) {
        setReleaseBlock({ input: variables, rfis: err.blockingRfiNumbers || [] });
      } else {
        toast.error(`Advance failed: ${err.message}`);
      }
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => entities.Submittal.delete(id),
    onSuccess: (_d, id) => {
      logActivity("submittal", "deleted", rows.find((r: any) => r.id === id) || { id, project_id: projectId }, { projectId });
      invalidate(); setSelectedId(null); setToDelete(null); toast.success("Deleted");
    },
    onError: (err: any) => toast.error(`Delete failed: ${err.message}`),
  });

  // ── Bulk mutations ────────────────────────────────────────────────
  // Bulk update — handles the special "__notes_append" sentinel from
  // SubmittalBulkEditModal. When present, we read each row's existing
  // notes off the cache and append the new text per row instead of
  // overwriting. Every other field is a flat patch applied uniformly.
  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }: { ids: string[]; data: any }) => {
      const { __notes_append: notesAppend, ...patch } = data || {};
      // Snapshot the current cache once — avoids N reads per row.
      const cached = (qc.getQueryData(["submittals", projectId]) || []) as any[];
      const byId = new Map(cached.map((r) => [r.id, r]));
      const patchHasStatus = typeof patch.status === "string";
      return batchProcess(ids, async (id) => {
        const existing = byId.get(id);
        const rowPatch: Record<string, any> = { ...patch };
        if (notesAppend) {
          const prior = (existing?.notes || "").trimEnd();
          rowPatch.notes = prior ? `${prior}\n\n${notesAppend}` : notesAppend;
        }
        const updated = await entities.Submittal.update(id, rowPatch);
        // §20: a bulk move to a terminal-approved status must auto-lock the
        // linked drawing sets, exactly like the single-row updateMut — otherwise
        // bulk-approving releases a package to fab without locking it. The
        // canonical helper no-ops for non-approved statuses and swallows lock
        // failures (best-effort, never breaks the batch).
        if (patchHasStatus) await lockLinkedSetsIfApproved(updated as any);
        return updated;
      });
    },
    onSuccess: (results, variables) => {
      invalidate();
      const patchStatus = (variables as any)?.data?.status;
      results.succeeded.forEach(({ value, item }: any) => {
        if (patchStatus) logActivity("submittal", "status_changed", value || { id: item, project_id: projectId }, { projectId, description: `→ ${patchStatus}` });
        else logActivity("submittal", "updated", value || { id: item, project_id: projectId }, { projectId });
      });
      setSelectedIds(new Set());
      const ok = results.succeeded.length;
      if (results.failed.length > 0) {
        toast.warning(`${ok} updated, ${results.failed.length} failed`);
      } else {
        toast.success(`Updated ${ok} submittal${ok === 1 ? "" : "s"}`);
      }
    },
    onError: (err: any) => toast.error(`Bulk update failed: ${err.message}`),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => batchProcess(ids, (id) => entities.Submittal.delete(id)),
    onSuccess: (results) => {
      invalidate();
      results.succeeded.forEach(({ item }: any) =>
        logActivity("submittal", "deleted", rows.find((r: any) => r.id === item) || { id: item, project_id: projectId }, { projectId }));
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
    onError: (err: any) => toast.error(`Bulk delete failed: ${err.message}`),
  });

  const bulkCreateMut = useMutation({
    mutationFn: async (newRows: any[]) => batchProcess(newRows, (row) =>
      entities.Submittal.create({
        project_id: projectId,
        project_name: activeProject?.project_name || activeProject?.name || "",
        round_number: 1,
        ...row,
      }),
    ),
    onSuccess: (results) => {
      invalidate();
      results.succeeded.forEach(({ value, item }: any) =>
        logActivity("submittal", "created", value || item || { project_id: projectId }, { projectId }));
      setShowBulkAdd(false);
      const ok = results.succeeded.length;
      if (results.failed.length > 0) {
        toast.warning(`${ok} added, ${results.failed.length} failed`);
      } else {
        toast.success(`Added ${ok} submittal${ok === 1 ? "" : "s"}`);
      }
    },
    onError: (err: any) => toast.error(`Bulk add failed: ${err.message}`),
  });

  // ── Round mutations ───────────────────────────────────────────────
  const createRoundMut = useMutation({
    mutationFn: async (data: any) => {
      const round = await entities.SubmittalRound.create({
        ...data,
        project_id: projectId,
      });
      // Update parent submittal
      if (round?.id && data.submittal_id) {
        await entities.Submittal.update(data.submittal_id, {
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
    onError: (err: any) => toast.error(`Failed to create round: ${err.message}`),
  });

  // ── Sheet response mutations ──────────────────────────────────────
  const saveSheetResponsesMut = useMutation({
    mutationFn: async ({ roundId, responses }: { roundId: string; responses: any[] }) => {
      const results = { succeeded: 0, failed: 0 };
      // The page early-returns without a project, so this never runs unscoped;
      // narrow projectId to a string for the row insert (no-op guard at runtime).
      if (!projectId) return results;
      for (const resp of responses) {
        try {
          if (resp.id) {
            await entities.SubmittalSheetResponse.update(resp.id, {
              response_status: resp.response_status,
              reviewer_comment: resp.reviewer_comment || null,
            });
          } else {
            await entities.SubmittalSheetResponse.create({
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
    onError: (err: any) => toast.error(`Failed to save responses: ${err.message}`),
  });

  // ── Filter/search ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    // KPI cards filter by GROUPED status (matching their stat counts); the
    // status dropdown filters by an EXACT status. Group keys expand to the same
    // status sets the counts use — fixes "Pending/Approved show nothing" and
    // "Rejected counts 2 but lists 1" (the count grouped statuses the exact
    // filter didn't). See the `stats` memo for the matching count definitions.
    const STATUS_GROUPS: Record<string, string[]> = {
      __pending: ["Submitted", "Under Review"],
      __approved: ["Approved", "Approved as Noted", "Released for Fabrication"],
      __rejected: ["Rejected", "Revise and Resubmit"],
    };
    let list = rows;
    if (filterStatus !== "all") {
      const group = STATUS_GROUPS[filterStatus];
      list = group
        ? list.filter((r) => group.includes(r.status))
        : list.filter((r) => r.status === filterStatus);
    }
    if (filterBIC !== "all") list = list.filter((r) => r.ball_in_court === filterBIC);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.submittal_number || "").toLowerCase().includes(q) ||
        (r.title || "").toLowerCase().includes(q) ||
        (r.spec_section || "").toLowerCase().includes(q),
      );
    }
    return list
      .slice()
      // Domain-view bridge for the comparator (same rows, nullable columns
      // modeled as optional) — no runtime change.
      .sort((a, b) => compareSubmittalsByDrawingSet(a as Submittal, b as Submittal, drawingSetsById));
  }, [rows, filterStatus, filterBIC, search, drawingSetsById]);

  const stats = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((r) => ["Submitted", "Under Review"].includes(r.status)).length;
    // Match the useSubmittals hook's `approved` definition — anything past
    // the BFA gate counts (Approved / Approved as Noted / Released for Fab).
    const approved = rows.filter((r) =>
      r.status === "Approved" ||
      r.status === "Approved as Noted" ||
      r.status === "Released for Fabrication"
    ).length;
    const rejected = rows.filter((r) => ["Rejected", "Revise and Resubmit"].includes(r.status)).length;
    const overdue = rows.filter((r) => {
      if (!r.required_date) return false;
      if (["Approved", "Approved as Noted", "Released for Fabrication", "Void"].includes(r.status)) return false;
      return daysUntil(r.required_date) < 0;
    }).length;
    return { total, pending, approved, rejected, overdue };
  }, [rows]);

  // Review-return forecast across all submittals — learns the shop's cycle
  // time from history (rounds + completed submittals) and projects each pending
  // review's return + late risk. Stats reused by the detail panel's forecast.
  const today = localToday();
  const reviewForecast = useMemo(
    () => forecastPortfolio({ submittals: rows, rounds: allRounds, today }),
    [rows, allRounds, today],
  );
  const reviewsAtRisk = reviewForecast.summary.atRisk + reviewForecast.summary.late;

  const selected = (selectedId ? rows.find((r) => r.id === selectedId) : null) ?? null;
  const editing = (editingId ? rows.find((r) => r.id === editingId) : null) ?? null;

  // Domain-view bridges for the typed child components. The queries yield
  // generated DB rows (nullable string columns); the child props use the page's
  // `Submittal`/`DrawingSet` interfaces, which model those same columns as
  // optional. These casts bridge that null↔undefined representation gap only —
  // identical data, no runtime change, null preserved. Removable once
  // `./submittals/types` models the nullable columns directly.
  const rowsView = rows as Submittal[];
  const filteredView = filtered as Submittal[];
  const drawingSetsView = drawingSets as DrawingSet[];
  const selectedView = selected as Submittal | null;
  const editingView = editing as Submittal | null;

  // ── Selection helpers ─────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
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
    <div style={{ padding: "10px 24px 24px", display: "flex", flexDirection: "column", gap: 16, height: "100%", overflow: "hidden" }}>
      <CommandBar
        eyebrow={`${activeProject?.project_name || "PROJECT"} · SUBMITTALS`}
        title="Submittal Register"
        count={filtered.length}
        unit={filtered.length !== rows.length ? ` OF ${rows.length}` : ""}
        subtitle={stats.overdue > 0
          ? `${stats.overdue} overdue · ${stats.pending} awaiting review`
          : `${stats.pending} awaiting review · ${stats.approved} approved`}
      >
        {can("create", "submittal") && (
          <Button variant="secondary" icon="upload" onClick={() => setShowBulkAdd(true)}>
            BULK ADD
          </Button>
        )}
        {can("create", "submittal") && (
          <Button variant="primary" icon="plus" onClick={() => setShowCreate(true)}>
            NEW SUBMITTAL
          </Button>
        )}
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"   value={stats.total}    color="var(--accent)"
          active={filterStatus === "all" && filterBIC === "all"}
          onClick={() => { setFilterStatus("all"); setFilterBIC("all"); }} />
        <KpiTile compact label="Pending" value={stats.pending}  color="var(--status-warning)"
          active={filterStatus === "__pending"}
          onClick={() => setFilterStatus("__pending")} />
        <KpiTile compact label="Approved" value={stats.approved} color="var(--status-success)"
          active={filterStatus === "__approved"}
          onClick={() => setFilterStatus("__approved")} />
        <KpiTile compact label="Rejected" value={stats.rejected} color="var(--status-error)"
          active={filterStatus === "__rejected"}
          onClick={() => setFilterStatus("__rejected")} />
        <KpiTile compact label="Overdue" value={stats.overdue} color="var(--status-error)" />
        <KpiTile compact label="At risk" value={reviewsAtRisk} color="var(--status-warning)" sub="forecast" />
      </div>

      <PhoenixPanel style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Filter bar */}
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--divider)", background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-low) 76%, #000 24%) 0%, color-mix(in srgb, var(--bg-surface) 96%, #000 4%) 100%)", alignItems: "center", backdropFilter: "blur(14px) saturate(145%)", WebkitBackdropFilter: "blur(14px) saturate(145%)" }}>
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
            style={{ margin: 0, marginRight: 4, cursor: filtered.length === 0 ? "not-allowed" : "pointer", accentColor: "var(--accent)" }}
          />
          <input
            className="sbd-input"
            placeholder="Search # / title / spec section"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, maxWidth: 360, padding: "8px 12px", fontSize: 12, borderRadius: 999 }}
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
          <SubmittalVirtualList
            filtered={filteredView}
            isLoading={isLoading}
            rows={rowsView}
            selectedId={selectedId}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            setSelectedId={setSelectedId}
            drawingSetsById={drawingSetsById}
          />

          {/* Detail panel */}
          <SubmittalDetail
            submittal={selectedView}
            allSubmittals={rowsView}
            drawingSets={drawingSetsView}
            rounds={selected ? (roundsBySubmittal[selected.id] || []) : []}
            sheetResponses={
              selected
                ? allSheetResponses.filter((r: any) =>
                    (roundsBySubmittal[selected.id] || []).some(
                      (rd: any) => rd.id === r.submittal_round_id,
                    ),
                  )
                : []
            }
            drawings={allDrawings}
            cycleStats={reviewForecast.stats}
            today={today}
            allRfis={allRfis}
            allTasks={allTasks}
            projectName={activeProject?.project_name || activeProject?.name || "Project"}
            project={activeProject}
            onClose={() => setSelectedId(null)}
            onEdit={() => selected && setEditingId(selected.id)}
            onDelete={() => selected && setToDelete(selected.id)}
            onStatusChange={(status) => {
              if (!selected || status === selected.status) return;
              const today = localToday();
              // Funnel real workflow moves through the audited round path so the
              // round log stays the submit→return CYCLE truth (§20): a SEND opens
              // (or advances) the open cycle, a VERDICT closes it — addSubmittalRound
              // updates the open round in place or opens the next cycle. Draft/Void
              // are plain status edits (no round). The round log sat empty because
              // inline status changes used to bypass this entirely.
              const isVerdict = [
                "Approved", "Approved as Noted", "Revise and Resubmit",
                "Rejected", "Released for Fabrication",
              ].includes(status);
              const isSent = status === "Submitted" || status === "Under Review";
              if (isVerdict || isSent) {
                advanceMut.mutate({
                  submittal: selected as any,
                  status,
                  ball_in_court: selected.ball_in_court ?? null,
                  submitted_date: isSent ? today : (selected.submitted_date ?? undefined),
                  returned_date: isVerdict ? today : undefined,
                });
              } else {
                updateMut.mutate({ id: selected.id, status });
              }
            }}
            onBICChange={(bic) => selected && updateMut.mutate({ id: selected.id, ball_in_court: bic })}
            // Verb CTA — advance via the audited write path: logs a round +
            // patches + auto-locks atomically. Stamps the submitted date when
            // sending out (→OFA) and the returned date when logging a return
            // (→BFA); never a fake date otherwise (§22).
            onAdvance={(action) => {
              if (!selected || !action.nextStatus) return;
              const today = localToday();
              // Stamp the submitted date on the FIRST outbound hop (or a
              // fresh resubmit after R&R) — multi-party routing chains pass
              // through OFA several times and must not re-stamp each hop.
              const isResubmit = ["Revise and Resubmit", "Rejected"].includes(selected.status);
              const stampSubmitted =
                action.nextStage === "OFA" && (isResubmit || !selected.submitted_date);
              advanceMut.mutate({
                submittal: selected as any,
                status: action.nextStatus,
                ball_in_court: action.nextBallInCourt,
                submitted_date: stampSubmitted ? today : undefined,
                returned_date: action.nextStage === "BFA" ? today : undefined,
                extraPatch:
                  action.chainStepIndex != null
                    ? { approval_chain_step: action.chainStepIndex }
                    : undefined,
              });
            }}
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
          initial={editingView || {}}
          projectId={projectId}
          projectName={activeProject?.project_name || activeProject?.name || ""}
          availableSets={drawingSetsView}
          allDrawings={allDrawings}
          allRfis={allRfis}
          existingNumbers={new Set(
            rows
              .filter((r: any) => r.id !== editing?.id)
              .map((r: any) => String(r.submittal_number || "").trim())
              .filter(Boolean),
          )}
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
          ...(can("edit", "submittal") ? [{
            label: "EDIT SELECTED",
            icon: "edit",
            onClick: () => setShowBulkEdit(true),
          }] : []),
          ...(can("delete", "submittal") ? [{
            label: "DELETE",
            icon: "x",
            variant: "danger",
            onClick: () => setShowBulkDelete(true),
          }] : []),
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
        onSubmit={(newRows) => bulkCreateMut.mutate(newRows)}
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
      {showNewRound && selected && (() => {
        // Carry the prior round's unresolved reviewer dispositions forward so
        // the resubmittal starts from exactly what must be addressed (§20) —
        // the open items seed an editable checklist into the round's notes and
        // render as a read-only "comments to address" panel. Derived from
        // submittal_sheet_responses (already round-scoped): no migration.
        const submittalRounds = roundsBySubmittal[selected.id] || [];
        const previousRound = submittalRounds.length > 0 ? submittalRounds.at(-1) : null;
        const carry = pickCarryForwardResponses(submittalRounds, allSheetResponses);
        const carryItems = collectOpenItems(carry.responses);
        const carryFromRound = carry.round?.round_number ?? null;
        const seededNotes = formatCarryForwardNotes(carryFromRound, carryItems);
        return (
          <NewRoundModal
            open={showNewRound}
            submittal={selected}
            previousRound={previousRound}
            carryItems={carryItems}
            carryFromRound={carryFromRound}
            seededNotes={seededNotes}
            onClose={() => setShowNewRound(false)}
            onSubmit={(data) => createRoundMut.mutate(data)}
          />
        );
      })()}

      {/* Fab-release gate override — a "Release for Fabrication" move blocked by
          open RFIs reopens here so a PM can release with a recorded reason. */}
      <ReleaseGateOverrideModal
        open={!!releaseBlock}
        blockingRfiNumbers={releaseBlock?.rfis || []}
        busy={advanceMut.isPending}
        onClose={() => setReleaseBlock(null)}
        onConfirm={(reason: string) =>
          releaseBlock && advanceMut.mutate({ ...releaseBlock.input, fabReleaseOverrideReason: reason })
        }
      />

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
