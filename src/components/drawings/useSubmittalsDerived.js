import { useMemo } from "react";
import {
  STAGES,
  UNASSIGNED_KEY,
  compareSetNames,
  compareSheetNumbers,
  getDaysUntil,
  getDrawingSetName,
  getMostAdvancedStage,
  getSetApprovalStatus,
  getSetDiscipline,
  normalizeSetKey,
} from "./submittalsUtils";

export function useSubmittalsDerived({
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
}) {
  const resolvedDrawings = useMemo(
    () => drawings.map((drawing) => ({ ...drawing, resolved_set_name: getDrawingSetName(drawing, drawingSets) })),
    [drawings, drawingSets]
  );

  const activeResolvedDrawings = useMemo(
    () => resolvedDrawings.filter((drawing) => !drawing.is_superseded),
    [resolvedDrawings]
  );

  const setMeta = useMemo(() => {
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
  }, [activeResolvedDrawings, drawingSets, isOverdueDrawing]);

  const orderedSetKeys = useMemo(
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

  const unassignedDrawings = useMemo(
    () => activeResolvedDrawings.filter((drawing) => drawing.resolved_set_name === UNASSIGNED_KEY).sort(compareSheetNumbers),
    [activeResolvedDrawings]
  );

  const filtered = useMemo(() => resolvedDrawings.filter((drawing) => {
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
  }), [resolvedDrawings, search, stageFilter, discFilter, showSuperseded, activeSetFilter]);

  const displayDrawings = useMemo(() => [...filtered].sort((a, b) => {
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
  }), [filtered, sortMode, sortByDue]);

  const drawingsBySet = useMemo(() => displayDrawings.reduce((acc, drawing) => {
    const key = drawing.resolved_set_name;
    if (key === UNASSIGNED_KEY) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(drawing);
    return acc;
  }, {}), [displayDrawings]);

  const setKeys = useMemo(() => Object.keys(drawingsBySet).sort((a, b) => {
    const aMeta = setMeta[a];
    const bMeta = setMeta[b];
    if (aMeta?.isOverdue && !bMeta?.isOverdue) return -1;
    if (!aMeta?.isOverdue && bMeta?.isOverdue) return 1;
    return compareSetNames(a, b);
  }), [drawingsBySet, setMeta]);

  const allFilteredArr = useMemo(
    () => setKeys.flatMap((key) => [...(drawingsBySet[key] || [])].sort(compareSheetNumbers)).concat(activeSetFilter === UNASSIGNED_KEY ? unassignedDrawings : []),
    [setKeys, drawingsBySet, activeSetFilter, unassignedDrawings]
  );

  return {
    resolvedDrawings,
    activeResolvedDrawings,
    setMeta,
    unassignedDrawings,
    filtered,
    displayDrawings,
    drawingsBySet,
    setKeys,
    allFilteredArr,
    trackerSetKeys: orderedSetKeys,
  };
}
