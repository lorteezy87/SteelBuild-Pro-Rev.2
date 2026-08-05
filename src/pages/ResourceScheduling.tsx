import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { useProjectContext } from "../components/shared/ProjectContext";
import { toast } from "sonner";
import { wpBudgetHoursForResource } from "@/lib/wpHoursForResource";
import { addWorkdays, hoursToWorkdays, workdaysToCalendarDays } from "@/lib/workweek";
import {
  addDays, snapToMonday, fmt,
  PHASE_COLORS, PX_PER_DAY,
  injectKeyframes,
  getBarStyle as computeBarStyle,
  buildTimelineHeaders,
  buildMonthBanners,
  computeTodayOffset,
  computeTimelineWindow,
  computeCapacityFromWorkPackages,
} from "./resourceScheduling/utils";
import CapacityView from "./resourceScheduling/CapacityView";
import NewResourceDialog from "./resourceScheduling/NewResourceDialog";
import WPContextMenu from "./resourceScheduling/WPContextMenu";
import TimelineHeaderRaw from "./resourceScheduling/TimelineHeader";
import ResourceRow from "./resourceScheduling/ResourceRow";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { OperationsPageShell, OpsActionButton, OpsFilterPanel } from "@/components/operations/OperationsPageShell";
import { Plus } from "lucide-react";
import { buildResourceGuruPlanning } from "@/lib/resourcePlanning";
import {
  ResourceGuruCommandStrip,
  SchedulingToolbar,
  BoardEmptyState,
  HoursSummaryStrip,
  ResourcesSidebar,
  DragTooltipOverlay,
  HoverTooltipOverlay,
  UndoToastBanner,
} from "./resourceScheduling/components";
import { buildScheduleStats } from "./resourceScheduling/format";
import {
  filterTopLevelResources,
  buildMembersByParentId,
  buildEffectiveCapacityById,
  buildDisplayResources,
  filterWorkPackagesByPhase,
  partitionScheduledWorkPackages,
  filterFocusedDisplayResources,
  isShopWorkPackage,
  toIsoDate,
} from "./resourceScheduling/resourceSchedulingHelpers";

// Only mounted while the edit dialog is open — keep it off the board's chunk.
const ResourceFormModal = lazyWithRetry(() => import("@/components/resources/ResourceFormModal"));

// One-shot keyframe injection - must run at module load, not render.
injectKeyframes();

// TimelineHeader is a still-.jsx forwardRef component; cast at the boundary.
const TimelineHeader = TimelineHeaderRaw as any;


// ----------------------------------------------------------------------
// MAIN COMPONENT
// ----------------------------------------------------------------------

export default function ResourceScheduling() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const boardRef = useRef(null);
  const timelineRef = useRef(null);
  const dragRef = useRef(null);
  const ghostRef = useRef(null);

  // UI State
  const [viewMode, setViewMode] = useState("board"); // board | capacity
  const [zoomMode, setZoomMode] = useState("week");
  const [filterPhase, setFilterPhase] = useState("all");
  const [dragTooltip, setDragTooltip] = useState(null);
  const [undoToast, setUndoToast] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [hoverTooltip, setHoverTooltip] = useState(null);
  const [showNewResource, setShowNewResource] = useState(false);
  const [resourceFocus, setResourceFocus] = useState("all");
  const emptyNewRes = { name: "", resource_type: "Person", role: "", capacity: "", unit: "hours", cost_rate: "", availability: "Available", notes: "", parent_resource_id: "" };
  const [newRes, setNewRes] = useState(emptyNewRes);

  const createResMut = useMutation({
    mutationFn: (data: any) => entities.Resource.create({ ...data, project_id: activeProject?.id, project_name: activeProject?.name || "" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      setShowNewResource(false);
      setNewRes(emptyNewRes);
      toast.success("Resource created");
    },
    onError: (err) => toast.error(err.message || "Failed to create resource"),
  });

  // The board could create resources but never edit them, so a resource added
  // here had no edit path at all. ResourceFormModal hands back a payload
  // already mapped to the `resources` columns, so it goes straight through.
  const [editingResource, setEditingResource] = useState<any>(null);
  const updateResMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => entities.Resource.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      setEditingResource(null);
      toast.success("Resource updated");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update resource"),
  });

  // Data queries
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      return entities.WorkPackage.filter({
        project_id: activeProject.id,
      });
    },
  });

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      return entities.Resource.filter({
        project_id: activeProject.id,
      });
    },
  });

  // -- Crew hierarchy ----------------------------------------------------------------------
  // parent_resource_id (migration 043) lets a crew contain individual
  // members. The board renders ONE row per top-level resource; a crew's
  // effective capacity is its own capacity PLUS the sum of its direct
  // members' capacities. Members can be toggled visible under the crew
  // row via the expand chevron.
  const topLevelResources = useMemo(
    () => filterTopLevelResources(resources),
    [resources],
  );
  const membersByParentId = useMemo(
    () => buildMembersByParentId(resources),
    [resources],
  );
  const effectiveCapacityById = useMemo(
    () => buildEffectiveCapacityById(resources),
    [resources],
  );

  // Expand/collapse state for crew rows. Crew IDs in this set show their
  // members below the crew row.
  const [expandedCrews, setExpandedCrews] = useState<Set<string>>(() => new Set());
  const toggleCrew = useCallback((crewId) => {
    setExpandedCrews(prev => {
      const next = new Set(prev);
      if (next.has(crewId)) next.delete(crewId);
      else next.add(crewId);
      return next;
    });
  }, []);

  // Flat display list for the board: crew rows + (when expanded) their
  // members indented underneath. Individual resources without a parent
  // appear as their own row, same as before. Members whose parent is
  // collapsed are hidden.
  const displayResources = useMemo(
    () => buildDisplayResources(topLevelResources, membersByParentId, expandedCrews),
    [topLevelResources, membersByParentId, expandedCrews],
  );

  // Capacity view data (uses same workPackages query)
  const capacity = useMemo(() => computeCapacityFromWorkPackages(workPackages), [workPackages]);

  const { timelineStart, timelineEnd } = useMemo(
    () => computeTimelineWindow(workPackages),
    [workPackages],
  );

  const pxPerDay = PX_PER_DAY[zoomMode];

  const getBarStyle = useCallback(
    (wp: any) => computeBarStyle(wp, timelineStart, pxPerDay),
    [timelineStart, pxPerDay],
  );

  const headers = useMemo(
    () => buildTimelineHeaders(zoomMode, timelineStart, timelineEnd, pxPerDay),
    [zoomMode, timelineStart, timelineEnd, pxPerDay],
  );

  const monthBanners = useMemo(
    () => buildMonthBanners(zoomMode, headers),
    [zoomMode, headers],
  );

  // Filter WPs
  const filteredWorkPackages = useMemo(
    () => filterWorkPackagesByPhase(workPackages, filterPhase),
    [workPackages, filterPhase],
  );
  const { scheduled: scheduledWps, unscheduled: unscheduledWps } = useMemo(
    () => partitionScheduledWorkPackages(filteredWorkPackages),
    [filteredWorkPackages],
  );

  const resourceGuruPlan = useMemo(
    () => buildResourceGuruPlanning({
      resources,
      workPackages: filteredWorkPackages,
      scheduledWorkPackages: scheduledWps,
      effectiveCapacityById,
    }),
    [effectiveCapacityById, filteredWorkPackages, resources, scheduledWps],
  );

  const focusedDisplayResources = useMemo(
    () => filterFocusedDisplayResources(displayResources, resourceFocus, resourceGuruPlan.rowById),
    [displayResources, resourceFocus, resourceGuruPlan.rowById],
  );

  const scheduleStats = useMemo(
    () => buildScheduleStats(filteredWorkPackages, scheduledWps, topLevelResources, effectiveCapacityById),
    [filteredWorkPackages, scheduledWps, topLevelResources, effectiveCapacityById],
  );

  // Cleanup drag function
  const cleanupDrag = useCallback(() => {
    if (ghostRef.current) {
      try {
        document.body.removeChild(ghostRef.current);
      } catch {
        // Already removed
      }
      ghostRef.current = null;
    }

    if (dragRef.current?.barEl) {
      dragRef.current.barEl.style.opacity = "1";
      dragRef.current.barEl.style.outline = "none";
      dragRef.current.barEl.style.cursor = "grab";
    }

    boardRef.current?.querySelectorAll("[data-resource-id]").forEach((row) => {
      row.style.background = "";
      row.style.outline = "";
      row.style.boxShadow = "";
    });

    setDragTooltip(null);
    dragRef.current = null;
  }, []);

  // Close context menu on outside click. A "pointerdown" listener on
  // the document is the reliable way to detect "click anywhere outside
  // the menu". Using "click" misses some cases (touch, right-click
  // release on certain browsers) and adding the listener synchronously
  // after the right-click can catch stray events in the same tick;
  // defer the attach to the next microtask to avoid closing the menu
  // on the same event that opened it.
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e) => {
      // Don't close if the pointerdown is inside the menu itself.
      const menu = document.getElementById("rs-wp-context-menu");
      if (menu && menu.contains(e.target)) return;
      setContextMenu(null);
    };
    const t = setTimeout(() => {
      document.addEventListener("pointerdown", handler);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", handler);
    };
  }, [contextMenu]);

  // Escape key
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && dragRef.current) {
        cleanupDrag();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cleanupDrag]);

  // Window blur
  useEffect(() => {
    const onBlur = () => {
      if (dragRef.current) cleanupDrag();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [cleanupDrag]);

  // Pointer down on bar
  const onBarPointerDown = (e, wp, resourceId, resourceName) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    boardRef.current?.setPointerCapture(e.pointerId);

    const rect = e.currentTarget.getBoundingClientRect();

    // Create ghost
    const ghost = document.createElement("div");
    ghost.textContent = wp.name;
    ghost.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border-radius: 6px;
      background: ${PHASE_COLORS[wp.phase] || PHASE_COLORS.default};
      opacity: 0.88;
      pointer-events: none;
      z-index: 9999;
      border: 2px solid var(--accent);
      box-shadow: 0 8px 32px rgba(var(--status-warning-rgb, 245,158,11),0.5);
      cursor: grabbing;
      display: flex;
      align-items: center;
      padding: 0 10px;
      font-family: var(--font-body);
      font-size: 11px;
      font-weight: 600;
      color: white;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: none;
    `;
    document.body.appendChild(ghost);
    ghostRef.current = ghost;

    e.currentTarget.style.opacity = "0.25";
    e.currentTarget.style.outline = "2px dashed rgba(245,158,11,0.5)";

    const rawStart = wp.scheduled_start_date || wp.released_date;
    dragRef.current = {
      wpId: wp.id,
      wpName: wp.name,
      fromResourceId: resourceId,
      fromResourceName: resourceName,
      origStart: new Date(rawStart),
      origEnd: new Date(wp.scheduled_end_date),
      durationMs: +new Date(wp.scheduled_end_date) - +new Date(rawStart),
      barEl: e.currentTarget,
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      active: true,
    };
  };

  // Pointer move on board
  const onBoardPointerMove = (e) => {
    const d = dragRef.current;
    if (!d?.active) return;
    e.preventDefault();

    ghostRef.current.style.left = `${e.clientX - d.offsetX}px`;
    ghostRef.current.style.top = `${e.clientY - 20}px`;

    // Smart drop zones: capacity-aware glow (green = available, yellow = nearing, red = over)
    boardRef.current?.querySelectorAll("[data-resource-id]").forEach((row) => {
      const r = row.getBoundingClientRect();
      const hit = e.clientY >= r.top && e.clientY <= r.bottom;
      const resId = row.getAttribute("data-resource-id");
      const res = resources.find((r) => r.id === resId);
      const resCapacity = Number(effectiveCapacityById[resId] ?? res?.capacity ?? (res as any)?.budget_hours) || 0;
      const resAssigned = scheduledWps
        .filter((wp) => wp.crew === row.getAttribute("data-resource-name"))
        .reduce((s, wp) => s + (Number(wp.shop_hours_budget) || Number(wp.field_hours_budget) || 0), 0);
      const utilPct = resCapacity > 0 ? (resAssigned / resCapacity) * 100 : 0;
      const isOverAlloc = resCapacity > 0 && resAssigned >= resCapacity;

      if (hit) {
        // Strong highlight on hovered row
        const hoverColor = isOverAlloc ? "rgba(248,81,73,0.15)" : utilPct > 80 ? "rgba(227,179,65,0.12)" : "rgba(63,185,80,0.10)";
        const borderColor = isOverAlloc ? "rgba(248,81,73,0.5)" : utilPct > 80 ? "rgba(227,179,65,0.45)" : "rgba(63,185,80,0.4)";
        row.style.background = hoverColor;
        row.style.outline = `1px solid ${borderColor}`;
        row.style.boxShadow = `inset 0 0 16px ${borderColor.replace("0.5", "0.1").replace("0.45", "0.1").replace("0.4", "0.08")}`;
      } else {
        // Subtle capacity indicator on non-hovered rows
        const bgColor = isOverAlloc ? "rgba(248,81,73,0.04)" : utilPct > 80 ? "rgba(227,179,65,0.03)" : "rgba(63,185,80,0.02)";
        row.style.background = bgColor;
        row.style.outline = `1px dashed ${isOverAlloc ? "rgba(248,81,73,0.15)" : "rgba(200,155,32,0.12)"}`;
        row.style.boxShadow = "none";
      }
    });

    // Enhanced tooltip with projected dates + daily load calculation
    const timelineEl = timelineRef.current;
    if (timelineEl) {
      const tRect = timelineEl.getBoundingClientRect();
      const relX = e.clientX - tRect.left + timelineEl.scrollLeft;
      const daysIn = relX / pxPerDay;
      const newStart = addDays(timelineStart, Math.round(daysIn));
      const newEnd = new Date(newStart.getTime() + d.durationMs);
      const durationDays = Math.max(1, Math.round(d.durationMs / 86400000));

      // Calculate daily load from WP budget hours
      const wp = workPackages.find((w) => w.id === d.wpId);
      const totalHrs = Number(wp?.shop_hours_budget) || Number(wp?.field_hours_budget) || 0;
      const dailyLoad = totalHrs > 0 ? (totalHrs / durationDays).toFixed(1) : null;
      const isShop = isShopWorkPackage(wp);

      setDragTooltip({
        x: e.clientX,
        y: e.clientY - 54,
        text: `${fmt(newStart)} → ${fmt(newEnd)} · ${durationDays}d`,
        subText: dailyLoad ? `${dailyLoad}h/day · ${totalHrs}h total · ${isShop ? "SHOP" : "FIELD"}` : null,
      });
    }
  };

  // Pointer up on board (drop)
  const onBoardPointerUp = async (e) => {
    const d = dragRef.current;
    if (!d?.active) return;
    e.preventDefault();

    try {
      boardRef.current?.releasePointerCapture(d.pointerId);
    } catch {}

    const timelineEl = timelineRef.current;
    const tRect = timelineEl.getBoundingClientRect();
    const relX = e.clientX - tRect.left + timelineEl.scrollLeft;
    const daysIn = relX / pxPerDay;
    const rawStart = addDays(timelineStart, Math.round(daysIn));

    const newStart = snapToMonday(rawStart);
    const newEnd = new Date(newStart.getTime() + d.durationMs);

    // Find target resource
    let newResourceId = d.fromResourceId;
    let newResourceName = d.fromResourceName;
    boardRef.current?.querySelectorAll("[data-resource-id]").forEach((row) => {
      const r = row.getBoundingClientRect();
      const hit = e.clientY >= r.top && e.clientY <= r.bottom;
      if (hit) {
        newResourceId = row.getAttribute("data-resource-id");
        newResourceName = row.getAttribute("data-resource-name");
      }
    });

    // Cleanup visual state first
    cleanupDrag();

    // Auto-hour distribution: spread total budget hours evenly across duration
    // DB schema: work_packages has shop_hours_budget, shop_hours_actual,
    // field_hours_budget, field_hours_actual. Scheduling dates are on
    // scheduled_start_date / scheduled_end_date (migration 042).
    const droppedWp = workPackages.find((w) => w.id === d.wpId);
    const isShop = isShopWorkPackage(droppedWp);
    const totalEstHrs = Number(droppedWp?.shop_hours_budget) || Number(droppedWp?.field_hours_budget) || 0;
    const autoHours: Record<string, any> = {};
    if (totalEstHrs > 0) {
      if (isShop) {
        autoHours.shop_hours_budget = totalEstHrs;
      } else {
        autoHours.field_hours_budget = totalEstHrs;
      }
    }

    // Compute the new scheduling window. newStart comes from the drop
    // position above; newEnd was already computed on line ~551 from
    // newStart + d.durationMs. Reuse both here.
    const iso = toIsoDate;
    const newStartISO = iso(newStart);
    const newEndISO   = iso(newEnd);

    // Handle new assignment from unscheduled pool
    if (d.isNewAssignment) {
      qc.setQueryData(["work-packages", activeProject?.id], (prev) =>
        (prev as any[])?.map((wp) => wp.id === d.wpId ? {
          ...wp,
          scheduled_start_date: newStartISO,
          scheduled_end_date:   newEndISO,
          crew: newResourceName || "",
          ...autoHours,
        } : wp) || []
      );
      try {
        await entities.WorkPackage.update(d.wpId, {
          scheduled_start_date: newStartISO,
          scheduled_end_date:   newEndISO,
          crew: newResourceName || "",
          ...autoHours,
        });
        setUndoToast({ id: Date.now(), message: `${d.wpName} → ${newResourceName} · ${fmt(newStart)}` });
      } catch (err) {
        console.error("Assignment failed:", err);
        qc.invalidateQueries({ queryKey: ["work-packages"] });
        qc.invalidateQueries({ queryKey: ["wps-all"] });
        setUndoToast({ id: Date.now(), message: `Failed to assign ${d.wpName}: ${err?.message || "unknown"}` });
      }
      setTimeout(() => setUndoToast(null), 5000);
      return;
    }

    const dateChanged =
      newStart.toDateString() !== d.origStart.toDateString();
    const resourceChanged = newResourceId !== d.fromResourceId;

    if (!dateChanged && !resourceChanged) return;

    // Optimistic update (local cache only). Writes scheduled_start_date
    // and scheduled_end_date - the new bar window comes from drop position
    // plus preserved duration computed above.
    qc.setQueryData(
      ["work-packages", activeProject?.id],
      (prev) =>
        (prev as any[])?.map((wp) =>
          wp.id === d.wpId
            ? {
                ...wp,
                scheduled_start_date: newStartISO,
                scheduled_end_date:   newEndISO,
                ...(resourceChanged && { crew: newResourceName }),
                ...autoHours,
              }
            : wp
        ) || []
    );

    const toastMsg =
      `${d.wpName} → ${fmt(newStart)}` +
      (resourceChanged ? ` · ${newResourceName}` : "");
    setUndoToast({ id: Date.now(), message: toastMsg });
    setTimeout(() => setUndoToast(null), 8000);

    try {
      const updatePayload: Record<string, any> = {
        scheduled_start_date: newStartISO,
        scheduled_end_date:   newEndISO,
        ...autoHours,
      };
      if (resourceChanged) updatePayload.crew = newResourceName;
      await entities.WorkPackage.update(d.wpId, updatePayload);
    } catch (err) {
      console.error("WP update failed:", err);
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      setUndoToast({
        id: Date.now(),
        message: `Save failed — ${d.wpName} reverted (${err?.message || "unknown"})`,
      });
      setTimeout(() => setUndoToast(null), 5000);
    }
  };

  // Pointer down on unscheduled WP card
  const onUnscheduledPointerDown = (e, wp) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    boardRef.current?.setPointerCapture(e.pointerId);

    const rect = e.currentTarget.getBoundingClientRect();
    // Derive an initial duration for the dropped WP. Prefer the WP's own
    // budget hours - workdays. Fall back to tonnage (2T / workday) when
    // hours aren't set. Converted to calendar days so the bar spans the
    // correct calendar window (5 workdays = 7 calendar days, not 5).
    const wpBudgetHrs = wpBudgetHoursForResource(wp);
    const estWorkdays = wpBudgetHrs > 0
      ? hoursToWorkdays(wpBudgetHrs)
      : Math.max(3, Math.ceil((Number(wp.tonnage) || 0) / 2));
    const estCalendarDays = workdaysToCalendarDays(estWorkdays);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ghost = document.createElement("div");
    ghost.textContent = wp.name;
    ghost.style.cssText = `
      position: fixed; left: ${rect.left}px; top: ${rect.top}px;
      width: 160px; height: 36px; border-radius: 6px;
      background: ${PHASE_COLORS[wp.phase] || PHASE_COLORS.default};
      opacity: 0.88; pointer-events: none; z-index: 9999;
      border: 2px dashed var(--status-warning-bright); box-shadow: 0 8px 32px rgba(255,179,0,0.4);
      cursor: grabbing; display: flex; align-items: center; padding: 0 10px;
      font-family: var(--font-body); font-size: 11px; font-weight: 600;
      color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      user-select: none;
    `;
    document.body.appendChild(ghost);
    ghostRef.current = ghost;

    dragRef.current = {
      wpId: wp.id,
      wpName: wp.name,
      fromResourceId: null,
      fromResourceName: null,
      origStart: today,
      origEnd: addWorkdays(today, estWorkdays),
      durationMs: estCalendarDays * 86400000,
      barEl: e.currentTarget,
      pointerId: e.pointerId,
      offsetX: 70,
      active: true,
      isNewAssignment: true,
    };
  };

  const todayOffset = computeTodayOffset(timelineStart, pxPerDay);

  // Auto-scroll to today when the board mounts or timeline changes
  useEffect(() => {
    if (boardRef.current && todayOffset > 0) {
      boardRef.current.scrollLeft = Math.max(0, todayOffset - 300);
    }
  }, [todayOffset]);

  return (
    <div className="sb-dashboard-reference-page">
    <OperationsPageShell
      eyebrow={activeProject?.name || "No Project Selected"}
      title="Crew Scheduling"
      subtitle="Plan crew lanes, capacity, unscheduled work packages, and drag-to-assign dates in one field-ready scheduling board."
      fullHeight
      meta={[
        { label: "Resources", value: resources.length },
        { label: "People", value: resourceGuruPlan.personnelCount },
        { label: "Work Packages", value: filteredWorkPackages.length },
        { label: "Unscheduled", value: unscheduledWps.length, color: unscheduledWps.length > 0 ? "var(--status-warning)" : "var(--status-success)" },
        { label: "Clashes", value: resourceGuruPlan.clashCount, color: resourceGuruPlan.clashCount > 0 ? "var(--status-error)" : "var(--status-success)" },
      ]}
      metrics={[
        { label: "Estimated Hours", value: `${scheduleStats.totalBudgetHrs.toLocaleString()}h`, sub: `${filterPhase === "all" ? "All phases" : filterPhase}` },
        { label: "Actual Hours", value: `${scheduleStats.totalActualHrs.toLocaleString()}h`, sub: "Posted labor", color: scheduleStats.totalActualHrs > scheduleStats.totalBudgetHrs ? "var(--status-error)" : "var(--status-success)" },
        { label: "Assigned", value: `${scheduleStats.assignedWPCount} / ${filteredWorkPackages.length}`, sub: "Work packages", color: scheduleStats.unassignedCount > 0 ? "var(--status-warning)" : "var(--status-success)" },
        { label: "Availability", value: `${resourceGuruPlan.utilizationPct}%`, sub: `${resourceGuruPlan.openCapacityHours.toLocaleString()}h open`, color: resourceGuruPlan.utilizationPct > 100 ? "var(--status-error)" : resourceGuruPlan.utilizationPct > 85 ? "var(--status-warning)" : "var(--status-success)" },
      ]}
      actions={(
        <OpsActionButton variant="primary" onClick={() => setShowNewResource(true)} icon={<Plus size={13} />}>
          New Resource
        </OpsActionButton>
      )}
    >
      {/* TOOLBAR */}
      <OpsFilterPanel>
        <SchedulingToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          zoomMode={zoomMode}
          onZoomModeChange={setZoomMode}
          filterPhase={filterPhase}
          onFilterPhaseChange={setFilterPhase}
        />
      </OpsFilterPanel>

      <ResourceGuruCommandStrip
        plan={resourceGuruPlan}
        focus={resourceFocus}
        onFocusChange={setResourceFocus}
      />

      {/* New Resource Modal */}
      <NewResourceDialog
        open={showNewResource}
        newRes={newRes}
        setNewRes={setNewRes}
        topLevelResources={topLevelResources}
        createResMut={createResMut}
        onClose={() => setShowNewResource(false)}
      />

      {/* Edit Resource Modal — reuses the register's form so both surfaces
          write the exact same column mapping. */}
      {editingResource && (
        <React.Suspense fallback={null}>
          <ResourceFormModal
            projectId={activeProject?.id}
            editing={editingResource}
            onClose={() => setEditingResource(null)}
            onSave={(data: any) => updateResMut.mutate({ id: editingResource.id, data })}
          />
        </React.Suspense>
      )}

      {/* Capacity view */}
      {viewMode === "capacity" && (
        <CapacityView capacity={capacity} workPackages={workPackages} />
      )}

      {/* Board view */}
      {viewMode === "board" && (
      <>
      {/* HERO EMPTY STATE ? no resources or WPs yet */}
      {resources.length === 0 && workPackages.length === 0 && (
        <BoardEmptyState onAddResource={() => setShowNewResource(true)} />
      )}
      <HoursSummaryStrip stats={scheduleStats} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <ResourcesSidebar
          topLevelResources={topLevelResources}
          scheduledWps={scheduledWps}
          effectiveCapacityById={effectiveCapacityById}
          membersByParentId={membersByParentId}
          unscheduledWps={unscheduledWps}
          onUnscheduledPointerDown={onUnscheduledPointerDown}
          onOpenContextMenu={setContextMenu}
        />

        {/* RIGHT PANEL ? Timeline Board */}
        <div
          ref={boardRef}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
          onPointerCancel={cleanupDrag}
          style={{
            flex: 1,
            overflow: "auto",
            // Previously --bg-sidebar, which is a near-black in dark mode
            // but navy (#1E293B) in light mode - painted the whole timeline
            // board dark blue and swallowed every work-package bar.
            // bg-surface-low reads as a distinct-but-light chart backdrop
            // in both themes.
            background: "var(--bg-surface-low)",
            position: "relative",
            userSelect: "none",
            touchAction: "none",
          }}
        >
          <TimelineHeader
            ref={timelineRef}
            zoomMode={zoomMode}
            monthBanners={monthBanners}
            headers={headers}
          />

          {/* RESOURCE ROWS */}
          {focusedDisplayResources.map((entry, idx) => (
            <ResourceRow
              key={entry.resource.id}
              entry={entry}
              idx={idx}
              scheduledWps={scheduledWps}
              effectiveCapacityById={effectiveCapacityById}
              expandedCrews={expandedCrews}
              onToggleCrew={toggleCrew}
              getBarStyle={getBarStyle}
              todayOffset={todayOffset}
              onBarPointerDown={onBarPointerDown}
              onOpenContextMenu={setContextMenu}
              onEditResource={setEditingResource}
              onBarHoverEnter={(e, wp) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const shopBud = Number(wp.shop_hours_budget) || 0;
                const shopAct = Number(wp.shop_hours_actual) || 0;
                const fieldBud = Number(wp.field_hours_budget) || 0;
                const fieldAct = Number(wp.field_hours_actual) || 0;
                setHoverTooltip({
                  x: rect.left + rect.width / 2,
                  y: rect.top - 8,
                  wp,
                  shopBud, shopAct, fieldBud, fieldAct,
                  totalBud: shopBud + fieldBud,
                  totalAct: shopAct + fieldAct,
                });
              }}
              onBarHoverLeave={() => setHoverTooltip(null)}
            />
          ))}
        </div>
      </div>

      <DragTooltipOverlay tooltip={dragTooltip} />
      <HoverTooltipOverlay tooltip={hoverTooltip} />

      {/* Context Menu */}
      <WPContextMenu
        contextMenu={contextMenu}
        resources={resources}
        qc={qc}
        onClose={() => setContextMenu(null)}
        onToast={(msg) => {
          setUndoToast({ id: Date.now(), message: msg });
          setTimeout(() => setUndoToast(null), 5000);
        }}
      />

      <UndoToastBanner toast={undoToast} />
      </>
      )}
    </OperationsPageShell>
    </div>
  );
}
