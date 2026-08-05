// @ts-nocheck
/**
 * resourceScheduling/utils.ts
 *
 * Shared helpers + tokens for the Resource Scheduling feature.
 * Extracted from src/pages/ResourceScheduling.jsx as the first stage
 * of carving the 1878-line monolith into a feature folder. Nothing in
 * here has side effects except `injectKeyframes`, which is guarded so
 * it only runs once per document.
 */

// ─── Calendar helpers ────────────────────────────────────────────────
import { GANTT_GRADIENT, GANTT_TODAY_HEX } from "@/lib/ganttTheme";
import { formatLocalDate } from "@/utils/dates";

export const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};
export const subDays = (date, n) => addDays(date, -n);

export const snapToMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const fmt = (d) =>
  formatLocalDate(d, "en-US", { month: "short", day: "numeric" });

export const isThisWeek = (date) => {
  const today = new Date();
  const weekStart = snapToMonday(today);
  const weekEnd = addDays(weekStart, 6);
  return date >= weekStart && date <= weekEnd;
};

// ─── Visual tokens ───────────────────────────────────────────────────
export const PHASE_COLORS = {
  Detailing:   GANTT_GRADIENT.Detailing,
  Fabrication: GANTT_GRADIENT.Fabrication,
  Delivery:    GANTT_GRADIENT.Delivery,
  Erection:    GANTT_GRADIENT.Erection,
  default:     GANTT_GRADIENT.default,
};

export const TODAY_COLOR = GANTT_TODAY_HEX;

// Pixels per day at each zoom level. Used by the timeline header + bar
// positioning math, so changing these values rescales everything in
// lockstep.
export const PX_PER_DAY = {
  week:    28,
  month:   10,
  quarter: 5,
};

// ─── Skill tag extraction ───────────────────────────────────────────
export const KNOWN_SKILLS_RS = [
  "CWI", "Fitter", "Rigger", "Welder", "Erector", "Detailer",
  "PE", "QC", "Foreman", "Crane Op", "Ironworker", "Painter",
];

export function extractSkillsRS(resource) {
  const skills = [];
  const text = `${resource.role || ""} ${resource.notes || ""} ${resource.resource_type || ""}`.toUpperCase();
  KNOWN_SKILLS_RS.forEach((skill) => {
    if (text.includes(skill.toUpperCase())) skills.push(skill);
  });
  if (resource.role) {
    resource.role.split(/[,/]+/).forEach((part) => {
      const trimmed = part.trim();
      if (trimmed.length > 1 && trimmed.length <= 12 && !skills.find((s) => s.toUpperCase() === trimmed.toUpperCase())) {
        skills.push(trimmed);
      }
    });
  }
  return skills.slice(0, 4);
}

// ─── Heatmap backgrounds for resource rows ──────────────────────────
export function getRowCapacityBg(burnPct, isOverAllocated) {
  if (isOverAllocated || burnPct > 100) return "rgba(239,68,68,0.04)";
  if (burnPct > 80) return "rgba(245,158,11,0.03)";
  if (burnPct > 0) return "rgba(34,197,94,0.02)";
  return "transparent";
}

// ─── Ghost placeholder data (for empty-state flair) ─────────────────
export const GHOST_RESOURCES_SCHED = [
  { name: "Welding Team A",   role: "CWI / Fitter",  skills: ["CWI", "Fitter"] },
  { name: "Bay 3 Crane",      role: "Equipment",     skills: ["Crane Op"] },
  { name: "Erection Crew B",  role: "Ironworkers",   skills: ["Rigger", "Erector"] },
];

// ─── One-shot keyframe injection ────────────────────────────────────
// Must be called in the component module load, not inside a render —
// otherwise the <style> re-appends on every remount.
const RS_STYLE_ID = "resource-sched-keyframes";
export function injectKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(RS_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = RS_STYLE_ID;
  style.textContent = `
    @keyframes rsOverAllocPulse {
      0%, 100% { box-shadow: 0 0 6px rgba(239,68,68,0.15); color: #EF4444; }
      50%      { box-shadow: 0 0 18px rgba(239,68,68,0.45); color: #FF6B6B; }
    }
    @keyframes rsDropGlow {
      0%   { box-shadow: inset 0 0 0 1px rgba(46,168,255,0.0); }
      50%  { box-shadow: inset 0 0 0 1px rgba(46,168,255,0.35); }
      100% { box-shadow: inset 0 0 0 1px rgba(46,168,255,0.0); }
    }
    @keyframes rsGhostShimmer {
      0%   { opacity: 0.18; }
      50%  { opacity: 0.32; }
      100% { opacity: 0.18; }
    }
    @keyframes rsTodayPulse {
      0%, 100% { box-shadow: 0 0 6px rgba(255,107,0,0.3); }
      50%      { box-shadow: 0 0 14px rgba(255,107,0,0.6); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Timeline bar positioning ───────────────────────────────────────
export function getBarStyle(wp, timelineStart, pxPerDay) {
  const rawStart = wp.scheduled_start_date || wp.released_date;
  if (!rawStart || !wp.scheduled_end_date) return null;

  const start = new Date(rawStart);
  const end = new Date(wp.scheduled_end_date);
  const left = Math.round(
    ((+start - +timelineStart) / 86400000) * pxPerDay
  );
  const width = Math.max(
    Math.round(((+end - +start) / 86400000) * pxPerDay),
    pxPerDay * 2
  );
  const duration = Math.round((+end - +start) / 86400000);

  return { left, width, duration };
}

export function buildTimelineHeaders(zoomMode, timelineStart, timelineEnd, pxPerDay) {
  const headers = [];
  let cursor = new Date(timelineStart);
  cursor.setHours(0, 0, 0, 0);

  if (zoomMode === "week") {
    while (cursor < timelineEnd) {
      headers.push({
        label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        subLabel: cursor.toLocaleDateString("en-US", { weekday: "short" }),
        width: pxPerDay * 7,
        isToday: isThisWeek(cursor),
        date: new Date(cursor),
      });
      cursor = addDays(cursor, 7);
    }
  } else if (zoomMode === "month") {
    while (cursor < timelineEnd) {
      headers.push({
        label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        subLabel: cursor.toLocaleDateString("en-US", { year: "numeric" }),
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
        label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        width: pxPerDay * 14,
        isToday: false,
        date: new Date(cursor),
      });
      cursor = addDays(cursor, 14);
    }
  }

  return headers;
}

export function buildMonthBanners(zoomMode, headers) {
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
      currentLabel = formatLocalDate(h.date, "en-US", {
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
}

export function computeTodayOffset(timelineStart, pxPerDay) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tStart = new Date(timelineStart);
  tStart.setHours(0, 0, 0, 0);
  return Math.round(((+today - +tStart) / 86400000) * pxPerDay);
}

export function computeTimelineWindow(workPackages) {
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

  const days = Math.ceil((+tEnd - +tStart) / 86400000);

  return {
    timelineStart: tStart,
    timelineEnd: tEnd,
    totalDays: days,
  };
}

export function computeCapacityFromWorkPackages(workPackages) {
  const wps = workPackages;
  const shopBudget = wps.reduce((s, w) => s + (Number(w.shop_hours_budget) || 0), 0);
  const shopActual = wps.reduce((s, w) => s + (Number(w.shop_hours_actual) || 0), 0);
  const shopRemaining = shopBudget - shopActual;
  const fieldBudget = wps.reduce((s, w) => s + (Number(w.field_hours_budget) || 0), 0);
  const fieldActual = wps.reduce((s, w) => s + (Number(w.field_hours_actual) || 0), 0);
  const fieldRemaining = fieldBudget - fieldActual;
  const totalTons = wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const inFabTons = wps.filter(w => w.phase === "Fabrication" && w.status === "In Progress").reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const byPhase = {
    Detailing: wps.filter(w => w.phase === "Detailing" && !["Complete", "On Hold"].includes(w.status)).length,
    Fabrication: wps.filter(w => w.phase === "Fabrication" && !["Complete", "On Hold"].includes(w.status)).length,
    Delivery: wps.filter(w => w.phase === "Delivery" && !["Complete", "On Hold"].includes(w.status)).length,
    Erection: wps.filter(w => w.phase === "Erection" && !["Complete", "On Hold"].includes(w.status)).length,
  };
  return { shopBudget, shopActual, shopRemaining, fieldBudget, fieldActual, fieldRemaining, totalTons, inFabTons, byPhase };
}

export const PHASE_FILTER_OPTIONS = ["all", "Detailing", "Fabrication", "Delivery", "Erection"];

export function phaseFilterColor(phase) {
  if (phase === "Detailing") return "var(--phase-detailing)";
  if (phase === "Fabrication") return "var(--phase-fabrication)";
  if (phase === "Delivery") return "var(--phase-delivery)";
  if (phase === "Erection") return "var(--phase-erection)";
  return "var(--accent)";
}
