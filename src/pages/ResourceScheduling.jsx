import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "../components/shared/useProjectContext";

// ──────────────────────────────────────────────────────────────────────
// HELPERS & UTILITIES
// ──────────────────────────────────────────────────────────────────────

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const subDays = (date, n) => addDays(date, -n);

const snapToMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const fmt = (d) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const isThisWeek = (date) => {
  const today = new Date();
  const weekStart = snapToMonday(today);
  const weekEnd = addDays(weekStart, 6);
  return date >= weekStart && date <= weekEnd;
};

const PHASE_COLORS = {
  Detailing: "linear-gradient(135deg, var(--accent), var(--secondary))",
  Fabrication: "linear-gradient(135deg, var(--accent), var(--status-warning))",
  Delivery: "linear-gradient(135deg, #00D68F, #00A86B)",
  Erection: "linear-gradient(135deg, #00B8D9, #0090B8)",
  default: "linear-gradient(135deg, #475569, #334155)",
};

const PX_PER_DAY = {
  week: 28,
  month: 10,
  quarter: 5,
};

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

  // Data queries
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      return base44.entities.WorkPackage.filter({
        project_id: activeProject.id,
      });
    },
    initialData: [],
  });

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      return base44.entities.Resource.filter({
        project_id: activeProject.id,
      });
    },
    initialData: [],
  });

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

  // Calculate timeline window from actual WP dates
  // Note: WP entity uses released_date for start; no end date field — use planned_end from ScheduleTask
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    const starts = workPackages
      .filter((wp) => wp.released_date || wp.startDate)
      .map((wp) => new Date(wp.released_date || wp.startDate).getTime())
      .filter((t) => !isNaN(t));
    const ends = workPackages
      .filter((wp) => wp.endDate)
      .map((wp) => new Date(wp.endDate).getTime())
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
    const rawStart = wp.released_date || wp.startDate;
    if (!rawStart || !wp.endDate) return null;

    const start = new Date(rawStart);
    const end = new Date(wp.endDate);
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
    (wp) => (wp.released_date || wp.startDate) && wp.endDate
  );
  const unscheduledWps = filteredWorkPackages.filter(
    (wp) => !(wp.released_date || wp.startDate) || !wp.endDate
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
    });

    setDragTooltip(null);
    dragRef.current = null;
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
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

    const rawStart = wp.released_date || wp.startDate;
    dragRef.current = {
      wpId: wp.id,
      wpName: wp.name,
      fromResourceId: resourceId,
      fromResourceName: resourceName,
      origStart: new Date(rawStart),
      origEnd: new Date(wp.endDate),
      durationMs: new Date(wp.endDate) - new Date(rawStart),
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

    // Highlight row
    boardRef.current?.querySelectorAll("[data-resource-id]").forEach((row) => {
      const r = row.getBoundingClientRect();
      const hit = e.clientY >= r.top && e.clientY <= r.bottom;
      row.style.background = hit ? "rgba(245,158,11,0.07)" : "";
      row.style.outline = hit ? "1px solid rgba(245,158,11,0.3)" : "";
    });

    // Tooltip
    const timelineEl = timelineRef.current;
    if (timelineEl) {
      const tRect = timelineEl.getBoundingClientRect();
      const relX = e.clientX - tRect.left + timelineEl.scrollLeft;
      const daysIn = relX / pxPerDay;
      const newStart = addDays(timelineStart, Math.round(daysIn));
      const newEnd = new Date(newStart.getTime() + d.durationMs);

      setDragTooltip({
        x: e.clientX,
        y: e.clientY - 44,
        text: `${fmt(newStart)} → ${fmt(newEnd)}`,
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

    // Handle new assignment from unscheduled pool
    if (d.isNewAssignment) {
      qc.setQueryData(["work-packages", activeProject?.id], (prev) =>
        prev?.map((wp) => wp.id === d.wpId ? {
          ...wp,
          released_date: newStart.toISOString().split("T")[0],
          startDate: newStart.toISOString(),
          endDate: newEnd.toISOString(),
          crew: newResourceName || "",
        } : wp) || []
      );
      try {
        await base44.entities.WorkPackage.update(d.wpId, {
          released_date: newStart.toISOString().split("T")[0],
          startDate: newStart.toISOString(),
          endDate: newEnd.toISOString(),
          crew: newResourceName || "",
        });
        setUndoToast({ id: Date.now(), message: `${d.wpName} → ${newResourceName} · ${fmt(newStart)}` });
      } catch (err) {
        console.error("Assignment failed:", err);
        qc.invalidateQueries({ queryKey: ["work-packages"] });
        setUndoToast({ id: Date.now(), message: `Failed to assign ${d.wpName}` });
      }
      setTimeout(() => setUndoToast(null), 5000);
      return;
    }

    const dateChanged =
      newStart.toDateString() !== d.origStart.toDateString();
    const resourceChanged = newResourceId !== d.fromResourceId;

    if (!dateChanged && !resourceChanged) return;

    // Optimistic update
    qc.setQueryData(
      ["work-packages", activeProject?.id],
      (prev) =>
        prev?.map((wp) =>
          wp.id === d.wpId
            ? {
                ...wp,
                startDate: newStart.toISOString(),
                endDate: newEnd.toISOString(),
                ...(resourceChanged && { crew: newResourceName }),
              }
            : wp
        ) || []
    );

    // Show toast
    const toastMsg =
      `${d.wpName} → ${fmt(newStart)}` +
      (resourceChanged ? ` · ${newResourceName}` : "");

    setUndoToast({ id: Date.now(), message: toastMsg });
    setTimeout(() => setUndoToast(null), 8000);

    // Persist to DB
    try {
      const updatePayload = {
        startDate: newStart.toISOString(),
        endDate: newEnd.toISOString(),
      };
      if (resourceChanged) {
        updatePayload.crew = newResourceName;
      }

      await base44.entities.WorkPackage.update(d.wpId, { ...updatePayload, released_date: newStart.toISOString().split('T')[0] });
    } catch (err) {
      console.error("WP update failed:", err);

      // Rollback
      qc.setQueryData(
        ["work-packages", activeProject?.id],
        (prev) =>
          prev?.map((wp) =>
            wp.id === d.wpId
              ? {
                  ...wp,
                  startDate: d.origStart.toISOString(),
                  endDate: d.origEnd.toISOString(),
                  crew: d.fromResourceName,
                }
              : wp
          ) || []
      );

      setUndoToast({
        id: Date.now(),
        message: `Save failed — ${d.wpName} reverted`,
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
    const estDuration = Math.max(3, Math.ceil((Number(wp.tonnage) || 0) / 2));
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
      origEnd: addDays(today, estDuration),
      durationMs: estDuration * 86400000,
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
          borderBottom: "1px solid rgba(255,255,255,0.06)",
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
          borderBottom: "1px solid rgba(255,255,255,0.07)",
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
              border: viewMode === v.id ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,0.12)",
              background: viewMode === v.id ? "rgba(59,130,246,0.12)" : "transparent",
              color: viewMode === v.id ? "var(--accent)" : "rgba(255,255,255,0.50)",
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
                    : "1px solid rgba(255,255,255,0.12)",
                    background:
                    zoomMode === mode ? "rgba(245,158,11,0.12)" : "transparent",
                    color:
                    zoomMode === mode
                      ? "var(--status-warning)"
                      : "rgba(255,255,255,0.50)",
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
                        : "1px solid rgba(255,255,255,0.12)",
                      background:
                        filterPhase === p
                          ? "rgba(245,158,11,0.08)"
                          : "transparent",
                      color:
                        filterPhase === p
                          ? "var(--status-warning)"
                          : "rgba(255,255,255,0.40)",
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
      </div>

      {/* ── CAPACITY VIEW ── */}
      {viewMode === "capacity" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Hours capacity grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

              {/* Shop Fab Hours */}
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: "var(--accent)", borderRadius: 2 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Shop Fab Hours</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
                  {[
                    { label: "Budget", value: capacity.shopBudget.toLocaleString() + "h", color: "var(--text-primary)" },
                    { label: "Actual", value: capacity.shopActual.toLocaleString() + "h", color: capacity.shopActual > capacity.shopBudget ? "var(--status-error)" : "var(--text-primary)" },
                    { label: "Remaining", value: Math.max(0, capacity.shopRemaining).toLocaleString() + "h", color: capacity.shopRemaining < 0 ? "var(--status-error)" : "var(--status-success)" },
                  ].map(({ label, value, color }, i) => (
                    <div key={label} style={{ padding: "14px 16px", borderRight: i < 2 ? "1px solid var(--divider)" : "none" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "0 16px 14px" }}>
                  <div style={{ height: 6, background: "var(--bg-surface-high)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, capacity.shopBudget > 0 ? (capacity.shopActual / capacity.shopBudget) * 100 : 0)}%`, background: capacity.shopActual > capacity.shopBudget ? "var(--status-error)" : "var(--accent)", borderRadius: 3, transition: "width 0.4s" }} />
                  </div>
                </div>
              </div>

              {/* Field Install Hours */}
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: "var(--phase-erection)", borderRadius: 2 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Field Install Hours</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
                  {[
                    { label: "Budget", value: capacity.fieldBudget.toLocaleString() + "h", color: "var(--text-primary)" },
                    { label: "Actual", value: capacity.fieldActual.toLocaleString() + "h", color: capacity.fieldActual > capacity.fieldBudget ? "var(--status-error)" : "var(--text-primary)" },
                    { label: "Remaining", value: Math.max(0, capacity.fieldRemaining).toLocaleString() + "h", color: capacity.fieldRemaining < 0 ? "var(--status-error)" : "var(--status-success)" },
                  ].map(({ label, value, color }, i) => (
                    <div key={label} style={{ padding: "14px 16px", borderRight: i < 2 ? "1px solid var(--divider)" : "none" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "0 16px 14px" }}>
                  <div style={{ height: 6, background: "var(--bg-surface-high)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, capacity.fieldBudget > 0 ? (capacity.fieldActual / capacity.fieldBudget) * 100 : 0)}%`, background: capacity.fieldActual > capacity.fieldBudget ? "var(--status-error)" : "var(--phase-erection)", borderRadius: 3, transition: "width 0.4s" }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Active WPs by phase */}
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 14, background: "var(--accent)", borderRadius: 2 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Active Workload by Phase</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                {[
                  { label: "Detailing", count: capacity.byPhase.Detailing, color: "var(--phase-detailing)" },
                  { label: "Fabrication", count: capacity.byPhase.Fabrication, color: "var(--phase-fab)" },
                  { label: "Delivery", count: capacity.byPhase.Delivery, color: "var(--phase-delivery)" },
                  { label: "Erection", count: capacity.byPhase.Erection, color: "var(--phase-erection)" },
                ].map(({ label, count, color }, i) => (
                  <div key={label} style={{ padding: "16px 20px", borderRight: i < 3 ? "1px solid var(--divider)" : "none", borderTop: `3px solid ${color}` }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{count}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>active packages</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tonnage in fab */}
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: "14px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: "var(--phase-fab)", borderRadius: 2 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Tonnage Scheduled vs Capacity</span>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--phase-fab)" }}>
                  {capacity.inFabTons.toFixed(1)}T
                  <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: 4 }}>in fab now</span>
                </span>
              </div>
              {workPackages.filter(w => w.phase === "Fabrication" && w.status === "In Progress").map(wp => (
                <div key={wp.id} style={{ display: "grid", gridTemplateColumns: "1fr 60px 80px 80px", padding: "7px 0", borderBottom: "1px solid var(--divider)", gap: 12, alignItems: "center" }}>
                  <div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", fontWeight: 700, marginRight: 6 }}>{wp.wp_number}</span>
                    <span style={{ fontSize: 11, color: "var(--text-primary)" }}>{wp.name}</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", textAlign: "right" }}>{wp.tonnage ? `${wp.tonnage}T` : "—"}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", textAlign: "right" }}>{wp.shop_hours_budget || 0}h bdg</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textAlign: "right", color: (wp.shop_hours_actual || 0) > (wp.shop_hours_budget || 0) ? "var(--status-error)" : "var(--accent)" }}>
                    {wp.shop_hours_actual || 0}h act
                  </div>
                </div>
              ))}
              {workPackages.filter(w => w.phase === "Fabrication" && w.status === "In Progress").length === 0 && (
                <div style={{ textAlign: "center", padding: "16px 0", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>NO ACTIVE FAB PACKAGES</div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── BOARD VIEW ── */}
      {viewMode === "board" && (
      <>
      {/* HOURS SUMMARY STRIP */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8,
        padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "var(--bg-page)", flexShrink: 0,
      }}>
        {(() => {
          const totalBudgetHrs = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.shop_hours_budget) || 0) + (Number(wp.field_hours_budget) || 0), 0);
          const totalActualHrs = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.shop_hours_actual) || 0) + (Number(wp.field_hours_actual) || 0), 0);
          const totalShopBudget = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.shop_hours_budget) || 0), 0);
          const totalShopActual = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.shop_hours_actual) || 0), 0);
          const totalFieldBudget = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.field_hours_budget) || 0), 0);
          const totalFieldActual = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.field_hours_actual) || 0), 0);
          const assignedWPCount = scheduledWps.filter(wp => wp.crew).length;
          const unassignedCount = filteredWorkPackages.filter(wp => !wp.crew).length;
          const overAllocatedResources = resources.filter(res => {
            const resWPs = scheduledWps.filter(wp => wp.crew === res.name);
            const resBudget = resWPs.reduce((s, wp) => s + (Number(wp.shop_hours_budget) || 0) + (Number(wp.field_hours_budget) || 0), 0);
            const resActual = resWPs.reduce((s, wp) => s + (Number(wp.shop_hours_actual) || 0) + (Number(wp.field_hours_actual) || 0), 0);
            return resBudget > 0 && resActual > resBudget;
          }).length;
          return [
            { label: "TOTAL ESTIMATED", value: totalBudgetHrs.toLocaleString() + "h", color: "var(--accent)" },
            { label: "TOTAL ACTUAL", value: totalActualHrs.toLocaleString() + "h", color: totalActualHrs > totalBudgetHrs ? "var(--status-error)" : "var(--status-success)" },
            { label: "SHOP HRS", value: `${totalShopActual.toLocaleString()} / ${totalShopBudget.toLocaleString()}`, color: totalShopActual > totalShopBudget ? "var(--status-error)" : "var(--text-secondary)" },
            { label: "FIELD HRS", value: `${totalFieldActual.toLocaleString()} / ${totalFieldBudget.toLocaleString()}`, color: totalFieldActual > totalFieldBudget ? "var(--status-error)" : "var(--text-secondary)" },
            { label: "ASSIGNED / TOTAL", value: `${assignedWPCount} / ${filteredWorkPackages.length} WPs`, color: unassignedCount > 0 ? "var(--status-warning)" : "var(--status-success)" },
            { label: "OVER-ALLOCATED", value: overAllocatedResources, color: overAllocatedResources > 0 ? "var(--status-error)" : "var(--status-success)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ padding: "6px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, color }}>{value}</div>
            </div>
          ));
        })()}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* LEFT PANEL — Allocation & Unscheduled */}
        <div
          style={{
            width: 260,
            background: "var(--bg-page)",
            borderRight: "1px solid rgba(255,255,255,0.07)",
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

          {["Labor", "Equipment", "Subcontractor", "Material"].map(type => {
            const typeResources = resources.filter(r => (r.resource_type || "Labor") === type);
            if (typeResources.length === 0) return null;
            return (
              <div key={type}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)",
                    letterSpacing: "0.14em", textTransform: "uppercase", padding: "8px 0 4px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)", marginBottom: 6,
                }}>
                  {type === "Equipment" ? "⚙" : type === "Subcontractor" ? "🔨" : type === "Material" ? "📦" : "👷"} {type} ({typeResources.length})
                </div>
                {typeResources.map(res => {
                  const assignedWPs = scheduledWps.filter(wp => wp.crew === res.name);
                  const resBudgetHrs = assignedWPs.reduce((s, wp) => s + (Number(wp.shop_hours_budget) || 0) + (Number(wp.field_hours_budget) || 0), 0);
                  const resActualHrs = assignedWPs.reduce((s, wp) => s + (Number(wp.shop_hours_actual) || 0) + (Number(wp.field_hours_actual) || 0), 0);
                  const resBurnPct = resBudgetHrs > 0 ? Math.round((resActualHrs / resBudgetHrs) * 100) : 0;
                  const isOverBudget = resActualHrs > resBudgetHrs && resBudgetHrs > 0;
                  const resBudgetFromEntity = Number(res.budget_hours) || 0;
                  const isOverAllocated = resBudgetFromEntity > 0 && resBudgetHrs > resBudgetFromEntity;
                  return (
                    <div key={res.id} style={{
                      background: isOverAllocated ? "rgba(255,23,68,0.06)" : "var(--bg-surface-low)",
                      border: isOverAllocated ? "1px solid rgba(255,23,68,0.20)" : "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 8, padding: 8, marginBottom: 8,
                    }}>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", fontWeight: 600, marginBottom: 2 }}>
                        {res.name}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                        {res.role || "—"}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 4, color: isOverBudget ? "var(--status-error)" : "var(--text-muted)", letterSpacing: "0.06em" }}>
                        {resBudgetHrs}h bud · {resActualHrs}h act · {resBurnPct}%
                      </div>
                      <div style={{ width: "100%", height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginTop: 3 }}>
                        <div style={{ width: `${Math.min(100, resBurnPct)}%`, height: "100%", borderRadius: 2, background: resBurnPct > 100 ? "var(--status-error)" : resBurnPct > 80 ? "var(--status-warning)" : "var(--accent)" }} />
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", marginTop: 2 }}>
                        {assignedWPs.length} WPs · {assignedWPs.reduce((s, wp) => s + (Number(wp.tonnage) || 0), 0)}T
                      </div>
                      {isOverAllocated && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 4, padding: "2px 6px", marginTop: 4, letterSpacing: "0.08em" }}>
                        ⚠ OVER-ALLOC ({resBudgetHrs}h / {resBudgetFromEntity}h cap)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Unscheduled WPs */}
          {unscheduledWps.length > 0 && (
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                padding: "12px 12px 8px 0",
                marginTop: 12,
              }}
            >
              <div
                style={{
                  fontSize: 8,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                  letterSpacing: "0.14em",
                  marginBottom: 8,
                  textTransform: "uppercase",
                }}
              >
                UNSCHEDULED ({unscheduledWps.length})
              </div>

              {unscheduledWps.map((wp) => (
                <div
                  key={wp.id}
                  onPointerDown={(e) => onUnscheduledPointerDown(e, wp)}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px dashed rgba(245,158,11,0.3)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    marginBottom: 6,
                    cursor: "grab",
                    touchAction: "none",
                    userSelect: "none",
                  }}
                >
                  <div style={{ fontSize: 11, fontFamily: "var(--font-body)", color: "var(--text-secondary)", fontWeight: 600 }}>
                    {wp.name}
                  </div>
                  <div style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--status-warning)", marginTop: 2 }}>
                    {wp.wp_number} · {wp.phase}
                  </div>
                  <div style={{ fontSize: 8, color: "rgba(255,176,32,0.6)", marginTop: 3, fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
                    ↕ drag to assign to resource
                  </div>
                </div>
              ))}
            </div>
          )}
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
          {/* HEADER ROW 1 (month banners) */}
          {zoomMode === "month" && (
            <div
              style={{
                position: "sticky",
                top: 0,
                background: "var(--bg-surface-low)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                zIndex: 20,
                }}
                >
                <div
                style={{
                  width: 220,
                  flexShrink: 0,
                  background: "var(--bg-page)",
                  borderRight: "1px solid rgba(255,255,255,0.07)",
                }}
              />
              <div style={{ display: "flex" }}>
                {monthBanners.map((banner, idx) => (
                  <div
                    key={idx}
                    style={{
                      width: banner.width,
                      padding: "6px 8px",
                      textAlign: "center",
                      borderRight: "1px solid rgba(255,255,255,0.05)",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "#F2F4F8",
                        fontWeight: 700,
                      }}
                    >
                      {banner.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HEADER ROW 2 (week/day columns) */}
          <div
            style={{
              position: "sticky",
              top: zoomMode === "month" ? 32 : 0,
              background: "var(--bg-surface-low)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              zIndex: 19,
            }}
          >
            <div
              style={{
                width: 220,
                flexShrink: 0,
                background: "var(--bg-page)",
                borderRight: "1px solid rgba(255,255,255,0.07)",
              }}
            />
            <div ref={timelineRef} style={{ display: "flex" }}>
              {headers.map((h, idx) => (
                <div
                  key={idx}
                  style={{
                    width: h.width,
                    borderRight: "1px solid rgba(255,255,255,0.05)",
                    padding: "6px 8px",
                    textAlign: "center",
                    background: h.isToday ? "rgba(245,158,11,0.08)" : "transparent",
                    borderTop: h.isToday ? "2px solid var(--accent)" : "none",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: h.isToday ? "var(--status-warning)" : "var(--text-primary)",
                      fontWeight: 700,
                    }}
                  >
                    {h.label}
                  </div>
                  {h.subLabel && (
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        color: "var(--text-muted)",
                      }}
                    >
                      {h.subLabel}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* RESOURCE ROWS */}
          {resources.map((resource, idx) => {
            const rowAssignedWPs = scheduledWps.filter(wp => wp.crew === resource.name);
            const rowBudgetHrs = rowAssignedWPs.reduce((s, wp) => s + (Number(wp.shop_hours_budget) || 0) + (Number(wp.field_hours_budget) || 0), 0);
            const rowActualHrs = rowAssignedWPs.reduce((s, wp) => s + (Number(wp.shop_hours_actual) || 0) + (Number(wp.field_hours_actual) || 0), 0);
            const rowBurnPct = rowBudgetHrs > 0 ? Math.round((rowActualHrs / rowBudgetHrs) * 100) : 0;
            const rowIsOverBudget = rowActualHrs > rowBudgetHrs && rowBudgetHrs > 0;
            const resBudgetFromEntity = Number(resource.budget_hours) || 0;
            const isOverAllocated = resBudgetFromEntity > 0 && rowBudgetHrs > resBudgetFromEntity;
            const isEquipment = resource.resource_type === "Equipment";
            return (
            <div
              key={resource.id}
              data-resource-id={resource.id}
              data-resource-name={resource.name}
              style={{
                display: "flex",
                background: isOverAllocated ? "rgba(255,23,68,0.03)" : (idx % 2 === 0 ? "var(--bg-page)" : "var(--bg-sidebar)"),
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                minHeight: 60,
              }}
            >
              {/* Left label */}
              <div
                style={{
                  width: 220,
                  padding: "8px 12px",
                  flexShrink: 0,
                  background: "var(--bg-page)",
                  borderRight: "1px solid rgba(255,255,255,0.07)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ width: "100%" }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
                    {isEquipment ? "⚙ " : ""}{resource.name}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                    {resource.role || "—"}
                  </div>
                  {rowBudgetHrs > 0 && (
                    <>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 4, color: rowIsOverBudget ? "var(--status-error)" : "var(--text-muted)", letterSpacing: "0.06em" }}>
                        {rowBudgetHrs}h bud · {rowActualHrs}h act · {rowBurnPct}%
                      </div>
                      <div style={{ width: "100%", height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginTop: 3 }}>
                        <div style={{ width: `${Math.min(100, rowBurnPct)}%`, height: "100%", borderRadius: 2, background: rowBurnPct > 100 ? "var(--status-error)" : rowBurnPct > 80 ? "var(--status-warning)" : "var(--accent)" }} />
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", marginTop: 2 }}>
                        {rowAssignedWPs.length} WPs · {rowAssignedWPs.reduce((s, wp) => s + (Number(wp.tonnage) || 0), 0)}T
                      </div>
                    </>
                  )}
                  {isOverAllocated && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 4, padding: "2px 6px", marginTop: 4, letterSpacing: "0.08em" }}>
                      ⚠ OVER-ALLOC
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

                {/* Today line */}
                <div
                  style={{
                    position: "absolute",
                    left: `${todayOffset}px`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: "var(--accent)",
                    boxShadow: "0 0 8px rgba(245,158,11,0.6)",
                    zIndex: 20,
                    pointerEvents: "none",
                  }}
                />
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
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "#F2F4F8", marginBottom: 6 }}>
            {hoverTooltip.wp.wp_number} — {hoverTooltip.wp.name}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)", lineHeight: 1.8 }}>
            Phase: {hoverTooltip.wp.phase} · Status: {hoverTooltip.wp.status}<br/>
            Tonnage: {hoverTooltip.wp.tonnage || 0}T · Progress: {hoverTooltip.wp.percent_complete || 0}%<br/>
            Shop: {hoverTooltip.shopAct}h / {hoverTooltip.shopBud}h · Field: {hoverTooltip.fieldAct}h / {hoverTooltip.fieldBud}h<br/>
            <span style={{ color: hoverTooltip.totalAct > hoverTooltip.totalBud ? "#FF3D3D" : "#00D68F", fontWeight: 700 }}>
              Total: {hoverTooltip.totalAct}h / {hoverTooltip.totalBud}h ({hoverTooltip.totalBud > 0 ? Math.round((hoverTooltip.totalAct / hoverTooltip.totalBud) * 100) : 0}%)
            </span>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: "fixed", left: contextMenu.x, top: contextMenu.y,
            background: "var(--bg-surface-low)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, padding: "4px 0", zIndex: 10000,
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)", minWidth: 200,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: "6px 12px", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 4 }}>
            {contextMenu.wp.wp_number} — {contextMenu.wp.name}
          </div>
          <div style={{ padding: "2px 12px 4px", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Reassign to</div>
          {resources.map(res => (
            <button key={res.id} onClick={async () => {
              await base44.entities.WorkPackage.update(contextMenu.wp.id, { crew: res.name });
              qc.invalidateQueries({ queryKey: ["work-packages"] });
              setContextMenu(null);
              setUndoToast({ id: Date.now(), message: `${contextMenu.wp.wp_number} → ${res.name}` });
              setTimeout(() => setUndoToast(null), 5000);
            }} style={{
              display: "block", width: "100%", padding: "7px 12px", textAlign: "left",
              background: contextMenu.wp.crew === res.name ? "var(--accent-muted)" : "transparent",
              border: "none", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 11,
              cursor: "pointer",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(245,158,11,0.10)"}
            onMouseLeave={e => e.currentTarget.style.background = contextMenu.wp.crew === res.name ? "var(--accent-muted)" : "transparent"}>
              {res.name} <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(200,210,230,0.40)" }}>({res.role})</span>
            </button>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "4px 0" }} />
          <button onClick={async () => {
            await base44.entities.WorkPackage.update(contextMenu.wp.id, { crew: "", released_date: "", startDate: "", endDate: "" });
            qc.invalidateQueries({ queryKey: ["work-packages"] });
            setContextMenu(null);
            setUndoToast({ id: Date.now(), message: `${contextMenu.wp.wp_number} unassigned` });
            setTimeout(() => setUndoToast(null), 5000);
          }} style={{
            display: "block", width: "100%", padding: "7px 12px", textAlign: "left",
            background: "transparent", border: "none", color: "#FF3D3D",
            fontFamily: "var(--font-body)", fontSize: 11, cursor: "pointer",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,23,68,0.08)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            Unassign
          </button>
        </div>
      )}

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
