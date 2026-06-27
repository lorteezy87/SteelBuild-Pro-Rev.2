/**
 * msProjectExport.js — Export SteelBuild schedule tasks to MS Project XML.
 *
 * Produces a valid Microsoft Project 2003+ XML file that can be opened
 * directly in MS Project. Preserves:
 *   - Task names with WBS hierarchy (OutlineLevel, OutlineNumber)
 *   - Start/end dates and calculated duration
 *   - Predecessor links with FS/SS/FF/SF types and lag days
 *   - Resource assignments
 *   - Percent complete and milestone flags
 *
 * The exported XML follows the Microsoft Office Project 2003 XML schema
 * (xmlns=http://schemas.microsoft.com/project) which is forward-compatible
 * with Project 2010/2013/2016/2019/365.
 */

import { PHASE_NUMBER } from "@/utils/phases";

// ── XML helpers ─────────────────────────────────────────────────────────

function escXml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name, value) {
  if (value == null || value === "") return "";
  return `<${name}>${escXml(String(value))}</${name}>`;
}

/**
 * Convert a day count into MS Project's ISO 8601 duration format "PT{hours}H0M0S".
 * MS Project uses 8-hour workdays by default.
 */
function durationToMsProject(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return "PT8H0M0S"; // default 1 day
  return `PT${d * 8}H0M0S`;
}

/**
 * Format a YYYY-MM-DD date into the MS Project datetime format.
 * MS Project expects "YYYY-MM-DDTHH:MM:SS" (local time, no zone suffix).
 */
function fmtMsDate(dateStr) {
  if (!dateStr) return "";
  const d = String(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return `${d}T08:00:00`;
}

// MS Project link type codes: 0=FF, 1=FS, 2=SF, 3=SS
const LINK_TYPE_CODE = { FF: "0", FS: "1", SF: "2", SS: "3" };

/**
 * Export schedule tasks to MS Project XML string.
 *
 * @param {Array} tasks - Array of schedule task objects from the DB
 * @param {object} projectInfo - { name, project_number, start_date, end_date }
 * @returns {string} Valid MS Project XML
 */
export function exportToMSProjectXML(tasks, projectInfo = {}) {
  if (!tasks || tasks.length === 0) return "";

  // Build a map of task.id → sequential UID (1-based, 0 is project summary)
  const idToUid = {};
  tasks.forEach((t, i) => { idToUid[t.id] = i + 1; });

  // Collect unique resource names
  const resourceSet = new Set();
  tasks.forEach((t) => {
    if (t.resource_names) {
      t.resource_names.split(",").map((r) => r.trim()).filter(Boolean).forEach((r) => resourceSet.add(r));
    }
  });
  const resources = Array.from(resourceSet);
  const resourceToUid = {};
  resources.forEach((r, i) => { resourceToUid[r] = i + 1; });

  // Build assignments
  const assignments = [];
  let assignmentUid = 1;
  tasks.forEach((t) => {
    if (!t.resource_names) return;
    const taskUid = idToUid[t.id];
    t.resource_names.split(",").map((r) => r.trim()).filter(Boolean).forEach((r) => {
      const rUid = resourceToUid[r];
      if (rUid) {
        assignments.push({ uid: assignmentUid++, taskUid, resourceUid: rUid });
      }
    });
  });

  // Determine project date range
  const allStarts = tasks.map((t) => t.start_date).filter(Boolean).sort();
  const allEnds = tasks.map((t) => t.end_date).filter(Boolean).sort();
  const projStart = projectInfo.start_date || allStarts[0] || new Date().toISOString().slice(0, 10);
  const projEnd = projectInfo.end_date || allEnds[allEnds.length - 1] || projStart;

  // Build XML
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  lines.push('<Project xmlns="http://schemas.microsoft.com/project">');
  lines.push(tag("Name", projectInfo.name || "SteelBuild Export"));
  lines.push(tag("Title", projectInfo.name || "SteelBuild Export"));
  lines.push(tag("Subject", `Project ${projectInfo.project_number || ""}`));
  lines.push(tag("Author", "SteelBuild Pro"));
  lines.push(tag("CreationDate", new Date().toISOString()));
  lines.push(tag("StartDate", fmtMsDate(projStart)));
  lines.push(tag("FinishDate", fmtMsDate(projEnd)));
  lines.push(tag("CalendarUID", "1"));
  lines.push(tag("MinutesPerDay", "480"));
  lines.push(tag("MinutesPerWeek", "2400"));
  lines.push(tag("DaysPerMonth", "20"));

  // Calendar (standard 5-day work week)
  lines.push("<Calendars>");
  lines.push("<Calendar>");
  lines.push(tag("UID", "1"));
  lines.push(tag("Name", "Standard"));
  lines.push(tag("IsBaseCalendar", "1"));
  lines.push("<WeekDays>");
  for (let d = 1; d <= 7; d++) {
    lines.push("<WeekDay>");
    lines.push(tag("DayType", String(d)));
    lines.push(tag("DayWorking", (d === 1 || d === 7) ? "0" : "1"));
    if (d >= 2 && d <= 6) {
      lines.push("<WorkingTimes>");
      lines.push("<WorkingTime>");
      lines.push(tag("FromTime", "08:00:00"));
      lines.push(tag("ToTime", "12:00:00"));
      lines.push("</WorkingTime>");
      lines.push("<WorkingTime>");
      lines.push(tag("FromTime", "13:00:00"));
      lines.push(tag("ToTime", "17:00:00"));
      lines.push("</WorkingTime>");
      lines.push("</WorkingTimes>");
    }
    lines.push("</WeekDay>");
  }
  lines.push("</WeekDays>");
  lines.push("</Calendar>");
  lines.push("</Calendars>");

  // Tasks
  lines.push("<Tasks>");

  // Project summary task (UID 0)
  lines.push("<Task>");
  lines.push(tag("UID", "0"));
  lines.push(tag("ID", "0"));
  lines.push(tag("Name", projectInfo.name || "Project"));
  lines.push(tag("Type", "1"));
  lines.push(tag("IsNull", "0"));
  lines.push(tag("OutlineLevel", "0"));
  lines.push(tag("OutlineNumber", "0"));
  lines.push(tag("Summary", "1"));
  lines.push(tag("Start", fmtMsDate(projStart)));
  lines.push(tag("Finish", fmtMsDate(projEnd)));
  lines.push("</Task>");

  tasks.forEach((t, idx) => {
    const uid = idToUid[t.id];
    const outlineLevel = t.outline_level || 1;
    const wbs = t.wbs_code || `${PHASE_NUMBER[t.phase] || 0}.${idx + 1}`;
    const duration = t.duration || 1;
    const isSummary = t.is_summary ? "1" : "0";
    const isMilestone = t.milestone ? "1" : "0";

    lines.push("<Task>");
    lines.push(tag("UID", String(uid)));
    lines.push(tag("ID", String(uid)));
    lines.push(tag("Name", t.task_name || "Untitled"));
    lines.push(tag("Type", "1")); // Fixed duration
    lines.push(tag("IsNull", "0"));
    lines.push(tag("OutlineLevel", String(outlineLevel)));
    lines.push(tag("OutlineNumber", wbs));
    lines.push(tag("Summary", isSummary));
    lines.push(tag("Milestone", isMilestone));
    lines.push(tag("Start", fmtMsDate(t.start_date)));
    lines.push(tag("Finish", fmtMsDate(t.end_date)));
    lines.push(tag("Duration", durationToMsProject(duration)));
    lines.push(tag("PercentComplete", String(t.percent_complete || 0)));
    if (t.notes) lines.push(tag("Notes", t.notes));

    // Predecessor links
    const deps = parseDependencies(t.dependencies);
    deps.forEach((dep) => {
      const predUid = idToUid[dep.id];
      if (!predUid) return;
      const typeCode = LINK_TYPE_CODE[dep.type] || "1"; // default FS
      const lagTenths = (dep.lag_days || 0) * 4800; // tenths of minutes per 8h day
      lines.push("<PredecessorLink>");
      lines.push(tag("PredecessorUID", String(predUid)));
      lines.push(tag("Type", typeCode));
      lines.push(tag("LinkLag", String(lagTenths)));
      lines.push(tag("LagFormat", "7")); // 7 = days
      lines.push("</PredecessorLink>");
    });

    lines.push("</Task>");
  });

  lines.push("</Tasks>");

  // Resources
  lines.push("<Resources>");
  resources.forEach((name, i) => {
    lines.push("<Resource>");
    lines.push(tag("UID", String(i + 1)));
    lines.push(tag("ID", String(i + 1)));
    lines.push(tag("Name", name));
    lines.push(tag("Type", "1")); // Work resource
    lines.push("</Resource>");
  });
  lines.push("</Resources>");

  // Assignments
  lines.push("<Assignments>");
  assignments.forEach((a) => {
    lines.push("<Assignment>");
    lines.push(tag("UID", String(a.uid)));
    lines.push(tag("TaskUID", String(a.taskUid)));
    lines.push(tag("ResourceUID", String(a.resourceUid)));
    lines.push("</Assignment>");
  });
  lines.push("</Assignments>");

  lines.push("</Project>");
  return lines.join("\n");
}

/**
 * Parse the dependencies field from a schedule task.
 * Can be JSON string of [{id, type, lag_days}] or a comma-separated ID list.
 */
function parseDependencies(deps) {
  if (!deps) return [];
  if (typeof deps === "string") {
    try {
      const parsed = JSON.parse(deps);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall back to comma-separated IDs
      return deps.split(",").map((s) => s.trim()).filter(Boolean).map((id) => ({
        id: Number(id) || id,
        type: "FS",
        lag_days: 0,
      }));
    }
  }
  if (Array.isArray(deps)) return deps;
  return [];
}

/**
 * Trigger a download of the MS Project XML file.
 */
export function downloadMSProjectXML(tasks, projectInfo = {}) {
  const xml = exportToMSProjectXML(tasks, projectInfo);
  if (!xml) return;
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const filename = `${projectInfo.project_number || "project"}-schedule.xml`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
