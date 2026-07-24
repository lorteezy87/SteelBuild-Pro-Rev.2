import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { useProjectContext } from "../components/shared/ProjectContext";
import { toast } from "sonner";
import { wpBudgetHoursForResource, wpActualHoursForResource } from "@/lib/wpHoursForResource";
import { addWorkdays, hoursToWorkdays, workdaysToCalendarDays } from "@/lib/workweek";
import {
  addDays, snapToMonday, fmt,
  PHASE_COLORS, PX_PER_DAY,
  GHOST_RESOURCES_SCHED,
  extractSkillsRS, getRowCapacityBg,
  injectKeyframes,
} from "./resourceScheduling/utils";
import {
  filterTopLevelResources,
  buildMembersByParentId,
  buildEffectiveCapacityById,
  buildDisplayResources,
  computeCapacitySummary,
  computeTimelineWindow,
  getBarStyle as computeBarStyle,
  buildTimelineHeaders,
  buildMonthBanners,
  filterWorkPackagesByPhase,
  partitionScheduledWorkPackages,
  filterFocusedDisplayResources,
  computeScheduleStats,
  computeTodayOffset,
  isShopWorkPackage,
  toIsoDate,
} from "./resourceScheduling/resourceSchedulingHelpers";
import CapacityView from "./resourceScheduling/CapacityView";
import NewResourceDialog from "./resourceScheduling/NewResourceDialog";
import WPContextMenu from "./resourceScheduling/WPContextMenu";
import TimelineHeaderRaw from "./resourceScheduling/TimelineHeader";
import UnscheduledTray from "./resourceScheduling/UnscheduledTray";
import ResourceRow from "./resourceScheduling/ResourceRow";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { OperationsPageShell, OpsActionButton, OpsFilterPanel } from "@/components/operations/OperationsPageShell";
import { Plus } from "lucide-react";
import { buildResourceGuruPlanning } from "@/lib/resourcePlanning";
import { ResourceGuruCommandStrip } from "./resourceScheduling/components";

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

  // Effective capacity = own + sum of direct children.
  const effectiveCapacityById = useMemo(
    () => buildEffectiveCapacityById(resources),
    [resources],
  );

  // Expand/collapse state for crew rows. Crew IDs in this set show their
  // members below the crew row.
  const [expandedCrews, setExpandedCrews] = useState(() => new Set<string>());
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
  const capacity = useMemo(
    () => computeCapacitySummary(workPackages),
    [workPackages],
  );

  // Calculate timeline window from actual WP scheduling dates.
  // scheduled_start_date / scheduled_end_date were added in migration 042.
  // released_date is kept as a fallback start (the date the package was
  // released to the shop) so legacy WPs without a scheduling window still
  // anchor the timeline.
  const { timelineStart, timelineEnd, totalDays } = useMemo(
    () => computeTimelineWindow(workPackages),
    [workPackages],
  );

  const pxPerDay = PX_PER_DAY[zoomMode];

  // Calculate bar position
  const getBarStyle = useCallback(
    (wp: any) => computeBarStyle(wp, timelineStart, pxPerDay),
    [timelineStart, pxPerDay],
  );

  const headers = useMemo(
    () => buildTimelineHeaders({ zoomMode, timelineStart, timelineEnd, pxPerDay }),
    [zoomMode, timelineStart, timelineEnd, pxPerDay],
  );

  // Build month banners for month view
  const monthBanners = useMemo(
    () => buildMonthBanners(zoomMode, headers),
    [zoomMode, headers],
  );

  // Filter WPs
  const filteredWorkPackages = useMemo(
    () => filterWorkPackagesByPhase(workPackages, filterPhase),
    [workPackages, filterPhase],
  );

  // Separate scheduled vs unscheduled
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
    () => filterFocusedDisplayResources(
      displayResources,
      resourceFocus,
      resourceGuruPlan.rowById,
    ),
    [displayResources, resourceFocus, resourceGuruPlan.rowById],
  );

  const scheduleStats = useMemo(
    () => computeScheduleStats({
      filteredWorkPackages,
      scheduledWps,
      topLevelResources,
      effectiveCapacityById,
    }),
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
    const newStartISO = toIsoDate(newStart);
    const newEndISO   = toIsoDate(newEnd);

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

  // Today line offset - normalize both dates to midnight to avoid DST errors
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
        {/* View toggle */}
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
          {[{ id: "board", label: "Board" }, { id: "capacity", label: "Capacity" }].map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)} style={{
              padding: "6px 12px",
              border: "none",
              borderRight: v.id !== "capacity" ? "1px solid var(--border-default)" : "none",
              background: viewMode === v.id ? "var(--accent-muted)" : "transparent",
              color: viewMode === v.id ? "var(--accent)" : "var(--text-secondary)",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
            }}>{v.label}</button>
          ))}
        </div>

        {/* Zoom buttons */}
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
          {["week", "month", "quarter"].map((mode, i) => (
            <button
              key={mode}
              onClick={() => setZoomMode(mode)}
              style={{
                padding: "6px 12px",
                border: "none",
                borderRight: i < 2 ? "1px solid var(--border-default)" : "none",
                background: zoomMode === mode ? "var(--accent-muted)" : "transparent",
                color: zoomMode === mode ? "var(--accent)" : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Phase filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {["all", "Detailing", "Fabrication", "Delivery", "Erection"].map((p) => {
            const phaseColor =
              p === "Detailing"   ? "var(--phase-detailing)"   :
              p === "Fabrication" ? "var(--phase-fabrication)" :
              p === "Delivery"    ? "var(--phase-delivery)"    :
              p === "Erection"    ? "var(--phase-erection)"    :
                                    "var(--accent)";
            const active = filterPhase === p;
            return (
              <button
                key={p}
                onClick={() => setFilterPhase(p)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: active ? `1px solid ${phaseColor}` : "1px solid var(--border-default)",
                  background: active ? "color-mix(in srgb, " + phaseColor + " 14%, transparent)" : "transparent",
                  color: active ? phaseColor : "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {p === "all" ? "All Phases" : p}
              </button>
            );
          })}
        </div>
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 40 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            No Resources Assigned
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", maxWidth: 380, textAlign: "center", lineHeight: 1.7 }}>
            Add crew, equipment, and work packages to start building your resource schedule. Drag work packages onto resources to assign them.
          </div>

          {/* Ghost placeholder rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 520, marginTop: 8 }}>
            {GHOST_RESOURCES_SCHED.map((ghost, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  background: "var(--bg-surface-low)",
                  border: "1px dashed var(--bg-surface-high)",
                  borderRadius: "var(--radius-card)",
                  animation: "rsGhostShimmer 2.5s ease-in-out infinite",
                  animationDelay: `${i * 0.35}s`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-disabled)" }}>{ghost.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)", marginTop: 2 }}>{ghost.role}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {ghost.skills.map((s) => (
                    <span key={s} style={{
                      fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
                      color: "var(--text-disabled)", background: "var(--hover-bg)",
                      border: "1px solid var(--divider)", borderRadius: 10,
                      padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.04em",
                    }}>{s}</span>
                  ))}
                </div>
                <div style={{
                  width: 100, height: 20, borderRadius: 4,
                  background: "var(--hover-bg)", border: "1px dashed var(--divider)",
                }} />
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              onClick={() => setShowNewResource(true)}
              style={{
                background: "var(--accent)", color: "var(--bg-base)", border: "none",
                borderRadius: "var(--radius-btn)", padding: "10px 24px",
                fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700,
                cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
                minHeight: 44, transition: "background 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; e.currentTarget.style.boxShadow = "var(--shadow-glow-gold)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              + Add First Resource
            </button>
          </div>
        </div>
      )}
      {/* HOURS SUMMARY STRIP */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8,
        padding: "8px 16px", borderBottom: "1px solid var(--divider)",
        background: "var(--bg-page)", flexShrink: 0,
      }}>
        {(() => {
          // Phase-aware totals: each WP contributes only its phase-relevant
          // hours bucket, so shop + field WPs don't double-count at the
          // portfolio stat.
          const totalBudgetHrs = filteredWorkPackages.reduce((s, wp) => s + wpBudgetHoursForResource(wp), 0);
          const totalActualHrs = filteredWorkPackages.reduce((s, wp) => s + wpActualHoursForResource(wp), 0);
          const totalShopBudget = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.shop_hours_budget) || 0), 0);
          const totalShopActual = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.shop_hours_actual) || 0), 0);
          const totalFieldBudget = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.field_hours_budget) || 0), 0);
          const totalFieldActual = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.field_hours_actual) || 0), 0);
          const assignedWPCount = scheduledWps.filter(wp => wp.crew).length;
          const unassignedCount = filteredWorkPackages.filter(wp => !wp.crew).length;
          // Count how many top-level resources are over-allocated. Over-
          // alloc = assigned WP budget > effective capacity (rollup from
          // crew members when applicable). Uses phase-aware hour bucketing
          // so a field crew isn't charged for a WP's shop hours and vice
          // versa.
          const overAllocatedResources = topLevelResources.filter(res => {
            const resWPs = scheduledWps.filter(wp => wp.crew === res.name);
            const resBudget = resWPs.reduce((s, wp) => s + wpBudgetHoursForResource(wp), 0);
            const effCap = effectiveCapacityById[res.id] || 0;
            return effCap > 0 && resBudget > effCap;
          }).length;
          return [
            { label: "TOTAL ESTIMATED", value: totalBudgetHrs.toLocaleString() + "h", color: "var(--accent)" },
            { label: "TOTAL ACTUAL", value: totalActualHrs.toLocaleString() + "h", color: totalActualHrs > totalBudgetHrs ? "var(--status-error)" : "var(--status-success)" },
            { label: "SHOP HRS", value: `${totalShopActual.toLocaleString()} / ${totalShopBudget.toLocaleString()}`, color: totalShopActual > totalShopBudget ? "var(--status-error)" : "var(--text-secondary)" },
            { label: "FIELD HRS", value: `${totalFieldActual.toLocaleString()} / ${totalFieldBudget.toLocaleString()}`, color: totalFieldActual > totalFieldBudget ? "var(--status-error)" : "var(--text-secondary)" },
            { label: "ASSIGNED / TOTAL", value: `${assignedWPCount} / ${filteredWorkPackages.length} WPs`, color: unassignedCount > 0 ? "var(--status-warning)" : "var(--status-success)" },
            { label: "OVER-ALLOCATED", value: overAllocatedResources, color: overAllocatedResources > 0 ? "var(--status-error)" : "var(--status-success)" },
          ].map(({ label, value, color }) => {
            const isOverAlloc = label === "OVER-ALLOCATED" && (value as number) > 0;
            return (
              <div key={label} style={{
                padding: "6px 10px", background: "var(--hover-bg)", borderRadius: 6,
                border: isOverAlloc ? "1px solid rgba(239,68,68,0.35)" : "1px solid var(--hover-bg)",
                animation: isOverAlloc ? "rsOverAllocPulse 2s ease-in-out infinite" : undefined,
                transition: "border-color 0.2s",
              }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, color }}>{value}</div>
              </div>
            );
          });
        })()}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* LEFT PANEL ? Allocation & Unscheduled */}
        <div
          style={{
            width: 260,
            background: "var(--bg-page)",
            borderRight: "1px solid var(--border-default)",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--status-warning)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 12,
              fontWeight: 700,
            }}
          >
            RESOURCES
          </div>

          {["Person", "Crew", "Labor", "Equipment", "Subcontractor", "Material", "Bay"].map(type => {
            // Only show top-level resources in the capacity stack - members
            // are rolled up into their crew's effective capacity.
            const typeResources = topLevelResources.filter(r => (r.resource_type || "Person") === type);
            if (typeResources.length === 0) return null;
            return (
              <div key={type}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
                    letterSpacing: "0.14em", textTransform: "uppercase", padding: "8px 0 4px",
                  borderBottom: "1px solid var(--border-default)", marginBottom: 6,
                }}>
                  {type} ({typeResources.length})
                </div>
                {typeResources.map(res => {
                  const assignedWPs = scheduledWps.filter(wp => wp.crew === res.name);
                  const resBudgetHrs = assignedWPs.reduce((s, wp) => s + wpBudgetHoursForResource(wp), 0);
                  const resActualHrs = assignedWPs.reduce((s, wp) => s + wpActualHoursForResource(wp), 0);
                  const resBurnPct = resBudgetHrs > 0 ? Math.round((resActualHrs / resBudgetHrs) * 100) : 0;
                  const isOverBudget = resActualHrs > resBudgetHrs && resBudgetHrs > 0;
                  // Effective capacity = own + sum of direct members' capacities
                  const resBudgetFromEntity = effectiveCapacityById[res.id] || 0;
                  const isOverAllocated = resBudgetFromEntity > 0 && resBudgetHrs > resBudgetFromEntity;
                  const resSkills = extractSkillsRS(res);
                  const memberCount = (membersByParentId[res.id] || []).length;
                  const heatBg = getRowCapacityBg(resBurnPct, isOverAllocated);
                  return (
                    <div key={res.id} style={{
                      background: isOverAllocated ? "rgba(239,68,68,0.06)" : heatBg !== "transparent" ? heatBg : "var(--bg-surface-low)",
                      border: isOverAllocated ? "1px solid rgba(239,68,68,0.20)" : "1px solid var(--divider)",
                      borderRadius: 8, padding: 8, marginBottom: 8,
                      transition: "background 0.2s, border-color 0.2s",
                    }}>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", fontWeight: 600, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                        {res.name}
                        {memberCount > 0 && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em" }}>
                            · {memberCount} MEMBER{memberCount === 1 ? "" : "S"}
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                        {res.role || "\u2014"}
                      </div>
                      {/* Skill tag badges */}
                      {resSkills.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                          {resSkills.map((sk, si) => (
                            <span key={si} style={{
                              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                              color: "var(--text-secondary)", background: "var(--hover-bg)",
                              border: "1px solid var(--bg-surface-high)", borderRadius: 8,
                              padding: "1px 5px", letterSpacing: "0.04em", textTransform: "uppercase",
                            }}>{sk}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 4, color: isOverBudget ? "var(--status-error)" : "var(--text-muted)", letterSpacing: "0.06em" }}>
                        {resBudgetHrs}h bud {"\u00B7"} {resActualHrs}h act {"\u00B7"} {resBurnPct}%
                      </div>
                      <div style={{ width: "100%", height: 3, borderRadius: 2, background: "var(--border-default)", marginTop: 3 }}>
                        <div style={{ width: `${Math.min(100, resBurnPct)}%`, height: "100%", borderRadius: 2, background: resBurnPct > 100 ? "var(--status-error)" : resBurnPct > 80 ? "var(--status-warning)" : "var(--accent)", transition: "width 0.4s" }} />
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                        {assignedWPs.length} WPs {"\u00B7"} {assignedWPs.reduce((s, wp) => s + (Number(wp.tonnage) || 0), 0)}T
                      </div>
                      {isOverAllocated && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 4, padding: "2px 6px", marginTop: 4, letterSpacing: "0.08em" }}>
                        {"\u26A0"} OVER-ALLOC ({resBudgetHrs}h / {resBudgetFromEntity}h cap)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <UnscheduledTray
            unscheduledWps={unscheduledWps}
            onPointerDown={onUnscheduledPointerDown}
            onOpenContextMenu={setContextMenu}
          />
        </div>

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

      {/* Drag Tooltip */}
      {dragTooltip && (
        <div
          style={{
            position: "fixed",
            left: dragTooltip.x,
            top: dragTooltip.y,
            transform: "translateX(-50%)",
            background: "var(--bg-surface-low)",
            border: "1px solid rgba(245,158,11,0.5)",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--status-warning)",
            fontWeight: 700,
            pointerEvents: "none",
            zIndex: 10001,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 16px rgba(0,0,0,0.7)",
          }}
        >
          {dragTooltip.text}
          {dragTooltip.subText && (
            <div style={{ fontSize: 9, fontWeight: 500, color: "var(--text-secondary)", marginTop: 2, letterSpacing: "0.03em" }}>
              {dragTooltip.subText}
            </div>
          )}
        </div>
      )}

      {/* Hover Tooltip */}
      {hoverTooltip && (
        <div style={{
          position: "fixed", left: hoverTooltip.x, top: hoverTooltip.y,
          transform: "translate(-50%, -100%)", background: "var(--bg-surface-low)",
          border: "1px solid rgba(var(--accent-rgb, 59,130,246),0.25)", borderRadius: 8,
          padding: "10px 14px", zIndex: 10001, pointerEvents: "none",
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)", minWidth: 200,
        }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
            {hoverTooltip.wp.wp_number} — {hoverTooltip.wp.name}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)", lineHeight: 1.8 }}>
            Phase: {hoverTooltip.wp.phase} {"\u00B7"} Status: {hoverTooltip.wp.status}<br/>
            Tonnage: {hoverTooltip.wp.tonnage || 0}T {"\u00B7"} Progress: {hoverTooltip.wp.percent_complete || 0}%<br/>
            Shop: {hoverTooltip.shopAct}h / {hoverTooltip.shopBud}h {"\u00B7"} Field: {hoverTooltip.fieldAct}h / {hoverTooltip.fieldBud}h<br/>
            <span style={{ color: hoverTooltip.totalAct > hoverTooltip.totalBud ? "var(--status-error-bright)" : "var(--status-success-bright)", fontWeight: 700 }}>
              Total: {hoverTooltip.totalAct}h / {hoverTooltip.totalBud}h ({hoverTooltip.totalBud > 0 ? Math.round((hoverTooltip.totalAct / hoverTooltip.totalBud) * 100) : 0}%)
            </span>
            {hoverTooltip.totalBud > 0 && (
              <><br/><span style={{ color: "var(--accent)", fontWeight: 600 }}>{"\u2248"} {hoursToWorkdays(hoverTooltip.totalBud)} workdays</span></>
            )}
          </div>
        </div>
      )}

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

      {/* Undo Toast */}
      {undoToast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: 20,
            background: "var(--bg-surface-low)",
            border: "1px solid rgba(0,214,143,0.30)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 11,
            fontFamily: "var(--font-body)",
            color: "var(--status-success)",
            zIndex: 9998,
            boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
          }}
        >
          ✓ {undoToast.message}
        </div>
      )}
      </>
      )}
    </OperationsPageShell>
    </div>
  );
}
