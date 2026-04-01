import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AlertTriangle, RefreshCw, Plus, Upload } from "lucide-react";
import DeleteDialog from "../components/shared/DeleteDialog";
import DrawingFormModal from "../components/drawings/DrawingFormModal";
import DrawingSetUploadModal from "../components/drawings/DrawingSetUploadModal";
import RevisionUploadModal from "../components/drawings/RevisionUploadModal";
import RevisionHistoryPanel from "../components/drawings/RevisionHistoryPanel";
import DrawingKanban from "../components/drawings/DrawingKanban";
import BulkActionBar from "../components/drawings/BulkActionBar";
import SetApprovalModal from "../components/drawings/SetApprovalModal";
import {
  ChartsView,
  DrawingRow,
  DrawingSetGroup,
  DrawingSetTrackerPanel,
  ScheduleView,
  ThumbnailGrid,
} from "../components/drawings/SubmittalsSections";
import {
  STAGES,
  GRID,
  UNASSIGNED_KEY,
  monoFont,
  displayFont,
  bodyFont,
  VIEW_OPTIONS,
  btnPrimary,
  btnSecondary,
  compactSelect,
  compactHeaderBtn,
  normalizeSetKey,
  getDrawingSetName,
  generateThumbnail,
  getStageTone,
  getNextStage,
  incrementRevisionLabel,
  buildDrawingPayload,
  getDaysUntil,
  isOverdueDrawingLocal,
} from "../components/drawings/submittalsUtils";
import {
  persistAssignment,
} from "../components/drawings/submittalsAssignments";
import {
  bulkUpdateDrawings,
  ensureDrawingSetRecord,
  persistDrawingSetAssignment,
  runDrawingMutations,
} from "../components/drawings/submittalsMutations";
import { useSubmittalsData } from "../components/drawings/useSubmittalsData";
import { useSubmittalsDerived } from "../components/drawings/useSubmittalsDerived";
import { formatDate } from "../components/shared/formatters";
import { useProjectContext } from "../components/shared/useProjectContext";
import { toast } from "sonner";

export default function Submittals() {
  const { activeProject } = useProjectContext();
  const navigate = useNavigate();
  const pendingSetAssignmentsRef = useRef(new Map());
  const {
    drawings,
    setDrawings,
    drawingSets,
    setDrawingSets,
    projects,
    loading,
    loadDrawings,
  } = useSubmittalsData({ activeProject, pendingSetAssignmentsRef });
  const [search, setSearch] = useState("");
  const [discFilter, setDiscFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [view, setView] = useState("TABLE");
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadSetOpen, setUploadSetOpen] = useState(false);
  const [revisionUploadOpen, setRevisionUploadOpen] = useState(false);
  const [revisionPreselectedSet, setRevisionPreselectedSet] = useState(null);
  const [historyPanel, setHistoryPanel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [collapsedSets, setCollapsedSets] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastCheckedIdx, setLastCheckedIdx] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [approvalModal, setApprovalModal] = useState(null);
  const [savingApproval, setSavingApproval] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [sortByDue, setSortByDue] = useState(false);
  const [overdueAlertDismissed, setOverdueAlertDismissed] = useState(false);
  const [activeSetFilter, setActiveSetFilter] = useState(null);
  const [sortMode, setSortMode] = useState("SET NAME");

  useEffect(() => {
    loadDrawings();
    setSelectedIds(new Set());
    setActiveSetFilter(null);
  }, [activeProject?.id]);

  useEffect(() => {
    if (!drawings.length) return undefined;
    const createDrawingAlerts = async () => {
      try {
        const existing = await base44.entities.Alert.filter({ alert_type: "Drawing_Due" });
        const existingIds = new Set(existing.map((alert) => alert.related_record_id));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in3 = new Date(today.getTime() + 3 * 86400000);
        for (const drawing of drawings) {
          if (drawing.stage === "Released") continue;
          if (drawing.is_superseded) continue;
          if (!drawing.due_date) continue;
          const due = new Date(drawing.due_date);
          due.setHours(0, 0, 0, 0);
          const isOD = due < today;
          const soon = !isOD && due <= in3;
          if (!isOD && !soon) continue;
          if (existingIds.has(drawing.id)) continue;
          const daysLate = isOD ? Math.floor((today - due) / 86400000) : 0;
          await base44.entities.Alert.create({
            alert_type: "Drawing_Due",
            severity: isOD && daysLate >= 7 ? "Critical" : isOD ? "High" : "Medium",
            title: isOD ? `${drawing.sheet_number} OVERDUE ${daysLate}d` : `${drawing.sheet_number} due in <=3 days`,
            message: `${drawing.sheet_number}: "${drawing.title}" · Set: ${drawing.drawing_set_name || "Unassigned"} · Stage: ${drawing.stage} · ${isOD ? `Was due ${drawing.due_date}` : `Due ${drawing.due_date}`}`,
            related_entity: "Drawing",
            related_record_id: drawing.id,
            project_id: drawing.project_id,
            project_name: activeProject?.name || "",
            is_read: false,
            is_dismissed: false,
          });
        }
      } catch (error) {
        console.warn("Drawing alert error:", error);
      }
    };
    const timer = setTimeout(createDrawingAlerts, 3000);
    return () => clearTimeout(timer);
  }, [drawings.length, activeProject?.name]);

  const openAnnotations = (drawing) => {
    navigate(createPageUrl(`DrawingViewer?drawingId=${drawing.id}&from=Submittals`));
  };

  const openNewRevision = (drawingSet, setKey) => {
    if (drawingSet) {
      setRevisionPreselectedSet(drawingSet);
    } else if (setKey && setKey !== UNASSIGNED_KEY) {
      const targetSetKey = normalizeSetKey(setKey);
      const sheetsInSet = drawings.filter((drawing) => normalizeSetKey(getDrawingSetName(drawing, drawingSets)) === targetSetKey && !drawing.is_superseded);
      const sample = sheetsInSet[0];
      setRevisionPreselectedSet({
        id: null,
        set_name: setKey,
        current_revision: sample?.revision_number != null ? String(sample.revision_number) : "-",
        current_issue_date: sample?.issue_date || null,
        current_issued_by: sample?.issued_by || "",
        current_file_url: sample?.file_url || null,
        sheet_count: sheetsInSet.length,
        revision_history: "[]",
      });
    } else {
      setRevisionPreselectedSet(null);
    }
    setRevisionUploadOpen(true);
  };

  const nextId = `DWG-${String((drawings.length || 0) + 1).padStart(3, "0")}`;

  const handleSave = async (drawing) => {
    try {
      const payload = buildDrawingPayload(drawing, activeProject, nextId);
      const pendingSetName = String(payload.drawing_set_name || "").trim();
      if (editing) {
        const updated = await base44.entities.Drawing.update(editing.id, payload);
          if (pendingSetName) pendingSetAssignmentsRef.current.set(editing.id, pendingSetName);
          if (pendingSetName) persistAssignment(activeProject?.id, { ...editing, ...updated, ...payload }, pendingSetName);
          setDrawings((prev) => prev.map((item) => item.id === editing.id ? { ...item, ...updated, ...payload } : item));
          if (pendingSetName) {
            await persistDrawingSetAssignment({
              setName: pendingSetName,
              sourceDrawing: { ...editing, ...payload },
              drawingIds: editing.id,
              activeProject,
            });
          }
        } else {
          const created = await base44.entities.Drawing.create({ ...payload, drawing_id: nextId });
          if (pendingSetName && created?.id) pendingSetAssignmentsRef.current.set(created.id, pendingSetName);
          if (pendingSetName && created?.id) persistAssignment(activeProject?.id, { ...created, ...payload }, pendingSetName);
          setDrawings((prev) => [created, ...prev]);
          if (pendingSetName && created?.id) {
            await persistDrawingSetAssignment({
              setName: pendingSetName,
              sourceDrawing: { ...created, ...payload },
              drawingIds: created.id,
              activeProject,
            });
          }
        }
        if (pendingSetName && !drawingSets.some((set) => normalizeSetKey(set?.set_name) === normalizeSetKey(pendingSetName))) {
          await ensureDrawingSetRecord({
            setName: pendingSetName,
            sourceDrawing: payload,
            drawingSets,
            setDrawingSets,
            activeProject,
          });
        }
      setModalOpen(false);
      setEditing(null);
      toast.success(editing ? "Drawing updated" : "Drawing created");
      await loadDrawings();
    } catch (error) {
      toast.error(error?.message || "Failed to save drawing");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await base44.entities.Drawing.delete(deleteTarget.id);
      setDeleteTarget(null);
      toast.success("Drawing deleted");
      loadDrawings();
    } catch (error) {
      toast.error(error?.message || "Failed to delete drawing");
    }
  };

  const advanceStage = async (drawing, event) => {
    if (event) event.stopPropagation();
    const idx = STAGES.indexOf(drawing.stage);
    if (idx < STAGES.length - 1) {
      const newStage = STAGES[idx + 1];
      const data = { stage: newStage };
      if (newStage === "BFA" || newStage === "BFS") data.revision_number = incrementRevisionLabel(drawing.revision_number);
      await base44.entities.Drawing.update(drawing.id, data);
      loadDrawings();
    }
  };

  const daysUntilDue = (drawing) => getDaysUntil(drawing.due_date);
  const isOverdueDrawing = (drawing) => isOverdueDrawingLocal(drawing);

  const derived = useSubmittalsDerived({
    drawings,
    drawingSets,
    search,
    discFilter,
    stageFilter,
    showSuperseded,
    activeSetFilter,
    sortMode,
    sortByDue,
    isOverdueDrawing,
  });

  const {
    resolvedDrawings,
    activeResolvedDrawings,
    setMeta,
    unassignedDrawings,
    filtered,
    displayDrawings,
    drawingsBySet,
    setKeys,
    allFilteredArr,
    trackerSetKeys,
  } = derived;

  /*
  const legacySetMeta = useMemo(() => {
    const groups = {};
    activeResolvedDrawings.forEach((drawing) => {
      const setName = drawing.resolved_set_name;
      if (!setName || setName === UNASSIGNED_KEY) return;
      if (!groups[setName]) groups[setName] = [];
      groups[setName].push(drawing);
    });

    const meta = {};
    Object.entries(groups).forEach(([setName, sheets]) => {
      const sorted = [...sheets].sort(compareSheetNumbers);
      const submitted = sorted.map((d) => d.submitted_date).filter(Boolean).sort()[0] || null;
      const returned = sorted.map((d) => d.return_date).filter(Boolean).sort().reverse()[0] || null;
      const due = sorted.map((d) => d.due_date).filter(Boolean).sort()[0] || null;
      const stageCount = {};
      STAGES.forEach((stage) => {
        stageCount[stage] = sorted.filter((d) => (d.stage || "Not Started") === stage).length;
      });
      const setRecord = drawingSets.find((set) => normalizeSetKey(set.set_name) === normalizeSetKey(setName)) || null;
      const dueDays = due ? getDaysUntil(due) : null;
      meta[setName] = {
        setName,
        sheets: sorted,
        submitted,
        returned,
        due,
        dueIn7: dueDays !== null && dueDays >= 0 && dueDays <= 7,
        stageCount,
        approvalStatus: sorted.every((d) => d.stage === "Released")
          ? "approved"
          : sorted.some((d) => d.set_approval_status === "rejected")
            ? "rejected"
            : sorted.some((d) => ["OFA", "OFS"].includes(d.stage))
              ? "pending"
              : getSetApprovalStatus(sorted),
        revision: sorted[0]?.revision_number ?? "—",
        isOverdue: sorted.some((d) => isOverdueDrawing(d)),
        allReleased: sorted.every((d) => d.stage === "Released"),
        discipline: getSetDiscipline(sorted) || "",
        mostAdvancedStage: getMostAdvancedStage(sorted),
        setRecord,
        fileUrl: setRecord?.current_file_url || sorted[0]?.file_url || null,
      };
    });
    return meta;
  }, [activeResolvedDrawings, drawingSets]);

  const legacyOrderedSetKeys = useMemo(
    () =>
      Object.keys(setMeta).sort((a, b) => {
        const aMeta = setMeta[a];
        const bMeta = setMeta[b];
        if (aMeta?.isOverdue && !bMeta?.isOverdue) return -1;
        if (!aMeta?.isOverdue && bMeta?.isOverdue) return 1;
        return compareSetNames(a, b);
      }),
    [setMeta]
  );

  const legacyUnassignedDrawings = useMemo(
    () => activeResolvedDrawings.filter((drawing) => drawing.resolved_set_name === UNASSIGNED_KEY).sort(compareSheetNumbers),
    [activeResolvedDrawings]
  );

  const legacyFiltered = resolvedDrawings.filter((drawing) => {
    const term = search.toLowerCase().trim();
    const setName = drawing.resolved_set_name;
    const matchSearch =
      !term ||
      drawing.sheet_number?.toLowerCase().includes(term) ||
      drawing.title?.toLowerCase().includes(term) ||
      drawing.discipline?.toLowerCase().includes(term) ||
      String(setName || "").toLowerCase().includes(term);
    const matchStage = stageFilter === "all" || drawing.stage === stageFilter;
    const matchDisc = discFilter === "all" || drawing.discipline === discFilter;
    const matchSuperseded = showSuperseded || !drawing.is_superseded;
    const matchSet = !activeSetFilter || setName === activeSetFilter;
    return matchSearch && matchStage && matchDisc && matchSuperseded && matchSet;
  });

  const legacyDisplayDrawings = [...legacyFiltered].sort((a, b) => {
    if (sortMode === "DUE DATE" || sortByDue) {
      const da = a.due_date ? new Date(a.due_date) : new Date("9999-12-31");
      const db = b.due_date ? new Date(b.due_date) : new Date("9999-12-31");
      return da - db || compareSheetNumbers(a, b);
    }
    if (sortMode === "STAGE") {
      return STAGES.indexOf(a.stage || "Not Started") - STAGES.indexOf(b.stage || "Not Started") || compareSheetNumbers(a, b);
    }
    const setCompare = compareSetNames(a.resolved_set_name || "", b.resolved_set_name || "");
    return setCompare || compareSheetNumbers(a, b);
  });

  const legacyDrawingsBySet = legacyDisplayDrawings.reduce((acc, drawing) => {
    const key = drawing.resolved_set_name;
    if (key === UNASSIGNED_KEY) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(drawing);
    return acc;
  }, {});

  const legacySetKeys = Object.keys(legacyDrawingsBySet).sort((a, b) => {
    const aMeta = setMeta[a];
    const bMeta = setMeta[b];
    if (aMeta?.isOverdue && !bMeta?.isOverdue) return -1;
    if (!aMeta?.isOverdue && bMeta?.isOverdue) return 1;
    return compareSetNames(a, b);
  });
  const legacyAllFilteredArr = legacySetKeys.flatMap((key) => [...(legacyDrawingsBySet[key] || [])].sort(compareSheetNumbers)).concat(activeSetFilter === UNASSIGNED_KEY ? legacyUnassignedDrawings : []);
  const legacyTrackerSetKeys = legacyOrderedSetKeys;

  */
  const toggleSelect = (id, idx, arr, event) => {
    if (event?.shiftKey && lastCheckedIdx !== null) {
      const lo = Math.min(lastCheckedIdx, idx);
      const hi = Math.max(lastCheckedIdx, idx);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        arr.slice(lo, hi + 1).forEach((drawing) => next.add(drawing.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    setLastCheckedIdx(idx);
  };

  const selectAll = (arr) => setSelectedIds((prev) => {
    const next = new Set(prev);
    arr.forEach((drawing) => next.add(drawing.id));
    return next;
  });

  const deselectAll = (arr) => setSelectedIds((prev) => {
    const next = new Set(prev);
    arr.forEach((drawing) => next.delete(drawing.id));
    return next;
  });

  const clearSelection = () => setSelectedIds(new Set());

  const applyBulkUpdate = async (field, value) => {
    const ids = [...selectedIds];
    if (!ids.length || savingBulk) return;
    setSavingBulk(true);
    try {
      await bulkUpdateDrawings(ids.map((id) => ({ id, patch: { [field]: value } })));
      toast.success(`Updated ${ids.length} drawings`);
      clearSelection();
      loadDrawings();
    } catch (error) {
      toast.error(error?.message || "Bulk update failed");
    } finally {
      setSavingBulk(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length || savingBulk) return;
    setSavingBulk(true);
    try {
      await runDrawingMutations(ids.map((id) => () => base44.entities.Drawing.delete(id)));
      toast.success(`Deleted ${ids.length} drawings`);
      clearSelection();
      setBulkDeleteOpen(false);
      loadDrawings();
    } catch (error) {
      toast.error(error?.message || "Bulk delete failed");
    } finally {
      setSavingBulk(false);
    }
  };

  const openApprovalModal = (setKey, setDrawings) => {
    const sample = setDrawings[0];
    setApprovalModal({
      setKey,
      setName: setKey,
      sheetCount: setDrawings.length,
      existingRevision: String(sample?.revision_number ?? ""),
      setDrawings,
    });
  };

  const advanceSet = async (setKey) => {
    const targetSheets = (drawingsBySet[setKey] || []).filter((drawing) => drawing.stage !== "Released");
    if (!targetSheets.length) return;
    const bottleneckStage = targetSheets.reduce((current, drawing) => {
      const currentIdx = STAGES.indexOf(current || "Released");
      const drawingIdx = STAGES.indexOf(drawing.stage || "Not Started");
      return drawingIdx < currentIdx ? drawing.stage : current;
    }, targetSheets[0]?.stage || "Not Started");
    const nextStage = getNextStage(bottleneckStage);
    if (!nextStage) return;

    try {
      const bottleneckSheets = targetSheets.filter((drawing) => (drawing.stage || "Not Started") === bottleneckStage);
      await bulkUpdateDrawings(
        bottleneckSheets.map((drawing) => ({
          id: drawing.id,
          patch: {
            stage: nextStage,
            ...(nextStage === "BFA" || nextStage === "BFS"
              ? { revision_number: incrementRevisionLabel(drawing.revision_number) }
              : {}),
          },
        }))
      );
      toast.success(`Advanced ${targetSheets.filter((drawing) => (drawing.stage || "Not Started") === bottleneckStage).length} sheets from ${bottleneckStage} → ${nextStage}`);
      await loadDrawings();
    } catch (error) {
      toast.error(error?.message || "Failed to advance set");
    }
  };

  const assignAllUnassigned = async () => {
    const value = window.prompt("Enter drawing set name for unassigned sheets:");
    const setName = value?.trim();
    if (!setName) return;
    try {
      unassignedDrawings.forEach((drawing) => {
        if (drawing?.id) pendingSetAssignmentsRef.current.set(drawing.id, setName);
        persistAssignment(activeProject?.id, drawing, setName);
      });
      await bulkUpdateDrawings(
        unassignedDrawings.map((drawing) => ({ id: drawing.id, patch: { drawing_set_name: setName } }))
      );
        await persistDrawingSetAssignment({
          setName,
          sourceDrawing: unassignedDrawings[0],
          drawingIds: unassignedDrawings.map((drawing) => drawing.id),
          activeProject,
        });
        await ensureDrawingSetRecord({
          setName,
          sourceDrawing: unassignedDrawings[0],
          drawingSets,
          setDrawingSets,
          activeProject,
        });
      toast.success(`Assigned ${unassignedDrawings.length} drawings to ${setName}`);
      await loadDrawings();
    } catch (error) {
      toast.error(error?.message || "Failed to assign drawings");
    }
  };

  const handleApprovalConfirm = async ({ status, revision, approvedBy, approvalDate, applyToSheets, notes }) => {
    if (!approvalModal) return;
    setSavingApproval(true);
    try {
      await bulkUpdateDrawings(
        approvalModal.setDrawings.map((drawing) => {
          const patch = {
            set_approval_status: status,
            set_approved_by: approvedBy,
            set_approved_date: approvalDate,
            set_approval_notes: notes,
            set_approval_revision: revision,
          };
          if (applyToSheets && status === "approved") patch.stage = "Released";
          return { id: drawing.id, patch };
        })
      );
      toast.success(`Drawing set ${status} - ${approvalModal.sheetCount} sheets updated`);
      setApprovalModal(null);
      loadDrawings();
    } catch (error) {
      toast.error(error?.message || "Failed to update drawing set approval");
    } finally {
      setSavingApproval(false);
    }
  };

  const disciplines = [...new Set(resolvedDrawings.map((drawing) => drawing.discipline).filter(Boolean))].sort();
  const kpis = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7 = new Date(today);
    in7.setDate(today.getDate() + 7);

    const active = resolvedDrawings.filter((d) => !d.is_superseded);
    const released = active.filter((d) => d.stage === "Released");
    const overdue = active.filter((d) => isOverdueDrawing(d));
    const dueThisWeekRows = active.filter((d) => {
      if (!d.due_date || d.stage === "Released") return false;
      const due = new Date(d.due_date);
      due.setHours(0, 0, 0, 0);
      return due >= today && due <= in7;
    });
    const pendingEOR = active.filter((d) => ["OFA", "BFA"].includes(d.stage));
    const pendingStamp = active.filter((d) => ["OFS", "BFS"].includes(d.stage));
    const fffRows = active.filter((d) => d.stage === "FFF");
    const activeSets = Object.keys(setMeta);
    const approvedSets = activeSets.filter((setName) => setMeta[setName]?.allReleased);
    const overdueSets = activeSets.filter((setName) => setMeta[setName]?.isOverdue);

    return {
      total: active.length,
      released: released.length,
      overdue: overdue.length,
      dueThisWeek: dueThisWeekRows.length,
      pendingEOR: pendingEOR.length,
      pendingStamp: pendingStamp.length,
      fff: fffRows.length,
      totalSets: activeSets.length,
      approvedSets: approvedSets.length,
      overdueSets: overdueSets.length,
    };
  }, [resolvedDrawings, setMeta]);

  const overdueDrawings = useMemo(
    () => activeResolvedDrawings.filter((drawing) => isOverdueDrawing(drawing)),
    [activeResolvedDrawings]
  );

  const stageChartData = STAGES.map((stage) => ({
    name: getStageTone(stage).short,
    count: activeResolvedDrawings.filter((drawing) => (drawing.stage || "Not Started") === stage).length,
    color: getStageTone(stage).color,
  }));

  const disciplineChartData = Object.entries(
    activeResolvedDrawings.reduce((acc, drawing) => {
      const key = drawing.discipline || "Unspecified";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value], index) => ({
    name,
    value,
    color: [ "var(--accent)", "var(--status-info)", "#8B5CF6", "#EC4899", "var(--status-warning)", "var(--status-success)" ][index % 6],
  }));

  const completionChartData = setKeys
    .map((setName) => {
      const meta = setMeta[setName];
      const total = meta?.sheets?.length || 1;
      const released = meta?.stageCount?.Released || 0;
      const notStarted = meta?.stageCount?.["Not Started"] || 0;
      const inProgress = Math.max(total - released - notStarted, 0);
      return {
        name: setName,
        releasedPct: Math.round((released / total) * 100),
        progressPct: Math.round((inProgress / total) * 100),
        notStartedPct: Math.round((notStarted / total) * 100),
      };
    })
    .sort((a, b) => a.releasedPct - b.releasedPct);

  const timelineChartData = useMemo(() => {
    const rows = setKeys
      .map((setName) => {
        const meta = setMeta[setName];
        return {
          name: setName,
          start: meta?.submitted ? new Date(meta.submitted) : meta?.sheets?.map((s) => s.created_date).filter(Boolean).sort()[0] ? new Date(meta.sheets.map((s) => s.created_date).filter(Boolean).sort()[0]) : null,
          end: meta?.due ? new Date(meta.due) : null,
          color: meta?.allReleased ? "var(--status-success)" : meta?.isOverdue ? "var(--status-error)" : "var(--accent)",
          meta: `${meta?.submitted ? formatDate(meta.submitted) : "—"} → ${meta?.due ? formatDate(meta.due) : "—"}`,
        };
      })
      .filter((row) => row.start && row.end);
    if (!rows.length) return [];
    const min = Math.min(...rows.map((row) => row.start.getTime()));
    const max = Math.max(...rows.map((row) => row.end.getTime()));
    const span = Math.max(max - min, 86400000);
    return rows.map((row) => ({
      ...row,
      leftPct: ((row.start.getTime() - min) / span) * 100,
      widthPct: Math.max(((row.end.getTime() - row.start.getTime()) / span) * 100, 6),
    }));
  }, [setKeys, setMeta]);

  if (!activeProject?.id) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>[]</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>Select a project to view drawings</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right.</div>
      </div>
    );
  }

  const kpiCells = [
    { label: "TOTAL SHEETS", value: kpis.total, color: "var(--text-primary)", onClick: () => { setStageFilter("all"); setActiveSetFilter(null); } },
    { label: "RELEASED", value: kpis.released, color: "var(--status-success)", onClick: () => setStageFilter("Released") },
    { label: "OVERDUE", value: kpis.overdue, color: kpis.overdue ? "var(--status-error)" : "var(--text-muted)", onClick: () => { setSortMode("DUE DATE"); setSortByDue(true); } },
    { label: "DUE THIS WEEK", value: kpis.dueThisWeek, color: kpis.dueThisWeek ? "var(--status-warning)" : "var(--text-muted)", onClick: () => { setSortMode("DUE DATE"); setSortByDue(true); } },
    { label: "PENDING EOR", value: kpis.pendingEOR, color: "var(--status-info)", onClick: () => setStageFilter("OFA") },
    { label: "PENDING STAMP", value: kpis.pendingStamp, color: "var(--status-info)", onClick: () => setStageFilter("OFS") },
    { label: "FIT FOR FAB", value: kpis.fff, color: "var(--status-warning)", onClick: () => setStageFilter("FFF") },
    { label: "TOTAL SETS", value: kpis.totalSets, color: "var(--accent)", onClick: () => setActiveSetFilter(null) },
    { label: "SETS APPROVED", value: kpis.approvedSets, color: "var(--status-success)", onClick: () => setStageFilter("Released") },
    { label: "OVERDUE SETS", value: kpis.overdueSets, color: kpis.overdueSets ? "var(--status-error)" : "var(--text-muted)", onClick: () => { setSortMode("DUE DATE"); setSortByDue(true); } },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 92px)", overflow: "hidden", background: "var(--bg-page)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 56, borderBottom: "1px solid var(--divider)", background: "var(--bg-sidebar)", flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
          <span style={{ fontFamily: displayFont, fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em", textTransform: "uppercase" }}>DRAWING LOG</span>
          <span style={{ fontFamily: monoFont, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
            {activeProject.name} · {drawings.length} sheets · {trackerSetKeys.length} sets
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => { setEditing(null); setModalOpen(true); }} style={btnSecondary}><Plus style={{ width: 10, height: 10 }} /> SINGLE DRAWING</button>
          <button onClick={() => setUploadSetOpen(true)} style={btnPrimary}><Upload style={{ width: 12, height: 12 }} /> UPLOAD SET</button>
          <button onClick={() => openNewRevision(null, activeSetFilter)} style={btnSecondary}><Upload style={{ width: 10, height: 10 }} /> NEW REVISION</button>
          <button onClick={loadDrawings} style={{ ...btnSecondary, padding: "0 8px", width: 32, justifyContent: "center" }} title="Refresh">
            <RefreshCw style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, minmax(0, 1fr))", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)", flexShrink: 0 }}>
        {kpiCells.map((kpi) => (
          <button
            key={kpi.label}
            onClick={kpi.onClick}
            style={{
              padding: "11px 12px",
              border: "none",
              borderRight: "1px solid rgba(255,255,255,0.05)",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              borderTop: (kpi.label === "OVERDUE" && kpi.value > 0) || (kpi.label === "OVERDUE SETS" && kpi.value > 0) ? "2px solid var(--status-error)" : (kpi.label === "DUE THIS WEEK" && kpi.value > 0 ? "2px solid var(--status-warning)" : "2px solid transparent"),
            }}
          >
            <span style={{ fontFamily: monoFont, fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase" }}>{kpi.label}</span>
            <span style={{ fontFamily: monoFont, fontSize: 20, fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</span>
          </button>
        ))}
      </div>

      {!overdueAlertDismissed && overdueDrawings.length > 0 && (
        <div style={{ flexShrink: 0, padding: "0 16px", background: "var(--danger-muted)", borderBottom: "1px solid var(--danger-border)", minHeight: 38, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
            <AlertTriangle style={{ width: 14, height: 14, color: "var(--status-error)" }} />
            <span style={{ fontFamily: monoFont, fontSize: 9, fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.08em" }}>
              {overdueDrawings.length} OVERDUE DRAWINGS
            </span>
            {overdueDrawings.slice(0, 3).map((drawing) => (
              <span key={drawing.id} style={{ fontFamily: monoFont, fontSize: 8, color: "var(--status-error)", border: "1px solid var(--danger-border)", background: "rgba(255,255,255,0.03)", padding: "2px 6px", borderRadius: 2 }}>
                {drawing.sheet_number} · {drawing.resolved_set_name === UNASSIGNED_KEY ? "UNASSIGNED" : drawing.resolved_set_name}
              </span>
            ))}
          </div>
          <button onClick={() => setOverdueAlertDismissed(true)} style={{ ...compactHeaderBtn, height: 22, color: "var(--status-error)", borderColor: "var(--danger-border)", background: "transparent" }}>DISMISS</button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", minHeight: 40, borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)", flexShrink: 0, overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-surface-high)", border: "1px solid var(--border-default)", borderRadius: 2, padding: "0 10px", height: 28, flex: "0 0 280px", maxWidth: 280 }}>
          <span style={{ fontSize: 12, opacity: 0.4, flexShrink: 0 }}>/</span>
          <input placeholder="Search drawings..." value={search} onChange={(event) => setSearch(event.target.value)} style={{ background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontFamily: bodyFont, fontSize: 11, width: "100%", padding: 0 }} />
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setStageFilter("all")} style={{ ...compactHeaderBtn, height: 26, background: stageFilter === "all" ? "var(--accent-muted)" : "var(--bg-surface-high)", color: stageFilter === "all" ? "var(--accent)" : "var(--text-muted)" }}>ALL</button>
          {STAGES.map((stage) => (
            <button key={stage} onClick={() => setStageFilter(stage)} style={{ ...compactHeaderBtn, height: 26, background: stageFilter === stage ? getStageTone(stage).bg : "var(--bg-surface-high)", color: stageFilter === stage ? getStageTone(stage).color : "var(--text-muted)", borderColor: stageFilter === stage ? `${getStageTone(stage).color}44` : "var(--border-default)" }}>
              {getStageTone(stage).short}
            </button>
          ))}
        </div>

        <select value={discFilter} onChange={(event) => setDiscFilter(event.target.value)} style={compactSelect}>
          <option value="all">All Disciplines</option>
          {disciplines.map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}
        </select>

        <select value={sortMode} onChange={(event) => { setSortMode(event.target.value); setSortByDue(event.target.value === "DUE DATE"); }} style={compactSelect}>
          {["DUE DATE", "SET NAME", "STAGE"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
        </select>

        <button onClick={() => setShowSuperseded((value) => !value)} style={{ ...compactHeaderBtn, height: 26, background: showSuperseded ? "rgba(255,255,255,0.08)" : "var(--bg-surface-high)" }}>
          {showSuperseded ? "SHOW ALL" : "HIDE SUPERSEDED"}
        </button>

        <select value={activeSetFilter || "all"} onChange={(event) => setActiveSetFilter(event.target.value === "all" ? null : event.target.value)} style={compactSelect}>
          <option value="all">All Sets</option>
          {trackerSetKeys.map((setName) => <option key={setName} value={setName}>{setName}</option>)}
          {unassignedDrawings.length > 0 && <option value={UNASSIGNED_KEY}>⚠ UNASSIGNED</option>}
        </select>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", background: "var(--bg-surface-high)", border: "1px solid var(--border-default)", borderRadius: 2, overflow: "hidden" }}>
          {VIEW_OPTIONS.map((mode) => (
            <button key={mode} onClick={() => setView(mode)} style={{ padding: "0 10px", height: 28, background: view === mode ? "var(--accent-muted)" : "transparent", border: "none", color: view === mode ? "var(--accent)" : "var(--text-muted)", fontFamily: monoFont, fontSize: 8, fontWeight: 700, cursor: "pointer", letterSpacing: "0.10em" }}>{mode}</button>
          ))}
        </div>
      </div>

      {selectedIds.size > 0 && <BulkActionBar count={selectedIds.size} onBulkUpdate={applyBulkUpdate} onBulkDelete={() => setBulkDeleteOpen(true)} onClear={clearSelection} />}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <DrawingSetTrackerPanel
          setKeys={trackerSetKeys}
          setMeta={setMeta}
          activeSetFilter={activeSetFilter}
          onSelectSet={setActiveSetFilter}
          onClearSet={() => setActiveSetFilter(null)}
          unassignedDrawings={unassignedDrawings}
          onEditUnassigned={(drawing) => { setEditing(drawing); setModalOpen(true); }}
        />

        <div style={{ flex: 1, overflowY: view === "KANBAN" ? "hidden" : "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
          {view === "TABLE" && (setKeys.length > 0 || unassignedDrawings.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 16px", minHeight: 32, flexShrink: 0, background: "var(--bg-sidebar)", borderBottom: "1px solid var(--divider)", position: "sticky", top: 0, zIndex: 5 }}>
              <div>
                <input
                  type="checkbox"
                  checked={allFilteredArr.length > 0 && allFilteredArr.every((drawing) => selectedIds.has(drawing.id))}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = allFilteredArr.some((drawing) => selectedIds.has(drawing.id)) && !allFilteredArr.every((drawing) => selectedIds.has(drawing.id));
                    }
                  }}
                  onChange={(event) => event.target.checked ? selectAll(allFilteredArr) : clearSelection()}
                  style={{ width: 13, height: 13, cursor: "pointer", accentColor: "var(--accent)" }}
                />
              </div>
              {["#", "TITLE", "DISC", "REV", "STAGE", "IFC", "APPV", "DUE", "DAYS", "ACTIONS"].map((col) => (
                <div key={col} style={{ fontFamily: monoFont, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", userSelect: "none", whiteSpace: "nowrap", textTransform: "uppercase" }}>{col}</div>
              ))}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, fontFamily: monoFont, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em" }}>Loading drawings...</div>
          ) : view === "KANBAN" ? (
            <DrawingKanban
              drawings={filtered}
              onStageChange={async (drawing, newStage) => {
                const data = { stage: newStage };
                if (newStage === "BFA" || newStage === "BFS") data.revision_number = incrementRevisionLabel(drawing.revision_number);
                await base44.entities.Drawing.update(drawing.id, data);
                loadDrawings();
              }}
              onEdit={(drawing) => { setEditing(drawing); setModalOpen(true); }}
            />
          ) : view === "CHARTS" ? (
            <ChartsView
              stageData={stageChartData}
              disciplineData={disciplineChartData}
              completionData={completionChartData}
              timelineData={timelineChartData}
              onSelectSet={(setName) => { setActiveSetFilter(setName); setView("TABLE"); }}
            />
          ) : displayDrawings.length === 0 && unassignedDrawings.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 24px" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>[]</div>
              <div style={{ fontFamily: displayFont, fontSize: 17, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>No drawings found</div>
              <div style={{ fontFamily: bodyFont, fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>Upload a drawing set PDF to populate the log.</div>
              <button onClick={() => setUploadSetOpen(true)} style={{ ...btnPrimary, display: "inline-flex" }}>
                <Upload style={{ width: 12, height: 12 }} /> UPLOAD DRAWING SET
              </button>
            </div>
          ) : view === "THUMBNAIL" ? (
            <ThumbnailGrid
              setKeys={setKeys}
              setMeta={setMeta}
              onEdit={(drawing) => { setEditing(drawing); setModalOpen(true); }}
              onAnnotate={openAnnotations}
              onAdvance={advanceStage}
              navigate={navigate}
              createPageUrl={createPageUrl}
              onSelectAll={selectAll}
              selectedIds={selectedIds}
              onOpenApproval={openApprovalModal}
              onOpenHistory={(drawingSet) => drawingSet && setHistoryPanel(drawingSet)}
              onNewRevision={(drawingSet, setKey) => openNewRevision(drawingSet, setKey)}
              onAdvanceAll={advanceSet}
            />
          ) : view === "SCHEDULE" ? (
            <div style={{ display: "grid", gap: 16, padding: 16 }}>
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 2, padding: 16 }}>
                <div style={{ fontFamily: monoFont, fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", borderLeft: "3px solid var(--accent)", paddingLeft: 8, marginBottom: 12 }}>
                  Set Pipeline
                </div>
                <ScheduleView setKeys={setKeys} setMeta={setMeta} />
              </div>
            </div>
          ) : (
            <>
              {unassignedDrawings.length > 0 && (!activeSetFilter || activeSetFilter === UNASSIGNED_KEY) && (
                <div style={{ marginTop: 10, padding: "0 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44, padding: "0 16px", background: "var(--warning-muted)", borderTop: "1px solid var(--warning-border)", borderBottom: "1px solid var(--warning-border)", borderLeft: "3px solid var(--status-warning)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <AlertTriangle style={{ width: 14, height: 14, color: "var(--status-warning)" }} />
                      <span style={{ fontFamily: monoFont, fontSize: 8, fontWeight: 700, color: "var(--status-warning)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                        ⚠ UNASSIGNED DRAWINGS ({unassignedDrawings.length}) — Set name required
                      </span>
                    </div>
                    <button onClick={assignAllUnassigned} style={{ ...compactHeaderBtn, color: "var(--status-warning)", borderColor: "var(--warning-border)", background: "rgba(255,255,255,0.04)" }}>
                      ASSIGN ALL
                    </button>
                  </div>
                  <div style={{ paddingLeft: 4, borderLeft: "3px solid var(--warning-border)" }}>
                    {unassignedDrawings.map((drawing) => {
                      const globalIdx = allFilteredArr.findIndex((item) => item.id === drawing.id);
                      return (
                        <DrawingRow
                          key={drawing.id}
                          d={drawing}
                          selected={selectedIds.has(drawing.id)}
                          globalIdx={globalIdx}
                          allArr={allFilteredArr}
                          onToggle={toggleSelect}
                          onEdit={(row) => { setEditing(row); setModalOpen(true); }}
                          onDelete={setDeleteTarget}
                          onAdvance={advanceStage}
                          onAnnotate={openAnnotations}
                          isOverdueDrawing={isOverdueDrawing}
                          daysUntilDue={daysUntilDue}
                          generateThumbnail={generateThumbnail}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {setKeys.map((setKey) => (
                <DrawingSetGroup
                  key={setKey}
                  setKey={setKey}
                  setDrawings={drawingsBySet[setKey]}
                  setMeta={setMeta}
                  collapsed={!!collapsedSets[setKey]}
                  onToggleCollapse={(key) => setCollapsedSets((prev) => ({ ...prev, [key]: !prev[key] }))}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onSelectAll={selectAll}
                  onDeselectAll={deselectAll}
                  onEdit={(drawing) => { setEditing(drawing); setModalOpen(true); }}
                  onDelete={setDeleteTarget}
                  onAdvance={advanceStage}
                  onOpenApproval={openApprovalModal}
                  onOpenHistory={(drawingSet) => setHistoryPanel(drawingSet)}
                  onNewRevision={(drawingSet, key) => openNewRevision(drawingSet, key || setKey)}
                  onAdvanceAll={advanceSet}
                  allFilteredArr={allFilteredArr}
                  onAnnotate={openAnnotations}
                  isOverdueDrawing={isOverdueDrawing}
                  daysUntilDue={daysUntilDue}
                  generateThumbnail={generateThumbnail}
                />
              ))}
            </>
          )}
          </div>
        </div>

      <DrawingFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={handleSave} drawing={editing} projects={projects} nextId={nextId} activeProject={activeProject} />
      <DeleteDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete Drawing" description={`Delete ${deleteTarget?.sheet_number}?`} />
      <DeleteDialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} title={`Delete ${selectedIds.size} drawings?`} description="This cannot be undone." />
      <DrawingSetUploadModal open={uploadSetOpen} onClose={() => setUploadSetOpen(false)} onComplete={() => { loadDrawings(); setUploadSetOpen(false); }} activeProject={activeProject} onNewRevision={() => { setUploadSetOpen(false); setRevisionPreselectedSet(null); setRevisionUploadOpen(true); }} />
      <RevisionUploadModal open={revisionUploadOpen} onClose={() => { setRevisionUploadOpen(false); setRevisionPreselectedSet(null); }} onComplete={() => { loadDrawings(); setRevisionUploadOpen(false); setRevisionPreselectedSet(null); }} activeProject={activeProject} preSelectedSet={revisionPreselectedSet} drawingSets={drawingSets} />
      {historyPanel && <RevisionHistoryPanel drawingSet={historyPanel} onClose={() => setHistoryPanel(null)} onUploadNewRevision={(drawingSet) => { setHistoryPanel(null); setRevisionPreselectedSet(drawingSet); setRevisionUploadOpen(true); }} />}
      {approvalModal && <SetApprovalModal open={!!approvalModal} onClose={() => setApprovalModal(null)} setName={approvalModal.setName} sheetCount={approvalModal.sheetCount} existingRevision={approvalModal.existingRevision} onConfirm={handleApprovalConfirm} saving={savingApproval} />}
    </div>
  );
}
