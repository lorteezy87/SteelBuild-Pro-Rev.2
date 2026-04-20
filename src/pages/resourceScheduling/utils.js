/**
 * resourceScheduling/utils.js
 *
 * Shared helpers + tokens for the Resource Scheduling feature.
 * Extracted from src/pages/ResourceScheduling.jsx as the first stage
 * of carving the 1878-line monolith into a feature folder. Nothing in
 * here has side effects except `injectKeyframes`, which is guarded so
 * it only runs once per document.
 */

// ─── Calendar helpers ────────────────────────────────────────────────
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
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const isThisWeek = (date) => {
  const today = new Date();
  const weekStart = snapToMonday(today);
  const weekEnd = addDays(weekStart, 6);
  return date >= weekStart && date <= weekEnd;
};

// ─── Visual tokens ───────────────────────────────────────────────────
export const PHASE_COLORS = {
  Detailing:   "linear-gradient(135deg, var(--accent), var(--secondary))",
  Fabrication: "linear-gradient(135deg, var(--accent), var(--status-warning))",
  Delivery:    "linear-gradient(135deg, #00D68F, #00A86B)",
  Erection:    "linear-gradient(135deg, #00B8D9, #0090B8)",
  default:     "linear-gradient(135deg, #475569, #334155)",
};

// Pixels per day at each zoom level. Used by the timeline header + bar
// positioning math, so changing these values rescales everything in
// lockstep.
export const PX_PER_DAY = {
  week:    28,
  month:   10,
  quarter: 5,
};

// ─── Skill tag extraction ───────────────────────────────────────────
const KNOWN_SKILLS_RS = [
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
      0%   { box-shadow: inset 0 0 0 1px rgba(200,155,32,0.0); }
      50%  { box-shadow: inset 0 0 0 1px rgba(200,155,32,0.35); }
      100% { box-shadow: inset 0 0 0 1px rgba(200,155,32,0.0); }
    }
    @keyframes rsGhostShimmer {
      0%   { opacity: 0.18; }
      50%  { opacity: 0.32; }
      100% { opacity: 0.18; }
    }
    @keyframes rsTodayPulse {
      0%, 100% { box-shadow: 0 0 6px rgba(200,155,32,0.3); }
      50%      { box-shadow: 0 0 14px rgba(200,155,32,0.6); }
    }
  `;
  document.head.appendChild(style);
}
