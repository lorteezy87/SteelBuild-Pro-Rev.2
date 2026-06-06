import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ComponentType, PropsWithChildren } from "react";
import { useProjectContext } from "../components/shared/ProjectContext";
import { PhoenixPanel as PhoenixPanelRaw } from "../components/shared/PhoenixPanel";
import {
  Select as SelectRaw,
  SelectContent as SelectContentRaw,
  SelectItem as SelectItemRaw,
  SelectTrigger as SelectTriggerRaw,
  SelectValue as SelectValueRaw,
} from "@/components/ui/select";
import { PHASES, derivePhase, groupByPhase } from "../utils/phases";
import { CommandBar as CommandBarRaw, KpiTile as KpiTileRaw } from "@/components/design-system";
import GanttContextMenuRaw from "../components/gantt/GanttContextMenu";
import { createPageUrl } from "@/utils";
import { GANTT_TODAY_HEX } from "@/lib/ganttTheme";
import { PHASE_COLORS, ZOOM_LEVELS, toLocalMidnight, addDays } from "./ganttChart/format";
import { TaskList, Timeline, DetailPanel } from "./ganttChart/components";

// design-system + shadcn ui + shared .jsx primitives; cast at the boundary
// (removable once the shared layer is typed).
type AnyProps = PropsWithChildren<Record<string, any>>;
const PhoenixPanel = PhoenixPanelRaw as unknown as ComponentType<AnyProps>;
const Select = SelectRaw as unknown as ComponentType<AnyProps>;
const SelectContent = SelectContentRaw as unknown as ComponentType<AnyProps>;
const SelectItem = SelectItemRaw as unknown as ComponentType<AnyProps>;
const SelectTrigger = SelectTriggerRaw as unknown as ComponentType<AnyProps>;
const SelectValue = SelectValueRaw as unknown as ComponentType<AnyProps>;
const CommandBar = CommandBarRaw as unknown as ComponentType<AnyProps>;
const KpiTile = KpiTileRaw as unknown as ComponentType<AnyProps>;
const GanttContextMenu = GanttContextMenuRaw as unknown as ComponentType<AnyProps>;



export default function GanttChart() {
  const { activeProject } = useProjectContext();
  const qc = useQueryClient();
  const [zoom, setZoom] = useState("week");
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDetail, setShowDetail] = useState(false);
  const [collapsedPhases, setCollapsedPhases] = useState(new Set());
  const [smartMode, setSmartMode] = useState(true);
  const [menu, setMenu] = useState(null); // { x, y, task }
  const [clipboard, setClipboard] = useState(null); // { mode: "cut"|"copy", task }
  const [dependencyPick, setDependencyPick] = useState(null); // { sourceId }
  const [parentPick, setParentPick]           = useState(null); // { childId } — "Make a subtask" pick mode

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ["lookahead-gantt", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.LookAhead.filter({ project_id: activeProject.id }, "-created_at")
      : [],
    enabled: !!activeProject?.id,
  });

  // Lift parent_id / dependencies out of metadata for downstream rendering.
  const items = useMemo(() => (rawItems || []).map((t) => ({
    ...t,
    parent_id: t.parent_id ?? t.metadata?.parent_id ?? null,
    dependencies: Array.isArray(t.dependencies)
      ? t.dependencies
      : Array.isArray(t.metadata?.dependencies)
      ? t.metadata.dependencies
      : [],
  })), [rawItems]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["lookahead-gantt", activeProject?.id] });
    qc.invalidateQueries({ queryKey: ["lookahead", activeProject?.id] });
  }, [qc, activeProject?.id]);

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => entities.LookAhead.update(id, data),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(`Update failed: ${e?.message || "Unknown error"}`),
  });
  const createMut = useMutation({
    mutationFn: (d: any) => entities.LookAhead.create(d),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(`Create failed: ${e?.message || "Unknown error"}`),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => entities.LookAhead.delete(id),
    onSuccess: invalidate,
    onError: (e) => toast.error(`Delete failed: ${e?.message || "Unknown error"}`),
  });

  const patchMeta = useCallback((task, patch) => {
    const nextMeta = { ...(task.metadata || {}), ...patch };
    return updateMut.mutateAsync({ id: task.id, data: { metadata: nextMeta } });
  }, [updateMut]);

  const displayRows = useMemo(() => {
    const base = items.filter(i => {
      if (phaseFilter !== "all" && derivePhase(i) !== phaseFilter) return false;
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      return true;
    });

    // Compute depth via parent chain; children nest under their parent.
    const byId = new Map(base.map((t) => [t.id, t]));
    const depthFor = (t, seen = new Set()) => {
      if (!t?.parent_id || seen.has(t.id)) return 0;
      seen.add(t.id);
      const parent = byId.get(t.parent_id);
      if (!parent) return 0;
      return 1 + depthFor(parent, seen);
    };

    const groups = groupByPhase(base);
    const rows = [];
    for (const phase of PHASES) {
      const tasks = groups[phase];
      if (!tasks || tasks.length === 0) continue;

      const starts = tasks.map(t => t.planned_start || t.forecast_start).filter(Boolean);
      const ends = tasks.map(t => t.planned_end || t.forecast_end).filter(Boolean);
      const summaryStart = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : null;
      const summaryEnd = ends.length > 0 ? ends.reduce((a, b) => (a > b ? a : b)) : null;

      const complete = tasks.filter(t => t.status === "Complete").length;
      const delayed = tasks.filter(t => t.status === "Delayed").length;
      const avgPct = Math.round(tasks.reduce((s, t) => s + (Number(t.percent_complete) || 0), 0) / tasks.length);

      rows.push({
        id: `summary-${phase}`,
        isSummary: true,
        phase,
        activity: phase.toUpperCase(),
        planned_start: summaryStart,
        planned_end: summaryEnd,
        childCount: tasks.length,
        complete,
        delayed,
        avgPct,
      });

      // Order: parents first, then children indented below. Preserve
      // relative created-at order otherwise.
      const byParent = new Map();
      for (const t of tasks) {
        const key = t.parent_id && byId.has(t.parent_id) ? t.parent_id : "__root__";
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(t);
      }
      const emit = (list) => {
        for (const t of list) {
          rows.push({ ...t, isSummary: false, depth: depthFor(t) });
          const kids = byParent.get(t.id);
          if (kids?.length) emit(kids);
        }
      };
      emit(byParent.get("__root__") || []);
    }
    return rows;
  }, [items, phaseFilter, statusFilter]);

  const filteredTasks = useMemo(() => displayRows.filter(r => !r.isSummary), [displayRows]);

  const visibleRows = useMemo(() => {
    return displayRows.filter(row => {
      if (row.isSummary) return true;
      return !collapsedPhases.has(derivePhase(row));
    });
  }, [displayRows, collapsedPhases]);

  const dateRange = useMemo(() => {
    const dates = [];
    filteredTasks.forEach(t => {
      if (t.planned_start)  { const d = toLocalMidnight(t.planned_start);  if (d) dates.push(d); }
      if (t.planned_end)    { const d = toLocalMidnight(t.planned_end);    if (d) dates.push(d); }
      if (t.forecast_start) { const d = toLocalMidnight(t.forecast_start); if (d) dates.push(d); }
      if (t.forecast_end)   { const d = toLocalMidnight(t.forecast_end);   if (d) dates.push(d); }
    });
    if (dates.length === 0) { const today = new Date(); return { minDate: addDays(today, -7), maxDate: addDays(today, 21) }; }
    return { minDate: addDays(new Date(Math.min(...dates)), -3), maxDate: addDays(new Date(Math.max(...dates)), 7) };
  }, [filteredTasks]);

  const selectedTask = filteredTasks.find(t => t.id === selectedId);

  const stats = useMemo(() => {
    const total = filteredTasks.length;
    return {
      total,
      complete: filteredTasks.filter(t => t.status === "Complete").length,
      delayed: filteredTasks.filter(t => t.status === "Delayed").length,
      slipping: filteredTasks.filter(t => t.forecast_end && t.planned_end && t.forecast_end > t.planned_end).length,
      avgProgress: total > 0 ? Math.round(filteredTasks.reduce((s, t) => s + (Number(t.percent_complete) || 0), 0) / total) : 0,
    };
  }, [filteredTasks]);

  const togglePhase = useCallback((phase) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev);
      next.has(phase) ? next.delete(phase) : next.add(phase);
      return next;
    });
  }, []);

  // ── Context menu actions ──────────────────────────────────────────────
  const openDetails = useCallback((task) => {
    setSelectedId(task.id);
    setShowDetail(true);
  }, []);

  // "Make a subtask" now uses an explicit pick-parent mode (like
  // dependency picking). Click any task next → THAT becomes the parent.
  // This replaced a silent "auto-pick the task above" that confused users
  // when the auto-pick landed on the wrong row.
  const makeSubtask = useCallback((task) => {
    setParentPick({ childId: task.id });
    toast.info("Click the parent task to nest under · Esc to cancel");
  }, []);

  const completeParentPick = useCallback(async (parentTask) => {
    if (!parentPick) return;
    const child = items.find((t) => t.id === parentPick.childId);
    setParentPick(null);
    if (!child) return;
    if (child.id === parentTask.id) {
      toast.error("Can't nest a task under itself");
      return;
    }
    // Reject cycles — walk up parent chain of prospective parent.
    const byId = new Map(items.map((t) => [t.id, t]));
    let cursor = parentTask;
    const visited = new Set();
    while (cursor) {
      if (cursor.id === child.id) {
        toast.error("That task is already a descendant of this one");
        return;
      }
      if (visited.has(cursor.id)) break;
      visited.add(cursor.id);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : null;
    }
    try {
      await patchMeta(child, { parent_id: parentTask.id });
      toast.success(`"${child.activity}" nested under "${parentTask.activity}"`);
    } catch (err) {
      toast.error(`Could not nest: ${err.message}`);
    }
  }, [parentPick, items, patchMeta]);

  const promoteSubtask = useCallback((task) => {
    if (!task.parent_id) { toast.info("Not a subtask"); return; }
    patchMeta(task, { parent_id: null }).then(() => toast.success("Promoted")).catch((e) => toast.error(`Promote failed: ${e.message}`));
  }, [patchMeta]);

  const cutTask = useCallback((task) => {
    setClipboard({ mode: "cut", task });
    toast.info(`Cut: ${task.activity}`);
  }, []);

  const copyTask = useCallback((task) => {
    setClipboard({ mode: "copy", task });
    toast.success(`Copied: ${task.activity}`);
  }, []);

  const pasteTask = useCallback(async (targetTask) => {
    if (!clipboard?.task) return;
    const src = clipboard.task;
    // Strip server-managed fields; keep phase/dates/etc.
    const {
      id: _id, created_at: _ca, updated_at: _ua, created_date: _cd, updated_date: _ud,
      ...rest
    } = src;
    const newRecord = {
      ...rest,
      activity: clipboard.mode === "copy" ? `${src.activity} (copy)` : src.activity,
      // Paste below targetTask: nest under same parent when applicable.
      metadata: {
        ...(src.metadata || {}),
        parent_id: targetTask?.parent_id ?? src.metadata?.parent_id ?? null,
      },
    };
    try {
      await createMut.mutateAsync(newRecord);
      if (clipboard.mode === "cut") {
        await deleteMut.mutateAsync(src.id);
      }
      toast.success("Pasted");
      setClipboard(null);
    } catch { /* errors handled in mutations */ }
  }, [clipboard, createMut, deleteMut]);

  const insertTaskAbove = useCallback(async (task) => {
    const newRecord = {
      project_id: task.project_id,
      project_name: task.project_name,
      activity: "New Activity",
      phase: task.phase || derivePhase(task),
      crew: "",
      planned_start: task.planned_start || null,
      planned_end: task.planned_end || null,
      forecast_start: null,
      forecast_end: null,
      percent_complete: 0,
      status: "Not Started",
      constraints: "",
      metadata: { parent_id: task.parent_id || null },
    };
    try {
      const created = await createMut.mutateAsync(newRecord);
      toast.success("Task inserted");
      if (created?.id) {
        setSelectedId(created.id);
        setShowDetail(true);
      }
    } catch { /* handled */ }
  }, [createMut]);

  const deleteTask = useCallback(async (task) => {
    if (!window.confirm(`Delete "${task.activity}"? This cannot be undone.`)) return;
    try {
      await deleteMut.mutateAsync(task.id);
      if (selectedId === task.id) { setSelectedId(null); setShowDetail(false); }
      toast.success("Deleted");
    } catch { /* handled */ }
  }, [deleteMut, selectedId]);

  const copyLink = useCallback(async (task) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}${createPageUrl("GanttChart")}?task=${task.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  }, []);

  const startAddDependency = useCallback((task) => {
    setDependencyPick({ sourceId: task.id });
    toast.info("Click the predecessor task to add dependency (Esc to cancel)");
  }, []);

  const completeDependencyPick = useCallback(async (targetTask) => {
    if (!dependencyPick) return;
    const source = items.find((t) => t.id === dependencyPick.sourceId);
    setDependencyPick(null);
    if (!source) return;
    if (targetTask.id === source.id) { toast.error("Cannot depend on itself"); return; }
    const currentDeps = Array.isArray(source.dependencies) ? source.dependencies : [];
    if (currentDeps.includes(targetTask.id)) { toast.info("Dependency already exists"); return; }
    await patchMeta(source, { dependencies: [...currentDeps, targetTask.id] });
    toast.success(`Added dependency: ${targetTask.activity} → ${source.activity}`);
  }, [dependencyPick, items, patchMeta]);

  const removeDependencies = useCallback(async (task) => {
    if (!task.dependencies?.length) { toast.info("No dependencies to remove"); return; }
    await patchMeta(task, { dependencies: [] });
    toast.success("Dependencies cleared");
  }, [patchMeta]);

  const completeTask = useCallback(async (task) => {
    try {
      await updateMut.mutateAsync({
        id: task.id,
        data: { status: "Complete", percent_complete: 100 },
      });
      toast.success("Task marked complete");
    } catch { /* handled */ }
  }, [updateMut]);

  // Cancel dependency pick via Esc
  useEffect(() => {
    // Escape cancels any active pick mode.
    if (!dependencyPick && !parentPick) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (dependencyPick) setDependencyPick(null);
        if (parentPick)     setParentPick(null);
        toast.info("Cancelled");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dependencyPick, parentPick]);

  // Document-level contextmenu listener scoped to the Gantt container.
  // Walks up from event.target to find the row via data-gantt-task-id or
  // data-gantt-phase. This is immune to event-bubbling quirks inside
  // scroll containers and overlapping SVG layers.
  //
  // Registered with capture:true so nothing higher in the tree (custom
  // blockers, ad-block extensions, design-system wrappers) can swallow
  // it before we see the event.
  const ganttRootRef = useRef(null);
  useEffect(() => {
    const onCtx = (ev) => {
      const root = ganttRootRef.current;
      if (!root || !(ev.target instanceof Element)) return;
      if (!root.contains(ev.target)) return;

      const taskEl = ev.target.closest("[data-gantt-task-id]");
      const phaseEl = !taskEl ? ev.target.closest("[data-gantt-phase]") : null;
      if (!taskEl && !phaseEl) return;

      ev.preventDefault();
      ev.stopPropagation();

      if (taskEl) {
        const id = taskEl.getAttribute("data-gantt-task-id");
        const task = items.find((t) => t.id === id);
        if (!task) {
          // Task data isn't loaded yet for this id — surface instead of
          // silently dropping so users aren't left wondering why nothing
          // happened after a right-click.
          toast.info("Task data still loading — try again in a moment.");
          return;
        }
        setMenu({ x: ev.clientX, y: ev.clientY, task });
        return;
      }
      const phase = phaseEl.getAttribute("data-gantt-phase");
      setMenu({ x: ev.clientX, y: ev.clientY, phase });
    };
    document.addEventListener("contextmenu", onCtx, true);
    return () => document.removeEventListener("contextmenu", onCtx, true);
  }, [items]);

  // Phase-level actions for summary (parent) row right-click.
  const addTaskToPhase = useCallback(async (phase) => {
    const newRecord = {
      project_id: activeProject.id,
      project_name: activeProject.project_name || activeProject.name || "",
      activity: "New Activity",
      phase,
      crew: "",
      planned_start: null,
      planned_end: null,
      forecast_start: null,
      forecast_end: null,
      percent_complete: 0,
      status: "Not Started",
      constraints: "",
    };
    try {
      const created = await createMut.mutateAsync(newRecord);
      toast.success(`Added task to ${phase}`);
      if (created?.id) { setSelectedId(created.id); setShowDetail(true); }
    } catch { /* handled */ }
  }, [activeProject, createMut]);

  const collapseOtherPhases = useCallback((phase) => {
    setCollapsedPhases(new Set(PHASES.filter((p) => p !== phase)));
  }, []);

  const expandAllPhases = useCallback(() => setCollapsedPhases(new Set()), []);

  const completeAllInPhase = useCallback(async (phase) => {
    const tasks = items.filter((t) => derivePhase(t) === phase && t.status !== "Complete");
    if (tasks.length === 0) { toast.info("No open tasks in this phase"); return; }
    if (!window.confirm(`Mark all ${tasks.length} open tasks in ${phase} as Complete?`)) return;
    let ok = 0;
    for (const t of tasks) {
      try {
        await updateMut.mutateAsync({ id: t.id, data: { status: "Complete", percent_complete: 100 } });
        ok += 1;
      } catch { /* skip */ }
    }
    toast.success(`Completed ${ok} / ${tasks.length} in ${phase}`);
  }, [items, updateMut]);

  const handleRowClick = useCallback((id) => {
    // Intercept clicks while a pick mode is active.
    if (dependencyPick) {
      const t = items.find((x) => x.id === id);
      if (t) completeDependencyPick(t);
      return;
    }
    if (parentPick) {
      const t = items.find((x) => x.id === id);
      if (t) completeParentPick(t);
      return;
    }
    setSelectedId(id === selectedId ? null : id);
    setShowDetail(id !== selectedId);
  }, [dependencyPick, parentPick, items, completeDependencyPick, completeParentPick, selectedId]);

  const menuItems = useMemo(() => {
    // Phase (parent) row right-click
    if (menu?.phase && !menu?.task) {
      const p = menu.phase;
      const isCollapsed = collapsedPhases.has(p);
      return [
        { label: `Add task to ${p}`, icon: "＋", onClick: () => addTaskToPhase(p) },
        { type: "sep" },
        {
          label: isCollapsed ? "Expand phase" : "Collapse phase",
          icon: isCollapsed ? "▾" : "▸",
          onClick: () => togglePhase(p),
        },
        { label: "Collapse other phases", icon: "⇔", onClick: () => collapseOtherPhases(p) },
        { label: "Expand all phases", icon: "⇳", onClick: expandAllPhases },
        { type: "sep" },
        { label: "Complete all in phase", icon: "✓", onClick: () => completeAllInPhase(p) },
      ];
    }
    // Task row right-click
    if (!menu?.task) return [];
    const t = menu.task;
    const hasClipboard = !!clipboard?.task;
    const hasDeps = Array.isArray(t.dependencies) && t.dependencies.length > 0;
    return [
      { label: "Open Task Details", icon: "🔍", onClick: () => openDetails(t) },
      { type: "sep" },
      { label: "Make a subtask", icon: "↳", onClick: () => makeSubtask(t), disabled: !!t.parent_id },
      { label: "Promote Subtask", icon: "↰", onClick: () => promoteSubtask(t), disabled: !t.parent_id },
      { type: "sep" },
      { label: "Cut Task", icon: "✂", onClick: () => cutTask(t) },
      { label: "Copy Task", icon: "⧉", onClick: () => copyTask(t) },
      { label: "Paste Task", icon: "⎘", onClick: () => pasteTask(t), disabled: !hasClipboard },
      { label: "Insert Task Above", icon: "＋", onClick: () => insertTaskAbove(t) },
      { type: "sep" },
      { label: "Add dependency", icon: "→", onClick: () => startAddDependency(t) },
      { label: "Remove dependencies", icon: "⊘", onClick: () => removeDependencies(t), disabled: !hasDeps },
      { type: "sep" },
      { label: "Complete task", icon: "✓", onClick: () => completeTask(t), disabled: t.status === "Complete" },
      { label: "Copy link to task", icon: "🔗", onClick: () => copyLink(t) },
      { type: "sep" },
      { label: "Delete Task", icon: "🗑", danger: true, onClick: () => deleteTask(t) },
    ];
  }, [menu, clipboard, collapsedPhases, addTaskToPhase, togglePhase, collapseOtherPhases, expandAllPhases, completeAllInPhase, openDetails, makeSubtask, promoteSubtask, cutTask, copyTask, pasteTask, insertTaskAbove, startAddDependency, removeDependencies, completeTask, copyLink, deleteTask]);

  if (!activeProject?.id) return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>Select a project to view Gantt Chart</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right.</div>
    </div>
  );

  const activePhaseCount = Object.values(groupByPhase(filteredTasks)).filter(g => g.length > 0).length;

  return (
    <div ref={ganttRootRef}>
      <CommandBar
        eyebrow={activeProject?.project_name || "SCHEDULE"}
        title="Gantt Chart"
        count={filteredTasks.length}
        unit={` · ${activePhaseCount} PHASES`}
        subtitle="Look-ahead lifecycle · Pre-Construction → Closeout"
      >
        <Select value={phaseFilter} onValueChange={setPhaseFilter}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Phase" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Phases</SelectItem>
            {PHASES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["Not Started", "In Progress", "Complete", "Delayed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          onClick={() => setSmartMode(!smartMode)}
          style={{
            padding: "6px 12px",
            border: smartMode ? "1px solid var(--accent)" : "1px solid var(--border-default)",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: smartMode ? "var(--accent)" : "var(--text-secondary)",
            background: smartMode ? "var(--accent-muted)" : "transparent",
            display: "flex",
            alignItems: "center",
            gap: 4,
            transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 11, lineHeight: 1 }}>{smartMode ? "\u2728" : "\u2606"}</span>
          SMART
        </button>
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
          {Object.entries(ZOOM_LEVELS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setZoom(key)}
              style={{
                padding: "6px 12px",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: zoom === key ? "var(--accent)" : "var(--text-secondary)",
                background: zoom === key ? "var(--accent-muted)" : "transparent",
              }}
            >
              {label.toUpperCase()}
            </button>
          ))}
        </div>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiTile
          compact
          label="Activities"
          value={stats.total}
          color="var(--accent)"
          active={phaseFilter === "all" && statusFilter === "all"}
          onClick={() => { setPhaseFilter("all"); setStatusFilter("all"); }}
        />
        <KpiTile
          compact
          label="Complete"
          value={stats.complete}
          color="var(--status-success)"
          active={statusFilter === "Complete"}
          onClick={() => setStatusFilter(statusFilter === "Complete" ? "all" : "Complete")}
        />
        <KpiTile
          compact
          label="Delayed"
          value={stats.delayed}
          color="var(--status-error)"
          active={statusFilter === "Delayed"}
          onClick={() => setStatusFilter(statusFilter === "Delayed" ? "all" : "Delayed")}
        />
        <KpiTile
          compact
          label="Slipping"
          value={stats.slipping}
          color="var(--status-warning)"
        />
        <KpiTile
          compact
          label="Avg Progress"
          value={`${stats.avgProgress}%`}
          color="var(--phase-fabrication)"
        />
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 10, padding: "0 4px" }}>
        {Object.entries(PHASE_COLORS).map(([phase, c]) => (
          <div key={phase} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 16, height: 6, borderRadius: 3, background: c.bar }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>{phase}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 6, borderRadius: 3, background: "repeating-linear-gradient(45deg, rgba(255,61,61,0.3), rgba(255,61,61,0.3) 2px, transparent 2px, transparent 4px)", border: "1px dashed rgba(255,61,61,0.4)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>Slippage</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 2, height: 12, background: GANTT_TODAY_HEX }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>Today</span>
        </div>
        {smartMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 16, height: 6, borderRadius: "0 3px 3px 0", background: "repeating-linear-gradient(45deg, transparent, transparent 4px, var(--status-error) 4px, var(--status-error) 5px)", opacity: 0.3, border: "1px dashed var(--status-error)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)" }}>AI Predicted Delay</span>
          </div>
        )}
      </div>

      <PhoenixPanel style={{ position: "relative" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Loading...</div>
        ) : filteredTasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>No look-ahead items found. Add activities from the Look-Ahead Schedule page.</div>
        ) : (
          <div style={{ display: "flex", overflow: "hidden" }}>
            <TaskList
              tasks={visibleRows}
              selectedId={selectedId}
              onSelect={handleRowClick}
              onHover={setHoveredId}
              hoveredId={hoveredId}
              collapsedPhases={collapsedPhases}
              onTogglePhase={togglePhase}
              smartMode={smartMode}
              cutId={clipboard?.mode === "cut" ? clipboard?.task?.id : null}
              dependencyPickSourceId={dependencyPick?.sourceId || parentPick?.childId || null}
            />
            <Timeline
              tasks={visibleRows}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              zoom={zoom}
              dateRange={dateRange}
              smartMode={smartMode}
            />
            {showDetail && selectedTask && <DetailPanel task={selectedTask} onClose={() => { setShowDetail(false); setSelectedId(null); }} />}
          </div>
        )}
      </PhoenixPanel>

      {dependencyPick && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--status-warning)",
            color: "#111",
            padding: "8px 16px",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
            zIndex: 900,
          }}
        >
          DEPENDENCY PICK MODE — click the predecessor task · Esc to cancel
        </div>
      )}

      {parentPick && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--accent)",
            color: "#fff",
            padding: "8px 16px",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
            zIndex: 900,
          }}
        >
          ↳ SUBTASK PICK MODE — click the task that will become the parent · Esc to cancel
        </div>
      )}

      {menu && (
        <GanttContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
