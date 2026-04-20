import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "../components/shared/useProjectContext";
import { toast } from "sonner";
import { wpBudgetHoursForResource, wpActualHoursForResource } from "@/lib/wpHoursForResource";
import { addWorkdays, hoursToWorkdays, workdaysToCalendarDays } from "@/lib/workweek";
import {
  addDays, subDays, snapToMonday, fmt, isThisWeek,
  PHASE_COLORS, PX_PER_DAY,
  GHOST_RESOURCES_SCHED,
  extractSkillsRS, getRowCapacityBg,
  injectKeyframes,
} from "./resourceScheduling/utils";
import CapacityView from "./resourceScheduling/CapacityView";
import NewResourceDialog from "./resourceScheduling/NewResourceDialog";
import WPContextMenu from "./resourceScheduling/WPContextMenu";
import TimelineHeader from "./resourceScheduling/TimelineHeader";
import UnscheduledTray from "./resourceScheduling/UnscheduledTray";

// One-shot keyframe injection — must run at module load, not render.
injectKeyframes();

// ──────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ──────────────────────────────────────────────────────────────────────

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
  const emptyNewRes = { name: "", resource_type: "Crew", role: "", capacity: "", unit: "hours", cost_rate: "", availability: "Available", notes: "", parent_resource_id: "" };
  const [newRes, setNewRes] = useState(emptyNewRes);

  const createResMut = useMutation({
    mutationFn: (data) => base44.entities.Resource.create({ ...data, project_id: activeProject?.id, project_name: activeProject?.name || "" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      setShowNewResource(false);
      setNewRes(emptyNewRes);
      toast.success("Resource created");
    },
    onError: (err) => toast.error(err.message || "Failed to create resource"),
  });

  // Data queries
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      return base44.entities.WorkPackage.filter({
        project_id: activeProject.id,
      });
    },
  });

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      return base44.entities.Resource.filter({
        project_id: activeProject.id,
      });
    },
  });

  // ── Crew hierarchy ──────────────────────────────────────────────────
  // parent_resource_id (migration 043) lets a crew contain individual
  // members. The board renders ONE row per top-level resource; a crew's
  // effective capacity is its own capacity PLUS the sum of its direct
  // members' capacities. Members can be toggled visible under the crew
  // row via the expand chevron.
  const topLevelResources = useMemo(
    () => resources.filter(r => !r.parent_resource_id),
    [resources],
  );
  const membersByParentId = useMemo(() => {
    const map = {};
    for (const r of resources) {
      if (r.parent_resource_id) {
        (map[r.parent_resource_id] = map[r.parent_resource_id] || []).push(r);
      }
    }
    return map;
  }, [resources]);

  // Effective capacity = own + sum of direct children.
  const effectiveCapacityById = useMemo(() => {
    const map = {};
    for (const r of resources) {
      map[r.id] = Number(r.capacity) || 0;
    }
    for (const r of resources) {
      if (r.parent_resource_id && map[r.parent_resource_id] !== undefined) {
        map[r.parent_resource_id] += Number(r.capacity) || 0;
      }
    }
    return map;
  }, [resources]);

  // Expand/collapse state for crew rows. Crew IDs in this set show their
  // members below the crew row.
  const [expandedCrews, setExpandedCrews] = useState(() => new Set());
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
  const displayResources = useMemo(() => {
    const out = [];
    for (const r of topLevelResources) {
      const children = membersByParentId[r.id] || [];
      out.push({ resource: r, isMember: false, hasMembers: children.length > 0, memberCount: children.length });
      if (expandedCrews.has(r.id)) {
        for (const c of children) out.push({ resource: c, isMember: true, hasMembers: false, memberCount: 0 });
      }
    }
    return out;
  }, [topLevelResources, membersByParentId, expandedCrews]);

  // Capacity view data (uses same workPackages query)
  const capacity = useMemo(() => {
    const wps = workPackages;
    const shopBudget = wps.reduce((s, w) => s + (Number(w.shop_hours_budget) || 0), 0);
    const shopActual = wps.reduce((s, w) => s + (Number(w.shop_hours_actual) || 0), 0);
    const shopRemaining = shopBudget - shopActual;
    const fieldBudget = wps.reduce((s, w) => s + (Number(w.field_hours_budget) || 0), 0);
    const fieldActual = wps.reduce((s, w) => s + (Number(w.field_hours_actual) || 0), 0);
    const fieldRemaining = fieldBudget - fieldActual;
    const totalTons = wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
    const inFabTons = wps.filter(w => w.phase === 'Fabrication' && w.status === 'In Progress').reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
    const byPhase = {
      Detailing: wps.filter(w => w.phase === 'Detailing' && !['Complete', 'On Hold'].includes(w.status)).length,
      Fabrication: wps.filter(w => w.phase === 'Fabrication' && !['Complete', 'On Hold'].includes(w.status)).length,
      Delivery: wps.filter(w => w.phase === 'Delivery' && !['Complete', 'On Hold'].includes(w.status)).length,
      Erection: wps.filter(w => w.phase === 'Erection' && !['Complete', 'On Hold'].includes(w.status)).length,
    };
    return { shopBudget, shopActual, shopRemaining, fieldBudget, fieldActual, fieldRemaining, totalTons, inFabTons, byPhase };
  }, [workPackages]);

  // Calculate timeline window from actual WP scheduling dates.
  // scheduled_start_date / scheduled_end_date were added in migration 042.
  // released_date is kept as a fallback start (the date the package was
  // released to the shop) so legacy WPs without a scheduling window still
  // anchor the timeline.
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    const starts = workPackages
      .filter((wp) => wp.scheduled_start_date || wp.released_date)
      .map((wp) => new Date(wp.scheduled_start_date || wp.released_date).getTime())
      .filter((t) => !isNaN(t));
    const ends = workPackages
      .filter((wp) => wp.scheduled_end_date)
      .map((wp) => new Date(wp.scheduled_end_date).getTime())
      .filter((t) => !isNaN(t));

    const tStart = starts.length > 0
      ? subDays(new Date(Math.min.apply(null, starts)), 14)
      : subDays(new Date(), 14);
    const tEnd = ends.length > 0
      ? addDays(new Date(Math.max.apply(null, ends)), 14)
      : addDays(new Date(), 60);

    const days = Math.ceil((tEnd - tStart) / 86400000);

    return {
      timelineStart: tStart,
      timelineEnd: tEnd,
      totalDays: days,
    };
  }, [workPackages]);

  const pxPerDay = PX_PER_DAY[zoomMode];
  const totalWidth = totalDays * pxPerDay;

  // Calculate bar position
  const getBarStyle = (wp) => {
    const rawStart = wp.scheduled_start_date || wp.released_date;
    if (!rawStart || !wp.scheduled_end_date) return null;

    const start = new Date(rawStart);
    // wp.scheduled_end_date guaranteed non-null by the guard above.
    const end = new Date(wp.scheduled_end_date);
    const left = Math.round(
      ((start - timelineStart) / 86400000) * pxPerDay
    );
    const width = Math.max(
      Math.round(((end - start) / 86400000) * pxPerDay),
      pxPerDay * 2
    );
    const duration = Math.round((end - start) / 86400000);

    return { left, width, duration };
  };

  // Build timeline headers
  const buildHeaders = useCallback(() => {
    const headers = [];
    let cursor = new Date(timelineStart);
    cursor.setHours(0, 0, 0, 0);

    if (zoomMode === "week") {
      while (cursor < timelineEnd) {
        headers.push({
          label: cursor.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          subLabel: cursor.toLocaleDateString("en-US", {
            weekday: "short",
          }),
          width: pxPerDay * 7,
          isToday: isThisWeek(cursor),
          date: new Date(cursor),
        });
        cursor = addDays(cursor, 7);
      }
    } else if (zoomMode === "month") {
      while (cursor < timelineEnd) {
        headers.push({
          label: cursor.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          subLabel: cursor.toLocaleDateString("en-US", {
            year: "numeric",
          }),
          width: pxPerDay * 7,
          isToday: isThisWeek(cursor),
          month: cursor.getMonth(),
          date: new Date(cursor),
        });
        cursor = addDays(cursor, 7);
      }
    } else if (zoomMode === "quarter") {
      while (cursor < timelineEnd) {
        headers.push({
          label: cursor.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          width: pxPerDay * 14,
          isToday: false,
          date: new Date(cursor),
        });
        cursor = addDays(cursor, 14);
      }
    }

    return headers;
  }, [zoomMode, timelineStart, timelineEnd, pxPerDay]);

  const headers = buildHeaders();

  // Build month banners for month view
  const monthBanners = useMemo(() => {
    if (zoomMode !== "month") return [];

    const banners = [];
    let currentMonth = -1;
    let currentWidth = 0;
    let currentLabel = "";

    headers.forEach((h) => {
      if (h.month !== currentMonth) {
        if (currentMonth !== -1) {
          banners.push({ label: currentLabel, width: currentWidth });
        }
        currentMonth = h.month;
        currentLabel = new Date(h.date).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });
        currentWidth = h.width;
      } else {
        currentWidth += h.width;
      }
    });

    if (currentLabel) {
      banners.push({ label: currentLabel, width: currentWidth });
    }

    return banners;
  }, [zoomMode, headers]);

  // Filter WPs
  const filteredWorkPackages = useMemo(() => {
    return workPackages.filter((wp) => {
      const phaseMatch = filterPhase === "all" || wp.phase === filterPhase;
      return phaseMatch;
    });
  }, [workPackages, filterPhase]);

  // Separate scheduled vs unscheduled
  const scheduledWps = filteredWorkPackages.filter(
    (wp) => (wp.scheduled_start_date || wp.released_date) && wp.scheduled_end_date
  );
  const unscheduledWps = filteredWorkPackages.filter(
    (wp) => !(wp.scheduled_start_date || wp.released_date) || !wp.scheduled_end_date
  );

  // Cleanup drag function
  const cleanupDrag = useCallback(() => {
    if (ghostRef.current) {
      try {
        document.body.removeChild(ghostRef.current);
      } catch (e) {
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
      durationMs: new Date(wp.scheduled_end_date) - new Date(rawStart),
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
      const resCapacity = Number(res?.capacity || res?.budget_hours) || 0;
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
      const isShop = wp?.location === "Shop" || wp?.phase === "Fabrication" || wp?.phase === "Detailing";

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
    } catch (_) {}

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
    const durationDays = Math.max(1, Math.round(d.durationMs / 86400000));
    const isShop = droppedWp?.location === "Shop" || droppedWp?.phase === "Fabrication" || droppedWp?.phase === "Detailing";
    const totalEstHrs = Number(droppedWp?.shop_hours_budget) || Number(droppedWp?.field_hours_budget) || 0;
    const autoHours = {};
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
    const iso = (dt) => dt.toISOString().split("T")[0];
    const newStartISO = iso(newStart);
    const newEndISO   = iso(newEnd);

    // Handle new assignment from unscheduled pool
    if (d.isNewAssignment) {
      qc.setQueryData(["work-packages", activeProject?.id], (prev) =>
        prev?.map((wp) => wp.id === d.wpId ? {
          ...wp,
          scheduled_start_date: newStartISO,
          scheduled_end_date:   newEndISO,
          crew: newResourceName || "",
          ...autoHours,
        } : wp) || []
      );
      try {
        await base44.entities.WorkPackage.update(d.wpId, {
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
    // and scheduled_end_date — the new bar window comes from drop position
    // plus preserved duration computed above.
    qc.setQueryData(
      ["work-packages", activeProject?.id],
      (prev) =>
        prev?.map((wp) =>
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
      const updatePayload = {
        scheduled_start_date: newStartISO,
        scheduled_end_date:   newEndISO,
        ...autoHours,
      };
      if (resourceChanged) updatePayload.crew = newResourceName;
      await base44.entities.WorkPackage.update(d.wpId, updatePayload);
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
    // budget hours → workdays. Fall back to tonnage (2T / workday) when
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
      border: 2px dashed #FFB300; box-shadow: 0 8px 32px rgba(255,179,0,0.4);
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

  // Today line offset — normalize both dates to midnight to avoid DST errors
  const todayOffset = Math.round(
    (() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tStart = new Date(timelineStart);
      tStart.setHours(0, 0, 0, 0);
      return ((today - tStart) / 86400000) * pxPerDay;
    })()
  );

  // Auto-scroll to today when the board mounts or timeline changes
  useEffect(() => {
    if (boardRef.current && todayOffset > 0) {
      boardRef.current.scrollLeft = Math.max(0, todayOffset - 300);
    }
  }, [todayOffset]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-page)",
      }}
    >
      {/* PROJECT SELECTOR */}
      <div
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--divider)",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          PROJECT
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--status-warning)",
            fontWeight: 600,
          }}
        >
          {activeProject?.name || "No project selected"}
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--text-secondary)",
            marginLeft: "auto",
          }}
        >
          {resources.length} resources · {filteredWorkPackages.length} work packages
        </div>
      </div>

      {/* TOOLBAR */}
      <div
        style={{
          background: "var(--bg-page)",
          borderBottom: "1px solid var(--border-default)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
        >
          RESOURCE BOARD
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", gap: 4 }}>
          {[{ id: "board", label: "⊞ Board" }, { id: "capacity", label: "◎ Capacity" }].map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)} style={{
              padding: "4px 12px", borderRadius: 6,
              border: viewMode === v.id ? "1px solid var(--accent)" : "1px solid var(--border-default)",
              background: viewMode === v.id ? "rgba(0,229,255,0.06)" : "transparent",
              color: viewMode === v.id ? "var(--accent)" : "var(--text-secondary)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.1s",
            }}>{v.label}</button>
          ))}
        </div>

        {/* Zoom buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {["week", "month", "quarter"].map((mode) => (
            <button
              key={mode}
              onClick={() => setZoomMode(mode)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border:
                  zoomMode === mode
                    ? "1px solid var(--accent)"
                    : "1px solid var(--border-default)",
                    background:
                    zoomMode === mode ? "rgba(245,158,11,0.12)" : "transparent",
                    color:
                    zoomMode === mode
                      ? "var(--status-warning)"
                      : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.08em",
                cursor: "pointer",
                transition: "all 0.1s",
              }}
            >
              {mode === "week" ? "Week" : mode === "month" ? "Month" : "Quarter"}
            </button>
          ))}
        </div>

        {/* Phase filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {["all", "Detailing", "Fabrication", "Delivery", "Erection"].map(
            (p) => (
              <button
                key={p}
                onClick={() => setFilterPhase(p)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border:
                    filterPhase === p
                      ? "1px solid var(--accent)"
                        : "1px solid var(--border-default)",
                      background:
                        filterPhase === p
                          ? "rgba(245,158,11,0.08)"
                          : "transparent",
                      color:
                        filterPhase === p
                          ? "var(--status-warning)"
                          : "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {p === "all" ? "All Phases" : p}
              </button>
            )
          )}
        </div>

        {/* New Resource button */}
        <button
          onClick={() => setShowNewResource(true)}
          style={{
            marginLeft: "auto",
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid var(--accent)",
            background: "var(--accent)",
            color: "#07090E",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.08em",
            cursor: "pointer",
            textTransform: "uppercase",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
        >
          + New Resource
        </button>
      </div>

      {/* New Resource Modal */}
      <NewResourceDialog
        open={showNewResource}
        newRes={newRes}
        setNewRes={setNewRes}
        topLevelResources={topLevelResources}
        createResMut={createResMut}
        onClose={() => setShowNewResource(false)}
      />

      {/* ── CAPACITY VIEW ── */}
      {viewMode === "capacity" && (
        <CapacityView capacity={capacity} workPackages={workPackages} />
      )}

      {/* ── BOARD VIEW ── */}
      {viewMode === "board" && (
      <>
      {/* HERO EMPTY STATE — no resources or WPs yet */}
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
                background: "var(--accent)", color: "#07090E", border: "none",
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
            <button
              onClick={() => toast.info("Company resource sync coming soon")}
              style={{
                background: "transparent", color: "var(--text-muted)",
                border: "1px solid var(--border-strong)", borderRadius: "var(--radius-btn)",
                padding: "10px 20px", fontFamily: "var(--font-display)", fontSize: 12,
                fontWeight: 600, cursor: "pointer", textTransform: "uppercase",
                letterSpacing: "0.08em", minHeight: 44, transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              Sync Company Resources
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
            const isOverAlloc = label === "OVER-ALLOCATED" && value > 0;
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
        {/* LEFT PANEL — Allocation & Unscheduled */}
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

          {["Labor", "Equipment", "Subcontractor", "Material", "Crew"].map(type => {
            // Only show top-level resources in the capacity stack — members
            // are rolled up into their crew's effective capacity.
            const typeResources = topLevelResources.filter(r => (r.resource_type || "Labor") === type);
            if (typeResources.length === 0) return null;
            return (
              <div key={type}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
                    letterSpacing: "0.14em", textTransform: "uppercase", padding: "8px 0 4px",
                  borderBottom: "1px solid var(--hover-bg)", marginBottom: 6,
                }}>
                  {type === "Equipment" ? "⚙" : type === "Subcontractor" ? "🔨" : type === "Material" ? "📦" : "👷"} {type} ({typeResources.length})
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
                      <div style={{ width: "100%", height: 3, borderRadius: 2, background: "var(--divider)", marginTop: 3 }}>
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

        {/* RIGHT PANEL — Timeline Board */}
        <div
          ref={boardRef}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
          onPointerCancel={cleanupDrag}
          style={{
            flex: 1,
            overflow: "auto",
            background: "var(--bg-sidebar)",
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
          {displayResources.map((entry, idx) => {
            const resource = entry.resource;
            const rowAssignedWPs = scheduledWps.filter(wp => wp.crew === resource.name);
            const rowBudgetHrs = rowAssignedWPs.reduce((s, wp) => s + wpBudgetHoursForResource(wp), 0);
            const rowActualHrs = rowAssignedWPs.reduce((s, wp) => s + wpActualHoursForResource(wp), 0);
            const rowBurnPct = rowBudgetHrs > 0 ? Math.round((rowActualHrs / rowBudgetHrs) * 100) : 0;
            const rowIsOverBudget = rowActualHrs > rowBudgetHrs && rowBudgetHrs > 0;
            // Crew rows roll up member capacities; standalone resources
            // use their own. Members (indented children) show their own
            // individual capacity for reference only — assignments don't
            // flow to individuals in this model.
            const resBudgetFromEntity = entry.isMember
              ? (Number(resource.capacity) || 0)
              : (effectiveCapacityById[resource.id] || 0);
            const isOverAllocated = resBudgetFromEntity > 0 && rowBudgetHrs > resBudgetFromEntity;
            const isEquipment = resource.resource_type === "Equipment";
            const rowHeatBg = getRowCapacityBg(rowBurnPct, isOverAllocated);
            const rowSkills = extractSkillsRS(resource);
            const isCrew = entry.hasMembers;
            const crewExpanded = isCrew && expandedCrews.has(resource.id);
            return (
            <div
              key={resource.id}
              data-resource-id={resource.id}
              data-resource-name={resource.name}
              style={{
                display: "flex",
                background: isOverAllocated ? "rgba(239,68,68,0.04)" : rowHeatBg !== "transparent" ? rowHeatBg : (idx % 2 === 0 ? "var(--bg-page)" : "var(--bg-sidebar)"),
                borderBottom: "1px solid var(--hover-bg)",
                minHeight: 60,
                transition: "background 0.2s",
              }}
            >
              {/* Left label */}
              <div
                style={{
                  width: 220,
                  padding: "8px 12px",
                  paddingLeft: entry.isMember ? 28 : 12,   // indent member rows
                  flexShrink: 0,
                  background: entry.isMember ? "var(--bg-sidebar)" : "var(--bg-page)",
                  borderRight: "1px solid var(--border-default)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ width: "100%" }}>
                  <div
                    style={{ fontFamily: "var(--font-body)", fontSize: entry.isMember ? 12 : 13, color: "var(--text-primary)", fontWeight: entry.isMember ? 500 : 600, display: "flex", alignItems: "center", gap: 6, cursor: isCrew ? "pointer" : "default" }}
                    onClick={isCrew ? () => toggleCrew(resource.id) : undefined}
                    title={isCrew ? (crewExpanded ? "Collapse crew members" : "Expand crew members") : undefined}
                  >
                    {isCrew && (
                      <span style={{ fontSize: 10, color: "var(--accent)", transition: "transform 150ms", display: "inline-block", transform: crewExpanded ? "rotate(90deg)" : "none" }}>▶</span>
                    )}
                    {isEquipment ? "\u2699 " : ""}{resource.name}
                    {isCrew && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em", marginLeft: "auto" }}>
                        {entry.memberCount} MEMBER{entry.memberCount === 1 ? "" : "S"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                    {resource.role || "\u2014"}
                  </div>
                  {/* Skill tag badges in timeline rows */}
                  {rowSkills.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                      {rowSkills.map((sk, si) => (
                        <span key={si} style={{
                          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                          color: "var(--text-secondary)", background: "var(--hover-bg)",
                          border: "1px solid var(--bg-surface-high)", borderRadius: 8,
                          padding: "1px 5px", letterSpacing: "0.04em", textTransform: "uppercase",
                        }}>{sk}</span>
                      ))}
                    </div>
                  )}
                  {rowBudgetHrs > 0 && (
                    <>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 4, color: rowIsOverBudget ? "var(--status-error)" : "var(--text-muted)", letterSpacing: "0.06em" }}>
                        {rowBudgetHrs}h bud {"\u00B7"} {rowActualHrs}h act {"\u00B7"} {rowBurnPct}%
                      </div>
                      <div style={{ width: "100%", height: 3, borderRadius: 2, background: "var(--divider)", marginTop: 3 }}>
                        <div style={{ width: `${Math.min(100, rowBurnPct)}%`, height: "100%", borderRadius: 2, background: rowBurnPct > 100 ? "var(--status-error)" : rowBurnPct > 80 ? "var(--status-warning)" : "var(--accent)", transition: "width 0.4s" }} />
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                        {rowAssignedWPs.length} WPs {"\u00B7"} {rowAssignedWPs.reduce((s, wp) => s + (Number(wp.tonnage) || 0), 0)}T
                      </div>
                    </>
                  )}
                  {isOverAllocated && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 4, padding: "2px 6px", marginTop: 4, letterSpacing: "0.08em" }}>
                      {"\u26A0"} OVER-ALLOC
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline bars area */}
              <div
                style={{
                  flex: 1,
                  position: "relative",
                  display: "flex",
                  overflow: "hidden",
                }}
              >
                {/* WP bars */}
                {scheduledWps
                  .filter(
                    (wp) => wp.crew === resource.name
                  )
                  .map((wp) => {
                    const pos = getBarStyle(wp);
                    if (!pos) return null;

                    return (
                      <div
                        key={wp.id}
                        onPointerDown={(e) =>
                          onBarPointerDown(e, wp, resource.id, resource.name)
                        }
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, wp });
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const shopBud = Number(wp.shop_hours_budget) || 0;
                          const shopAct = Number(wp.shop_hours_actual) || 0;
                          const fieldBud = Number(wp.field_hours_budget) || 0;
                          const fieldAct = Number(wp.field_hours_actual) || 0;
                          setHoverTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, wp, shopBud, shopAct, fieldBud, fieldAct, totalBud: shopBud + fieldBud, totalAct: shopAct + fieldAct });
                        }}
                        onMouseLeave={() => setHoverTooltip(null)}
                        style={{
                          position: "absolute",
                          left: `${pos.left}px`,
                          width: `${pos.width}px`,
                          top: 8,
                          height: 36,
                          borderRadius: 6,
                          background:
                            PHASE_COLORS[wp.phase] || PHASE_COLORS.default,
                          cursor: "grab",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 8px",
                          overflow: "hidden",
                          userSelect: "none",
                          zIndex: 10,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                        }}
                      >
                        {/* Progress overlay */}
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            height: "100%",
                            width: `${wp.percent_complete || 0}%`,
                            background: "rgba(255,255,255,0.15)",
                            borderRadius: 6,
                          }}
                        />

                        {/* WP Name */}
                        <span
                          style={{
                            fontFamily: "var(--font-body)",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "white",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                            position: "relative",
                            zIndex: 1,
                          }}
                        >
                          {wp.name}
                        </span>

                        {/* WP Number (if wide enough) */}
                        {pos.width > 120 && (
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 8,
                              color: "rgba(255,255,255,0.55)",
                              background: "rgba(0,0,0,0.3)",
                              borderRadius: 3,
                              padding: "1px 4px",
                              marginLeft: 4,
                              position: "relative",
                              zIndex: 1,
                              flexShrink: 0,
                            }}
                          >
                            {wp.wp_number}
                          </span>
                        )}
                      </div>
                    );
                  })}

                {/* Today line - bright vertical accent line */}
                <div
                  style={{
                    position: "absolute",
                    left: `${todayOffset}px`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: "var(--accent)",
                    boxShadow: "0 0 10px rgba(200,155,32,0.6), 0 0 20px rgba(200,155,32,0.2)",
                    zIndex: 20,
                    pointerEvents: "none",
                    animation: "rsTodayPulse 3s ease-in-out infinite",
                  }}
                >
                  {/* TODAY label at top of line */}
                  <div style={{
                    position: "absolute",
                    top: -1,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#07090E",
                    background: "var(--accent)",
                    borderRadius: 3,
                    padding: "1px 5px",
                    letterSpacing: "0.08em",
                    whiteSpace: "nowrap",
                    lineHeight: 1.4,
                  }}>
                    TODAY
                  </div>
                </div>
              </div>
            </div>
          );
          })}
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
            <span style={{ color: hoverTooltip.totalAct > hoverTooltip.totalBud ? "#FF3D3D" : "#00D68F", fontWeight: 700 }}>
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
    </div>
  );
}
