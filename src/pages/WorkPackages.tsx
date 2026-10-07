/**
 * WorkPackages - production control surface for fabrication, delivery,
 * and erection packages.
 *
 * This page owns data access and mutations. Presentation is organized
 * around real execution questions: what is ready, what is blocked, what
 * is slipping, and what needs a human update next.
 *
 * Truth alignment: rows are joined with the live Fab Release row and the
 * piece rollup for each package, so a package released as an exception no
 * longer reads "drawings not released", and a piece-driven package sits in
 * the phase its pieces put it in rather than the hand-typed column.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PauseCircle } from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { usePermissions } from "@/services/permissions";
import WorkflowFetchState from "@/components/shared/WorkflowFetchState";
import DeleteDialog from "@/components/shared/DeleteDialog";
import WorkPackageDetailModalRaw from "@/components/workpackages/WorkPackageDetailModal";
import WPFormModalRaw from "@/components/workpackages/WPFormModal";
import WPBulkAddModalRaw from "@/components/workpackages/WPBulkAddModal";
import { getNextNumber } from "@/components/shared/numberSequencing";
import { withProjectId } from "@/lib/mutations/standardMutation";
import { batchProcess } from "@/utils/batchProcess";
import { createPageUrl } from "@/utils";
import { fetchAllProjectRowsPaged } from "@/lib/pieceControl/pagedSelect";
import { BulkActionBar as BulkActionBarRaw } from "@/components/design-system";
import SequenceFilterRaw, { matchesSequenceFilter } from "@/components/shared/SequenceFilter";
import { exportWorkPackagesCSV } from "./workPackages/utils";
import { prepareBulkWorkPackageRows } from "./workPackages/creation";
import {
  buildWorkPackageMetrics,
  compareForRegisterSort,
  matchesFocusFilter,
  sortWorkPackagesForExecution,
} from "./workPackages/analytics";
import {
  indexReleasesByWorkPackage,
  isPieceDrivenPackage,
  summarizePiecesByWorkPackage,
  type CanonicalPieceRow,
  type ReleaseRow,
} from "./workPackages/canonical";
import {
  ExceptionPanel,
  PhaseFlowView,
  RegisterView,
  StatusBoardView,
  type RegisterSort,
} from "./workPackages/components";
import type { WorkPackage } from "./workPackages/types";
import WpControlCenter from "./workPackages/WpControlCenter";
import { reconcileSelection } from "./workPackages/wpControlCenter.derive";
import { calcWpProgress } from "@/utils/projectKpis";
import { loadWorkPackageEvidence, rejectIncompleteWorkPackageEvidence, workPackageEvidenceState } from "./workPackages/evidence";

// The design-system primitives and the workpackages
// modals/filter are still .jsx; their destructured `= []` prop defaults make
// TS infer `never[]` props. These boundary casts are removable once those
// shared/feature components are typed.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const BulkActionBar = BulkActionBarRaw as unknown as ComponentType<AnyProps>;
const SequenceFilter = SequenceFilterRaw as unknown as ComponentType<AnyProps>;
const WPBulkAddModal = WPBulkAddModalRaw as unknown as ComponentType<AnyProps>;
const WPFormModal = WPFormModalRaw as unknown as ComponentType<AnyProps>;
const WorkPackageDetailModal = WorkPackageDetailModalRaw as unknown as ComponentType<AnyProps>;

/** Sibling pages the drawer and rows link out to. */
export type WorkPackageNavTarget = "fab_release" | "piece_register" | "drawings" | "deliveries";

interface ProjectRow {
  id?: string;
  name?: string;
  on_hold?: boolean | null;
  health_status?: string | null;
  piece_control_mode?: string | null;
  scope_complete_pct_override?: number | null;
  [key: string]: unknown;
}

const EMPTY_EVIDENCE: never[] = [];
const workPackageCacheKeys = (projectId: string | null) => [["work-packages", projectId, "wp-evidence"], ["work-packages", projectId], ["work-packages"], ["wps-all"]];
type MutationScope = { sourceProjectId: string | null };
type FormMutationScope = MutationScope & { sourceDraft: WorkPackage | null };

export default function WorkPackages() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermissions();

  const [view, setView] = useState("flow");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [seqFilter, setSeqFilter] = useState<unknown>(null);
  const [registerSort, setRegisterSort] = useState<RegisterSort>({ key: null, direction: "asc" });
  const [editingWP, setEditingWP] = useState<WorkPackage | null>(null);
  const [wpModalOpen, setWPModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkPackage | null>(null);
  // The drawer holds an id, not a row snapshot, so a status change or a
  // realtime refetch is visible without closing and reopening it.
  const [detailWPId, setDetailWPId] = useState<string | null>(null);
  const [selectedWPs, setSelectedWPs] = useState<Set<string>>(new Set());
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [allocatingNumber, setAllocatingNumber] = useState(false);
  const uiRef = useRef({ projectId, editingWP, deleteTarget, selectedWPs });
  uiRef.current = { projectId, editingWP, deleteTarget, selectedWPs };

  useEffect(() => {
    setEditingWP(null);
    setWPModalOpen(false);
    setDetailWPId(null);
    setDeleteTarget(null);
    setBulkAddOpen(false);
    setSelectedWPs(new Set());
  }, [projectId]);

  const workPackagesQuery = useQuery({
    queryKey: ["work-packages", projectId, "wp-evidence"],
    queryFn: () => loadWorkPackageEvidence(entities.WorkPackage, projectId!),
    enabled: !!projectId,
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: projects = [] } = projectsQuery;

  const queryProject = (projects.find((p) => p.id === projectId) || null) as ProjectRow | null;
  const effectiveProjectId = queryProject?.id || null;

  const drawingsQuery = useQuery({
    queryKey: ["drawings", projectId, "wp-evidence"],
    queryFn: async () => {
      // Paged: the entity client caps a list at 2,000 rows, and a project
      // drawing log can pass that, which would silently blank readiness.
      if (projectId) {
        return fetchAllProjectRowsPaged<Record<string, unknown>>(supabase, "drawings", projectId, {
          orderBy: "sheet_number",
          onTruncated: rejectIncompleteWorkPackageEvidence,
          build: (query) => query.eq("is_deleted", false).is("deleted_at", null),
        });
      }
      return entities.Drawing.list();
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });

  const deliveriesQuery = useQuery({
    queryKey: ["deliveries-for-wps", projectId],
    queryFn: () => projectId
      ? loadWorkPackageEvidence(entities.Delivery, projectId)
      : [],
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });

  // What Fab Release recorded for each package (live rows only).
  const releasesQuery = useQuery({
    queryKey: ["wp-fab-releases", projectId],
    queryFn: () => projectId
      ? fetchAllProjectRowsPaged<ReleaseRow>(supabase, "fab_releases", projectId, {
        select: "id, project_id, work_package_id, status, is_exception, canonical_release, weight_tons, release_date, released_at, release_number, is_deleted",
        orderBy: "release_date",
        onTruncated: rejectIncompleteWorkPackageEvidence,
        build: (query) => query.eq("is_deleted", false).not("work_package_id", "is", null),
      })
      : [],
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });

  // Leaf-lot counts per package; only read when piece control is on.
  const piecesEnabled = !!projectId && !!queryProject && String(queryProject.piece_control_mode ?? "off") !== "off";
  const piecesQuery = useQuery({
    queryKey: ["wp-piece-counts", projectId],
    queryFn: () => projectId
      ? fetchAllProjectRowsPaged<CanonicalPieceRow>(supabase, "pieces", projectId, {
        select: "id, work_package_id, parent_piece_id, is_container, lifecycle_status, on_hold, is_deleted, deleted_at",
        onTruncated: rejectIncompleteWorkPackageEvidence,
        build: (query) => query.eq("is_deleted", false).is("deleted_at", null).not("work_package_id", "is", null),
      })
      : [],
    enabled: piecesEnabled,
    staleTime: 30 * 1000,
  });

  const evidenceSources = [
    { label: "Work packages", key: ["work-packages", projectId, "wp-evidence"], query: workPackagesQuery },
    { label: "Project configuration", key: ["projects"], query: projectsQuery },
    { label: "Drawings", key: ["drawings", projectId, "wp-evidence"], query: drawingsQuery },
    { label: "Deliveries", key: ["deliveries-for-wps", projectId], query: deliveriesQuery },
    { label: "Fabrication releases", key: ["wp-fab-releases", projectId], query: releasesQuery },
    ...(piecesEnabled ? [{ label: "Assigned pieces", key: ["wp-piece-counts", projectId], query: piecesQuery }] : []),
  ];
  const evidence = workPackageEvidenceState(evidenceSources);
  const evidenceReady = !!effectiveProjectId && evidence.complete && !evidence.refreshing;
  const evidenceRef = useRef({ projectId, ready: evidenceReady, keys: evidenceSources.map(source => source.key) });
  evidenceRef.current = { projectId, ready: evidenceReady, keys: evidenceSources.map(source => source.key) };
  // A queued callback must check the current evidence at the actual write,
  // including after a project switch or a refresh that began after selection.
  const assertEvidenceReady = useCallback((packageId?: string, manualStatus = false) => {
    // Read the cache too: invalidation can start before React paints its
    // disabled state, while an already queued event still holds this callback.
    const cacheReady = evidenceRef.current.keys.every(key => {
      const state = qc.getQueryState(key);
      return state?.status === "success" && state.fetchStatus === "idle";
    });
    const currentProject = qc.getQueryData<ProjectRow[]>(["projects"])?.find(project => project.id === projectId);
    const currentPieceQuery = qc.getQueryState(["wp-piece-counts", projectId]);
    const currentPiecesReady = String(currentProject?.piece_control_mode ?? "off") === "off"
      || (currentPieceQuery?.status === "success" && currentPieceQuery.fetchStatus === "idle");
    if (!evidenceRef.current.ready || evidenceRef.current.projectId !== projectId || !cacheReady || !currentProject || !currentPiecesReady) {
      throw new Error("Wait for complete work package evidence before changing this package.");
    }
    if (packageId) {
      const currentPackages = qc.getQueryData<WorkPackage[]>(["work-packages", projectId, "wp-evidence"]);
      if (!currentPackages?.some(wp => wp.id === packageId && wp.project_id === projectId)) {
        throw new Error("This package is no longer in the selected project. Reopen its current record.");
      }
      if (manualStatus) {
        const currentPieces = qc.getQueryData<CanonicalPieceRow[]>(["wp-piece-counts", projectId]);
        if (isPieceDrivenPackage(currentProject.piece_control_mode, summarizePiecesByWorkPackage(currentPieces).get(packageId))) {
          throw new Error("This package now follows its piece progress. Update the Piece Register instead.");
        }
      }
    }
  }, [projectId, qc]);

  const assertMutationScope = (sourceProjectId: string | null) => {
    if (!sourceProjectId || sourceProjectId !== evidenceRef.current.projectId) {
      throw new Error("The selected project changed. Reopen this package in its original project.");
    }
    assertEvidenceReady();
  };
  const ownsForm = ({ sourceProjectId, sourceDraft }: FormMutationScope) =>
    uiRef.current.projectId === sourceProjectId && uiRef.current.editingWP === sourceDraft;

  const candidate = {
    projectId, project: queryProject,
    workPackages: workPackagesQuery.data ?? [], drawings: drawingsQuery.data ?? [],
    deliveries: deliveriesQuery.data ?? [], releases: releasesQuery.data ?? [], pieces: piecesQuery.data ?? [],
  };
  const provenSnapshot = useRef<typeof candidate | null>(null);
  if (evidenceReady) provenSnapshot.current = candidate;
  // Do not mix newly refreshed sources with an older piece/release snapshot.
  // A project switch can never reuse another project's proven evidence.
  const snapshot = provenSnapshot.current?.projectId === projectId ? provenSnapshot.current : null;
  const selectedProject = snapshot?.project ?? null;
  const pieceControlMode = String(selectedProject?.piece_control_mode ?? "off");
  const workPackages = snapshot?.workPackages ?? EMPTY_EVIDENCE;
  const drawings = snapshot?.drawings ?? EMPTY_EVIDENCE;
  const projectDeliveries = snapshot?.deliveries ?? EMPTY_EVIDENCE;
  const fabReleases = snapshot?.releases ?? EMPTY_EVIDENCE;
  const pieces = snapshot?.pieces ?? EMPTY_EVIDENCE;

  const wpQueryKeys = workPackageCacheKeys(projectId);

  useRealtimeInvalidation("work_packages", projectId, wpQueryKeys);
  useRealtimeInvalidation("fab_releases", projectId, [["wp-fab-releases", projectId]]);
  useRealtimeInvalidation("pieces", piecesEnabled ? projectId : null, [["wp-piece-counts", projectId]]);

  const invalidateWps = (sourceProjectId: string | null) => {
    qc.invalidateQueries({ queryKey: ["work-packages", sourceProjectId] });
    qc.invalidateQueries({ queryKey: ["work-packages"], exact: true });
    qc.invalidateQueries({ queryKey: ["wps-all"] });
    // Fan out the full work_package family (incl. ["wps-fab", projectId] read by
    // FabRelease) so a WP mutation doesn't leave sibling pages stale.
    void invalidateEntity(qc, "work_package", sourceProjectId);
    // Piece assign UI reads WPs from the relationships snapshot — without these
    // keys, soft-deleted packages stay in the Target work package dropdown.
    void qc.invalidateQueries({ queryKey: ["piece-relationships", sourceProjectId] });
    void qc.invalidateQueries({ queryKey: ["piece-register", sourceProjectId] });
  };

  const updateWPMut = useMutation({
    mutationFn: ({ id, data, sourceProjectId }: { id: string; data: any } & FormMutationScope) => {
      assertMutationScope(sourceProjectId);
      const writesProgress = ["phase", "status", "percent_complete"].some(field => Object.prototype.hasOwnProperty.call(data ?? {}, field));
      assertEvidenceReady(id, writesProgress);
      return entities.WorkPackage.update(id, data);
    },
    onSuccess: async (updated, scope) => {
      const keys = workPackageCacheKeys(scope.sourceProjectId);
      replaceRecordInCaches(qc, keys, updated);
      invalidateWps(scope.sourceProjectId);
      if (ownsForm(scope)) { setWPModalOpen(false); setEditingWP(null); }
      toast.success("Work package updated");
      await invalidateCrudQueries(qc, keys);
    },
    onError: (err) => toastCrudError(err, "Failed to update work package"),
  });

  const createWPMut = useMutation({
    mutationFn: ({ data, sourceProjectId }: { data: any } & FormMutationScope) => {
      assertMutationScope(sourceProjectId);
      return entities.WorkPackage.create(withProjectId(data as Record<string, unknown>, sourceProjectId));
    },
    onSuccess: async (created, scope) => {
      const keys = workPackageCacheKeys(scope.sourceProjectId);
      appendRecordToCaches(qc, keys, created, ((record, key) => !key[1] || record.project_id === key[1]) as any);
      invalidateWps(scope.sourceProjectId);
      if (ownsForm(scope)) { setWPModalOpen(false); setEditingWP(null); }
      toast.success("Work package created");
      await invalidateCrudQueries(qc, keys);
    },
    onError: (err) => toastCrudError(err, "Failed to create work package"),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, sourceProjectId }: { id: string } & MutationScope) => {
      assertMutationScope(sourceProjectId);
      assertEvidenceReady(id);
      return entities.WorkPackage.delete(id);
    },
    onSuccess: (_, { id: deletedId, sourceProjectId }) => {
      removeRecordFromCaches(qc, workPackageCacheKeys(sourceProjectId), deletedId);
      invalidateWps(sourceProjectId);
      if (uiRef.current.projectId === sourceProjectId) {
        setDeleteTarget(current => current?.id === deletedId ? null : current);
        setDetailWPId((current) => (current === deletedId ? null : current));
      }
      toast.success("Work package deleted");
    },
    onError: (err) => toastCrudError(err, "Failed to delete work package"),
  });

  const bulkCreateMut = useMutation({
    mutationFn: async ({ rows, sourceProjectId }: { rows: any[] } & MutationScope) => {
      assertMutationScope(sourceProjectId);
      const prepared = await prepareBulkWorkPackageRows(rows, sourceProjectId, getNextNumber);
      return batchProcess(prepared, async (data) => {
        assertMutationScope(sourceProjectId);
        return entities.WorkPackage.create(data);
      }, 5);
    },
    onSuccess: (results, { sourceProjectId }) => {
      invalidateWps(sourceProjectId);
      const ok = results.succeeded.length;
      const fail = results.failed.length;
      if (fail === 0) {
        toast.success(`Added ${ok} work package${ok === 1 ? "" : "s"}`);
        if (uiRef.current.projectId === sourceProjectId) setBulkAddOpen(false);
      } else if (ok === 0) {
        toast.error(`All ${fail} failed: ${results.failed[0]?.error || "unknown error"}`);
      } else {
        toast.warning(`${ok} added, ${fail} failed`);
        if (uiRef.current.projectId === sourceProjectId) setBulkAddOpen(false);
      }
    },
    onError: (err) => toastCrudError(err, "Bulk create failed"),
  });

  const bulkStatusMut = useMutation({
    mutationFn: async ({ ids, status, sourceProjectId }: { ids: string[]; status: string; sourceSelection: Set<string> } & MutationScope) => {
      const results = await batchProcess(ids, async (id) => {
        assertMutationScope(sourceProjectId);
        assertEvidenceReady(id, true);
        return entities.WorkPackage.update(id, { status });
      });
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: (results, { sourceProjectId, sourceSelection }) => {
      invalidateWps(sourceProjectId);
      if (uiRef.current.projectId === sourceProjectId && uiRef.current.selectedWPs === sourceSelection) setSelectedWPs(new Set());
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("Status updated");
      }
    },
    onError: (err) => toastCrudError(err, "Bulk update failed"),
  });

  // Single-row status change from the drawer (hold / resume / complete).
  const quickStatusMut = useMutation({
    mutationFn: ({ id, status, sourceProjectId }: { id: string; status: string } & MutationScope) => {
      assertMutationScope(sourceProjectId);
      assertEvidenceReady(id, true);
      return entities.WorkPackage.update(id, { status });
    },
    onSuccess: async (updated, { status, sourceProjectId }) => {
      const keys = workPackageCacheKeys(sourceProjectId);
      replaceRecordInCaches(qc, keys, updated);
      invalidateWps(sourceProjectId);
      toast.success(`Marked ${status}`);
      await invalidateCrudQueries(qc, keys);
    },
    onError: (err) => toastCrudError(err, "Failed to update status"),
  });

  const releasesByWp = useMemo(() => indexReleasesByWorkPackage(fabReleases), [fabReleases]);
  const piecesByWp = useMemo(() => summarizePiecesByWorkPackage(pieces), [pieces]);

  const metrics = useMemo(
    () => buildWorkPackageMetrics(workPackages, drawings, projectDeliveries, { releasesByWp, piecesByWp, pieceControlMode }),
    [workPackages, drawings, projectDeliveries, releasesByWp, piecesByWp, pieceControlMode]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = metrics.enriched
      .filter((wp) => {
        if (phaseFilter !== "all" && wp._signals.phase !== phaseFilter) return false;
        if (statusFilter !== "all" && wp._signals.status !== statusFilter) return false;
        if (!matchesFocusFilter(wp, riskFilter, metrics)) return false;
        if (!matchesSequenceFilter(wp, seqFilter)) return false;
        if (!q) return true;
        return [
          wp.wp_number,
          wp.name,
          wp.project_name,
          wp.crew,
          wp.area,
          wp.sequence_number,
          wp.trade_phase,
          wp.shipping_phase,
          wp.install_phase,
          wp.phase,
          wp.status,
          wp.notes,
          wp._signals.release?.releaseNumber,
        ].some((value) => String(value || "").toLowerCase().includes(q));
      });
    if (view === "register" && registerSort.key) {
      return rows.sort((a, b) => compareForRegisterSort(a, b, registerSort.key, registerSort.direction));
    }
    return rows.sort(sortWorkPackagesForExecution);
  }, [metrics, phaseFilter, statusFilter, riskFilter, seqFilter, search, view, registerSort]);

  const selectedRows = useMemo(
    () => filtered.filter((wp) => selectedWPs.has(wp.id)),
    [filtered, selectedWPs]
  );
  // Piece-driven packages get status from the piece rollup; a bulk "Set
  // Complete" there is silently reverted by the next piece event.
  const pieceDrivenSelected = useMemo(
    () => selectedRows.filter((wp) => wp._signals.pieceDriven),
    [selectedRows]
  );
  const manualSelectedIds = useMemo(
    () => selectedRows.filter((wp) => !wp._signals.pieceDriven).map((wp) => wp.id as string),
    [selectedRows]
  );

  useEffect(() => {
    setSelectedWPs((previous) => {
      const next = reconcileSelection(previous, filtered.map((wp) => wp.id));
      return next.size === previous.size ? previous : next;
    });
  }, [filtered]);

  // Inbound deep link: `?id=<uuid>` (Alerts Center, Fab Release) or
  // `?wp=WP-014` (typed / shared). Opens the drawer once rows are loaded,
  // then strips the param so closing the drawer sticks.
  useEffect(() => {
    if (!evidenceReady) return;
    const idParam = searchParams.get("id")?.trim();
    const numberParam = searchParams.get("wp")?.trim();
    if (!idParam && !numberParam) return;
    // Rows are gated on the project list; do not judge "not found" (and drop
    // the param) before the project record has arrived.
    if (projectId && !selectedProject) return;
    const match = workPackages.find((wp) =>
      (idParam && wp.id === idParam) ||
      (numberParam && String(wp.wp_number || "").trim().toLowerCase() === numberParam.toLowerCase())
    );
    if (match) {
      setDetailWPId(match.id);
    } else if (snapshot) {
      toast.error(`Work package ${idParam || numberParam} was not found in this project.`);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("id");
    next.delete("wp");
    setSearchParams(next, { replace: true });
  }, [evidenceReady, workPackages, snapshot, projectId, selectedProject, searchParams, setSearchParams]);

  const detailWP = useMemo(
    () => (detailWPId ? metrics.enriched.find((wp) => wp.id === detailWPId) || null : null),
    [detailWPId, metrics.enriched]
  );

  const projectName = selectedProject?.name || (projectId ? "No active project" : "All Projects");

  // Project-level context for the canonical execution shell.
  const projectHealth = selectedProject?.health_status ?? null;
  const percentComplete =
    selectedProject?.scope_complete_pct_override != null
      ? Number(selectedProject.scope_complete_pct_override)
      : (workPackages.length ? calcWpProgress(workPackages).pct : null);

  const toggleSelect = (id: string) =>
    setSelectedWPs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleWPEdit = (wp: WorkPackage) => {
    setEditingWP(wp);
    setWPModalOpen(true);
  };

  const handleWPCreate = useCallback(async () => {
    if (allocatingNumber || !evidenceReady) return;
    setAllocatingNumber(true);
    let wpNumber = "";
    try {
      if (effectiveProjectId) {
        const n = await getNextNumber(effectiveProjectId, "wp_number");
        wpNumber = `WP-${String(n).padStart(3, "0")}`;
        assertEvidenceReady();
      } else {
        throw new Error("No active project selected");
      }
    } catch (err) {
      console.warn("[WorkPackages] getNextNumber failed:", err?.message);
      toast.error("Unable to reserve a work package number. Please retry.");
      return;
    } finally {
      setAllocatingNumber(false);
    }
    setEditingWP({ wp_number: wpNumber, project_id: effectiveProjectId ?? undefined });
    setWPModalOpen(true);
  }, [allocatingNumber, effectiveProjectId, evidenceReady, assertEvidenceReady]);

  useAutoOpenCreate(handleWPCreate, { enabled: evidenceReady && can("create", "work_package") });

  /** Outbound links carry the project so the sibling page lands scoped. */
  const navigateFromWp = useCallback((target: WorkPackageNavTarget, wp: WorkPackage) => {
    const params = new URLSearchParams();
    if (wp.project_id) params.set("project", String(wp.project_id));
    let page = "";
    switch (target) {
      case "fab_release":
        page = "FabRelease";
        params.set("view", "register");
        if (wp.wp_number) params.set("search", String(wp.wp_number));
        break;
      case "piece_register":
        page = "PieceRegister";
        if (wp.id) params.set("wp", String(wp.id));
        break;
      case "drawings":
        page = "Drawings";
        break;
      case "deliveries":
        page = "Deliveries";
        if (wp.wp_number) params.set("wp", String(wp.wp_number));
        break;
      default:
        return;
    }
    navigate(`${createPageUrl(page)}?${params.toString()}`);
  }, [navigate]);

  const handleRegisterSort = (key: string) =>
    setRegisterSort((current) =>
      current.key === key
        ? (current.direction === "asc" ? { key, direction: "desc" } : { key: null, direction: "asc" })
        : { key, direction: "asc" }
    );

  if (!projectId) {
    return <section className="sb-dashboard-reference-page" style={{ padding: 24 }}>
      <h1>Work Packages</h1><h2>Select a project</h2>
      <p>Choose a project to review its package, drawing, release and piece evidence.</p>
    </section>;
  }

  if (evidence.failed.length > 0 || !snapshot || (evidence.complete && !effectiveProjectId)) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 24 }}>
        <WorkflowFetchState label="Work package evidence" error={evidence.failed.length > 0 || (evidence.complete && !effectiveProjectId)}
          onRetry={() => evidenceSources.forEach(source => { void source.query.refetch(); })} />
        <p style={{ color: "var(--text-secondary)" }}>
          {evidence.failed.length ? `Unavailable: ${evidence.failed.join(", ")}.` : evidence.pending.length ? `Waiting for: ${evidence.pending.join(", ")}.` : "Waiting for a complete project snapshot."}
          {" "}Package readiness and transitions require complete evidence.
          {evidence.complete && !effectiveProjectId && " The selected project is unavailable; select an accessible project."}
        </p>
      </div>
    );
  }

  const isSaving = createWPMut.isPending || updateWPMut.isPending || !evidenceReady;
  const canCreate = evidenceReady && can("create", "work_package") && !allocatingNumber;
  const canEdit = can("edit", "work_package");
  const canDelete = can("delete", "work_package");

  const projectBanner = (evidence.refreshing || selectedProject?.on_hold || (metrics.phaseMismatches?.length ?? 0) > 0) ? (
    <div style={{ display: "grid", gap: 8, padding: "0 24px" }}>
      {evidence.refreshing && <p role="status" style={{ color: "var(--text-secondary)" }}>
        Refreshing work package evidence. Showing the last loaded records; package transitions are paused.
      </p>}
      {selectedProject?.on_hold && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--warning-border)",
            background: "var(--warning-muted)",
            color: "var(--status-warning)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <PauseCircle size={16} />
          <span>{projectName} is on hold. Package status updates and releases here should wait for the hold to lift.</span>
        </div>
      )}
      {(metrics.phaseMismatches?.length ?? 0) > 0 && (
        <div
          role="status"
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid var(--info-border)",
            background: "var(--info-muted)",
            color: "var(--status-info)",
            fontSize: 12,
          }}
        >
          {metrics.phaseMismatches!.length} package{metrics.phaseMismatches!.length === 1 ? "" : "s"} show a phase derived from piece status
          (marked *) that differs from the stored phase. The next piece event rewrites the stored value.
        </div>
      )}
    </div>
  ) : null;

  const wpModals = (
    <>
      <WPBulkAddModal
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        onCommit={(rows: unknown[]) => bulkCreateMut.mutate({ rows, sourceProjectId: projectId })}
        projectId={effectiveProjectId}
        projectName={projectName}
        existingWPs={workPackages}
        isSaving={bulkCreateMut.isPending || !evidenceReady}
      />

      {(wpModalOpen || editingWP) && (
        <WPFormModal
          key={editingWP?.id || editingWP?.wp_number || "new"}
          open={wpModalOpen || !!editingWP}
          onClose={() => { setWPModalOpen(false); setEditingWP(null); }}
          onSave={(data: unknown) => {
            const scope = { sourceProjectId: projectId, sourceDraft: editingWP };
            if (editingWP?.id) updateWPMut.mutate({ id: editingWP.id, data, ...scope });
            else createWPMut.mutate({ data, ...scope });
          }}
          wp={editingWP}
          pieceDrivenEvidence={editingWP?.id ? metrics.enriched.find((wp: (typeof metrics.enriched)[number] & Pick<WorkPackage, "id">) => wp.id === editingWP.id)?._signals.pieceDriven : false}
          projects={projects}
          nextNumber={editingWP?.wp_number || ""}
          allDrawings={drawings}
          defaultProjectId={effectiveProjectId || ""}
          isSaving={isSaving}
        />
      )}

      {detailWP && (
        <WorkPackageDetailModal
          wp={detailWP}
          drawings={drawings}
          onClose={() => setDetailWPId(null)}
          onEdit={canEdit ? (wp: WorkPackage) => { setDetailWPId(null); handleWPEdit(wp); } : null}
          onDelete={canDelete ? (wp: WorkPackage) => setDeleteTarget(wp) : null}
          onSetStatus={canEdit && !detailWP._signals.pieceDriven
            ? (wp: WorkPackage, status: string) => { if (wp.id) quickStatusMut.mutate({ id: wp.id, status, sourceProjectId: projectId }); }
            : null}
          statusPending={quickStatusMut.isPending}
          evidencePending={!evidenceReady}
          assertEvidenceReady={assertEvidenceReady}
          onNavigate={navigateFromWp}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => {
          if (uiRef.current.projectId === projectId) setDeleteTarget(current => current === deleteTarget ? null : current);
        }}
        onConfirm={() => { if (deleteTarget?.id) return deleteMut.mutateAsync({ id: deleteTarget.id, sourceProjectId: projectId }); }}
        title="Delete Work Package"
        description={`Delete "${deleteTarget?.name}" (${deleteTarget?.wp_number})? Assigned pieces are unassigned. This cannot be undone.`}
      />
    </>
  );

  const runBulkStatus = (status: string) => {
    if (manualSelectedIds.length === 0) {
      toast.info("Selected packages take status from their pieces. Advance them in Piece Control.");
      return;
    }
    if (pieceDrivenSelected.length > 0) {
      toast.info(`${pieceDrivenSelected.length} piece-driven package${pieceDrivenSelected.length === 1 ? "" : "s"} skipped; status comes from pieces.`);
    }
    bulkStatusMut.mutate({ ids: manualSelectedIds, status, sourceProjectId: projectId, sourceSelection: selectedWPs });
  };

  const bulkActions = (
    <BulkActionBar
      count={selectedWPs.size}
      onClear={() => setSelectedWPs(new Set())}
      actions={[
        ...(canEdit ? [
          {
            label: manualSelectedIds.length < selectedRows.length ? `SET COMPLETE (${manualSelectedIds.length})` : "SET COMPLETE",
            icon: "check",
            onClick: () => runBulkStatus("Complete"),
            disabled: !evidenceReady || bulkStatusMut.isPending || selectedWPs.size === 0,
          },
          {
            label: manualSelectedIds.length < selectedRows.length ? `SET IN PROGRESS (${manualSelectedIds.length})` : "SET IN PROGRESS",
            icon: "arrow",
            onClick: () => runBulkStatus("In Progress"),
            disabled: !evidenceReady || bulkStatusMut.isPending || selectedWPs.size === 0,
          },
          {
            label: "SET ON HOLD",
            icon: "pause",
            onClick: () => runBulkStatus("On Hold"),
            disabled: !evidenceReady || bulkStatusMut.isPending || selectedWPs.size === 0,
          },
        ] : []),
        {
          label: "EXPORT",
          icon: "download",
          onClick: () => exportWorkPackagesCSV(selectedRows),
          disabled: selectedRows.length === 0,
        },
      ]}
    />
  );

  return (
    <WpControlCenter
      projectName={projectName}
      workPackages={workPackages as unknown as Parameters<typeof WpControlCenter>[0]["workPackages"]}
      filtered={filtered as unknown as Parameters<typeof WpControlCenter>[0]["filtered"]}
      metrics={metrics as unknown as Parameters<typeof WpControlCenter>[0]["metrics"]}
      view={view}
      onViewChange={setView}
      search={search}
      onSearch={setSearch}
      phaseFilter={phaseFilter}
      onPhaseFilter={setPhaseFilter}
      statusFilter={statusFilter}
      onStatusFilter={setStatusFilter}
      riskFilter={riskFilter}
      onRiskFilter={setRiskFilter}
      onClearFilters={() => {
        setSearch("");
        setPhaseFilter("all");
        setStatusFilter("all");
        setRiskFilter("all");
        setSeqFilter(null);
      }}
      filteredCount={filtered.length}
      totalCount={metrics.totalCount}
      onOpenWp={(wp) => setDetailWPId(wp.id)}
      onExport={() => exportWorkPackagesCSV(filtered)}
      onBulkAdd={() => setBulkAddOpen(true)}
      onCreate={canCreate ? handleWPCreate : null}
      canCreate={canCreate}
      selectedIds={selectedWPs}
      onToggleSelect={toggleSelect}
      onToggleAll={(checked) =>
        setSelectedWPs(checked ? new Set(filtered.map((w) => w.id)) : new Set())
      }
      projectHealth={projectHealth}
      percentComplete={percentComplete}
      banner={projectBanner}
      sequenceFilter={<SequenceFilter items={workPackages} value={seqFilter} onChange={setSeqFilter} />}
      exceptionPanel={
        <ExceptionPanel
          metrics={metrics}
          onRiskFilter={setRiskFilter}
          onStatusFilter={setStatusFilter}
          onOpen={(wp) => setDetailWPId(wp.id ?? null)}
        />
      }
      bulkActions={bulkActions}
      modals={wpModals}
    >
      <main style={{ minWidth: 0 }}>
        {view === "flow" && (
          <PhaseFlowView
            rows={filtered}
            phaseRollup={metrics.phaseRollup}
            onOpen={(wp) => setDetailWPId(wp.id ?? null)}
            onEdit={canEdit ? handleWPEdit : null}
            onDelete={canDelete ? setDeleteTarget : null}
            selectedWPs={selectedWPs}
            onToggleSelect={toggleSelect}
          />
        )}

        {view === "board" && (
          <StatusBoardView
            rows={filtered}
            onOpen={(wp) => setDetailWPId(wp.id ?? null)}
            onEdit={canEdit ? handleWPEdit : null}
            onDelete={canDelete ? setDeleteTarget : null}
            selectedWPs={selectedWPs}
            onToggleSelect={toggleSelect}
          />
        )}

        {view === "register" && (
          <RegisterView
            rows={filtered}
            selectedWPs={selectedWPs}
            onToggleSelect={toggleSelect}
            onOpen={(wp) => setDetailWPId(wp.id ?? null)}
            onEdit={canEdit ? handleWPEdit : null}
            onDelete={canDelete ? setDeleteTarget : null}
            sort={registerSort}
            onSort={handleRegisterSort}
          />
        )}
      </main>
    </WpControlCenter>
  );
}
