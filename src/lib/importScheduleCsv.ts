/**
 * importScheduleCsv.ts
 *
 * Plain-CSV importer for the Schedule module. Mirrors the RFI / change-order
 * importers — no AI, no credits, no network. Parses client-side and returns
 * `{ header, tasks, warnings, skippedBlankRows }` so a preview modal can
 * review rows, then the shared MPP commit path creates tasks + predecessor
 * links.
 *
 * Supports the common steel-shop export formats:
 *   - Microsoft Project "Save As CSV"
 *   - Primavera P6 activity export
 *   - Excel / SteelBuild template (WBS, Task Name, Phase, dates, …)
 *
 * Column headers are matched case-insensitively with generous synonyms.
 * Predecessor cells accept MS Project / P6 tokens (`1FS+2d`, `1.2.3SS`,
 * `A1000FF-1d`) and comma-separated lists.
 */

import { parseCsv as parseCsvRaw } from "@/lib/importRfiCsv";
import { PHASES } from "@/utils/phases";
import type { ParsedMppTask } from "@/pages/schedule/types";

function parseCsv(raw: string): string[][] {
  return (parseCsvRaw(raw) as string[][]) || [];
}

const SCHEDULE_STATUSES = new Set([
  "Not Started",
  "In Progress",
  "Complete",
  "On Hold",
  "Delayed",
]);

export const SCHEDULE_CSV_TEMPLATE = [
  "WBS,Task Name,Phase,Start,Finish,Duration,Percent Complete,Status,Predecessors,Resources,Outline Level,Milestone,Notes",
  "1,Fabrication,Fabrication,2026-03-01,2026-03-31,22,0,Not Started,,,1,No,Phase summary",
  "1.1,Weld beams,Fabrication,2026-03-01,2026-03-05,5,0,Not Started,,Shop crew,2,No,",
  "1.2,Paint,Fabrication,2026-03-06,2026-03-08,3,0,Not Started,1.1FS+1d,Shop crew,2,No,",
  "",
].join("\n");

export function downloadScheduleCsvTemplate(): void {
  const blob = new Blob([SCHEDULE_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "steelbuild-schedule-import-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Column aliases ──────────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  uid: [
    "id", "uid", "unique id", "uniqueid", "task id", "taskid", "activity id",
    "activityid", "act id",
  ],
  name: [
    "name", "task name", "task", "activity", "activity name", "title",
    "description", "task title",
  ],
  wbs: [
    "wbs", "wbs code", "wbs code", "outline number", "outlinenumber",
    "wbs path", "code",
  ],
  outline_level: [
    "outline level", "outlinelevel", "level", "indent", "indent level",
  ],
  phase: ["phase", "stage", "discipline", "area"],
  start: [
    "start", "start date", "startdate", "planned start", "early start",
    "baseline start", "begin", "from",
  ],
  finish: [
    "finish", "finish date", "finishdate", "end", "end date", "enddate",
    "planned finish", "early finish", "baseline finish", "to", "due",
    "due date",
  ],
  duration: [
    "duration", "orig duration", "original duration", "dur", "days",
    "work", "duration days",
  ],
  pct: [
    "percent complete", "% complete", "pct complete", "%complete",
    "progress", "percent", "%", "complete %",
  ],
  status: ["status", "state", "task status", "activity status"],
  predecessors: [
    "predecessors", "predecessor", "preds", "pred", "depends on",
    "dependencies", "dependency", "links",
  ],
  resources: [
    "resource names", "resources", "resource", "assigned to", "assignee",
    "crew", "crew name",
  ],
  milestone: ["milestone", "is milestone", "ms", "flag"],
  summary: ["summary", "is summary", "is summary task"],
  notes: ["notes", "note", "comments", "comment", "remarks"],
  task_type: ["task type", "type", "activity type"],
};

const JOB_NUMBER_ALIASES = [
  "job number", "job #", "job no", "project number", "project #",
  "project no", "job", "project",
];

const normalize = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[._\-#]+/g, " ")
    .replace(/\s+/g, " ");

function buildColumnIndex(headerRow: string[]): Record<string, number> {
  const idx: Record<string, number> = { job_number: -1 };
  for (const key of Object.keys(COLUMN_ALIASES)) idx[key] = -1;

  const normalized = headerRow.map((h) => normalize(h));
  for (let i = 0; i < normalized.length; i++) {
    const cell = normalized[i];
    if (!cell) continue;
    if (idx.job_number === -1 && JOB_NUMBER_ALIASES.includes(cell)) {
      idx.job_number = i;
      continue;
    }
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (idx[key] !== -1) continue;
      if (aliases.includes(cell)) {
        idx[key] = i;
        break;
      }
    }
  }
  return idx;
}

// ── Date / number / flag helpers ────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Strip a trailing time-of-day so "3/1/2026 8:00 AM" still parses. */
function stripTime(raw: string): string {
  const s = raw.trim();
  const m = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(s);
  if (m) return m[1];
  return s;
}

export function normalizeCsvDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const original = String(raw).trim();
  if (!original) return null;
  const s = stripTime(original);

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) {
      const yn = parseInt(y, 10);
      y = String(yn >= 70 ? 1900 + yn : 2000 + yn);
    }
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  m = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) {
      let y = m[3];
      if (y.length === 2) {
        const yn = parseInt(y, 10);
        y = String(yn >= 70 ? 1900 + yn : 2000 + yn);
      }
      return `${y}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
  }
  m = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) {
      let y = m[3];
      if (y.length === 2) {
        const yn = parseInt(y, 10);
        y = String(yn >= 70 ? 1900 + yn : 2000 + yn);
      }
      return `${y}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }

  // Excel serial date (days since 1899-12-30). Typical project dates land
  // in the 40k–60k range; reject anything outside a sane construction window.
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial >= 20000 && serial <= 80000) {
      const epoch = Date.UTC(1899, 11, 30);
      return new Date(epoch + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
    }
  }

  const t = Date.parse(s);
  if (Number.isFinite(t)) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    if (y >= 1980 && y <= 2200) return d.toISOString().slice(0, 10);
  }
  return null;
}

export function parseDurationDays(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/\?$/g, "").trim();
  if (!s) return null;

  // MS Project XML-style duration that sometimes leaks into CSV exports.
  const pt = /^PT(\d+)H/i.exec(s);
  if (pt) return Math.round(Number(pt[1]) / 8);

  const weeks = /^(\d+(?:\.\d+)?)\s*(w|wk|wks|week|weeks)\b/i.exec(s);
  if (weeks) return Math.round(Number(weeks[1]) * 5);

  const hours = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/i.exec(s);
  if (hours) return Math.round(Number(hours[1]) / 8);

  const days = /^(\d+(?:\.\d+)?)\s*(d|day|days|edays|eday)?\b/i.exec(s);
  if (days) return Math.round(Number(days[1]));

  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function parsePercentComplete(raw: unknown): number {
  if (raw === null || raw === undefined || String(raw).trim() === "") return 0;
  const s = String(raw).trim();
  const hasPct = s.includes("%");
  const n = Number(s.replace(/%/g, "").replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return 0;
  if (hasPct || n > 1) return Math.max(0, Math.min(100, Math.round(n)));
  // Bare values strictly between 0 and 1 are Excel fractions (0.5 = 50%).
  // `1` stays 1% — treating it as 100% would silently complete the task.
  if (n > 0 && n < 1) return Math.max(0, Math.min(100, Math.round(n * 100)));
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function parseBoolFlag(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  const s = String(raw).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "x";
}

/**
 * Map free-text status onto the schedule_tasks CHECK vocabulary.
 * Returns null when unmapped so the caller can derive from % complete.
 */
export function normalizeScheduleStatus(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (/^(not\s*started|ns|planned|new|open)$/.test(s)) return "Not Started";
  if (/^(in\s*progress|started|active|wip|working)$/.test(s)) return "In Progress";
  if (/^(complete|completed|done|finished|closed)$/.test(s)) return "Complete";
  if (/^(on\s*hold|hold|held|paused)$/.test(s)) return "On Hold";
  if (/^(delayed|late|behind)$/.test(s)) return "Delayed";
  return null;
}

const PHASE_ALIASES: Record<string, string> = {
  DETAILING: "Detailing",
  FABRICATION: "Fabrication",
  DELIVERY: "Delivery",
  EQUIPMENT: "Procurement",
  INSTALLATION: "Installation",
  "INSTALLATION/ERECTION": "Installation",
  "INSTALLATION ERECTION": "Installation",
  ERECTION: "Erection",
  CLOSEOUT: "Closeout",
  "PRE-CONSTRUCTION": "Pre-Construction",
  PROCUREMENT: "Procurement",
  PRECON: "Pre-Construction",
  "PRE CON": "Pre-Construction",
  PRECONSTRUCTION: "Pre-Construction",
  FAB: "Fabrication",
  ERECT: "Erection",
  INSTALL: "Installation",
  PROCURE: "Procurement",
  CLOSE: "Closeout",
};

export function normalizePhase(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (PHASES.includes(s)) return s;
  const upper = s.toUpperCase().trim();
  if (PHASE_ALIASES[upper]) return PHASE_ALIASES[upper];
  const key = upper.replace(/[_./]+/g, " ").replace(/\s+/g, " ").trim();
  if (PHASE_ALIASES[key]) return PHASE_ALIASES[key];
  const compact = key.replace(/\s+/g, "");
  if (PHASE_ALIASES[compact]) return PHASE_ALIASES[compact];
  return s;
}

/**
 * Reconcile status + percent so the row will pass
 * `chk_schedule_tasks_status` and `schedule_status_pct_consistency`.
 */
export function reconcileStatusAndPct(
  statusRaw: unknown,
  pct: number,
): { status: string; pct: number } {
  let status = normalizeScheduleStatus(statusRaw);
  let nextPct = pct;

  if (nextPct >= 100) {
    nextPct = 100;
    if (!status || status === "In Progress" || status === "Not Started") {
      status = "Complete";
    }
  } else if (status === "Complete") {
    nextPct = 100;
  } else if (status === "Not Started") {
    if (nextPct > 0) status = "In Progress";
    else nextPct = 0;
  } else if (!status) {
    status = nextPct > 0 ? "In Progress" : "Not Started";
  }

  if (status === "In Progress" && nextPct >= 100) {
    status = "Complete";
    nextPct = 100;
  }
  if (!SCHEDULE_STATUSES.has(status as string)) status = "Not Started";
  return { status: status as string, pct: nextPct };
}

const LINK_TYPE_TO_MPP: Record<string, string> = {
  FF: "0",
  FS: "1",
  SF: "2",
  SS: "3",
};

const TENTHS_PER_DAY = 10 * 60 * 8;

export interface ParsedPredecessorToken {
  token: string;
  linkType: string; // MS Project numeric Type: 0=FF, 1=FS, 2=SF, 3=SS
  lagTenths: string;
}

/**
 * Parse a single predecessor token. Accepts `1`, `1FS`, `1FS+2d`,
 * `1.2.3SS-1 day`, `A1000FF+2`.
 */
export function parsePredecessorToken(raw: string): ParsedPredecessorToken | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = /^(.+?)(?:\s*(FS|SS|FF|SF))?(?:\s*([+-])\s*(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|week|weeks)?)?$/i.exec(s);
  if (!m) return null;
  const token = m[1].trim();
  if (!token) return null;
  const typeKey = (m[2] || "FS").toUpperCase();
  const sign = m[3] === "-" ? -1 : 1;
  const mag = m[4] ? Number(m[4]) : 0;
  const unit = (m[5] || "d").toLowerCase();
  const days = /w/.test(unit) ? mag * 5 : mag;
  const lagTenths = String(Math.round(sign * days * TENTHS_PER_DAY));
  return {
    token,
    linkType: LINK_TYPE_TO_MPP[typeKey] || "1",
    lagTenths,
  };
}

export function parsePredecessorCell(raw: unknown): ParsedPredecessorToken[] {
  if (raw === null || raw === undefined) return [];
  const s = String(raw).trim();
  if (!s) return [];
  return s
    .split(/[,;]/)
    .map((part) => parsePredecessorToken(part))
    .filter((p): p is ParsedPredecessorToken => Boolean(p));
}

function outlineLevelFromWbs(wbs: string): number {
  if (!wbs) return 1;
  return wbs.split(".").filter(Boolean).length;
}

function calendarDurationDays(start: string | null, finish: string | null): number | null {
  if (!start || !finish) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${finish}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86400000);
}

export interface ParsedScheduleCsvTask extends ParsedMppTask {
  rowNumber: number;
}

export interface ParseScheduleCsvResult {
  header: { job_name?: string; job_number?: string };
  tasks: ParsedScheduleCsvTask[];
  warnings: string[];
  skippedBlankRows: number;
}

function uniqueUid(preferred: string, used: Set<string>, fallback: string): string {
  let uid = preferred || fallback;
  if (!used.has(uid)) {
    used.add(uid);
    return uid;
  }
  let n = 2;
  while (used.has(`${uid}-${n}`)) n += 1;
  const next = `${uid}-${n}`;
  used.add(next);
  return next;
}

function markSummaries(tasks: ParsedScheduleCsvTask[]): void {
  const wbsList = tasks.map((t) => t.outlineNumber).filter(Boolean);
  for (const t of tasks) {
    if (t.isSummary) continue;
    if (t.outlineNumber && wbsList.some((w) => w.startsWith(`${t.outlineNumber}.`))) {
      t.isSummary = true;
    }
  }
  for (let i = 0; i < tasks.length - 1; i++) {
    if (tasks[i + 1].outlineLevel > tasks[i].outlineLevel) {
      tasks[i].isSummary = true;
    }
  }
}

/**
 * Parse a schedule CSV string into the same task shape the MPP importer
 * commits, plus warnings for the preview UI.
 */
export function parseScheduleCsv(csvText: string, { fileName = "" }: { fileName?: string } = {}): ParseScheduleCsvResult {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return { header: {}, tasks: [], warnings: ["File is empty."], skippedBlankRows: 0 };
  }

  let bestIdx = 0;
  let bestScore = -1;
  let bestIdxObj: Record<string, number> | null = null;
  const SCAN_LIMIT = Math.min(10, rows.length);
  for (let r = 0; r < SCAN_LIMIT; r++) {
    const candidate = buildColumnIndex(rows[r]);
    const score = Object.values(candidate).filter((v) => v >= 0).length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = r;
      bestIdxObj = candidate;
    }
  }

  const warnings: string[] = [];
  if (bestScore < 2) {
    warnings.push(
      `Couldn't confidently identify schedule columns from the header. ` +
      `Expected headers like "Task Name", "Start", "Finish", "WBS", "Predecessors". Got: ${rows[bestIdx].join(", ")}`,
    );
  }

  const idx = bestIdxObj || buildColumnIndex(rows[0]);
  if (idx.name < 0) warnings.push(`No task-name column found (looked for "Task Name", "Name", "Activity", etc.).`);

  const header: ParseScheduleCsvResult["header"] = {
    job_name: fileName ? fileName.replace(/\.csv$/i, "") : undefined,
  };

  const tasks: ParsedScheduleCsvTask[] = [];
  const usedUids = new Set<string>();
  const jobNumbers = new Set<string>();
  let skippedBlankRows = 0;
  const unresolvedPredTokens: string[] = [];

  const pendingPreds: Array<{ taskIndex: number; tokens: ParsedPredecessorToken[] }> = [];

  for (let r = bestIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((v) => !v || !String(v).trim())) continue;

    const pick = (key: string) => (idx[key] >= 0 ? String(row[idx[key]] ?? "").trim() : "");

    const name = pick("name");
    if (!name) {
      skippedBlankRows += 1;
      continue;
    }

    const wbs = pick("wbs");
    const uidPreferred = pick("uid") || wbs;
    const uid = uniqueUid(uidPreferred, usedUids, String(tasks.length + 1));

    const outlineRaw = pick("outline_level");
    const outlineLevel = outlineRaw
      ? Math.max(0, parseInt(outlineRaw, 10) || 0)
      : outlineLevelFromWbs(wbs);

    const start = normalizeCsvDate(pick("start"));
    const finish = normalizeCsvDate(pick("finish"));
    const durationDays = parseDurationDays(pick("duration")) ?? calendarDurationDays(start, finish);
    const pctRaw = parsePercentComplete(pick("pct"));
    const { status, pct } = reconcileStatusAndPct(pick("status"), pctRaw);
    const milestone = parseBoolFlag(pick("milestone")) || normalize(pick("task_type")) === "milestone";
    const isSummary = parseBoolFlag(pick("summary")) || normalize(pick("task_type")) === "summary";
    const resourcesRaw = pick("resources");
    const resources = resourcesRaw
      ? resourcesRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      : [];
    const notes = pick("notes");
    const phaseHint = normalizePhase(pick("phase"));
    const job = pick("job_number");
    if (job) jobNumbers.add(job.replace(/\D+/g, ""));

    const predTokens = parsePredecessorCell(pick("predecessors"));

    const task: ParsedScheduleCsvTask = {
      uid,
      name,
      start,
      finish,
      pct,
      preds: [],
      isSummary,
      outlineLevel,
      outlineNumber: wbs,
      milestone,
      durationDays,
      resources,
      notes,
      phaseHint,
      statusHint: status,
      rowNumber: r + 1,
    };
    pendingPreds.push({ taskIndex: tasks.length, tokens: predTokens });
    tasks.push(task);
  }

  markSummaries(tasks);

  // Resolve predecessor tokens against UID, WBS, then unique name.
  const byUid = new Map<string, string>();
  const byWbs = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const t of tasks) {
    byUid.set(t.uid, t.uid);
    if (t.outlineNumber) byWbs.set(t.outlineNumber, t.uid);
    const key = t.name.toLowerCase();
    const list = byName.get(key) || [];
    list.push(t.uid);
    byName.set(key, list);
  }

  const resolveToken = (token: string): string | null => {
    if (byUid.has(token)) return byUid.get(token) as string;
    if (byWbs.has(token)) return byWbs.get(token) as string;
    const names = byName.get(token.toLowerCase());
    if (names && names.length === 1) return names[0];
    return null;
  };

  pendingPreds.forEach(({ taskIndex, tokens }) => {
    const preds = [];
    for (const tok of tokens) {
      const predUid = resolveToken(tok.token);
      if (!predUid) {
        unresolvedPredTokens.push(tok.token);
        continue;
      }
      if (predUid === tasks[taskIndex].uid) continue;
      preds.push({
        predUid,
        linkType: tok.linkType,
        lagDuration: tok.lagTenths,
      });
    }
    tasks[taskIndex].preds = preds;
  });

  if (unresolvedPredTokens.length > 0) {
    const unique = [...new Set(unresolvedPredTokens)];
    warnings.push(
      `${unique.length} predecessor reference${unique.length === 1 ? "" : "s"} could not be matched and will be skipped: ` +
      `${unique.slice(0, 8).map((t) => `"${t}"`).join(", ")}${unique.length > 8 ? "…" : ""}.`,
    );
  }

  if (jobNumbers.size === 1) {
    const [only] = jobNumbers;
    if (only) header.job_number = only;
  }

  return { header, tasks, warnings, skippedBlankRows };
}

export async function readScheduleCsvFile(file: File): Promise<ParseScheduleCsvResult> {
  if (!file) throw new Error("No file provided.");
  const looksCsv =
    /\.(csv|tsv|txt)$/i.test(file.name) ||
    file.type === "text/csv" ||
    file.type === "application/csv" ||
    file.type === "text/plain" ||
    file.type === "text/tab-separated-values";
  if (!looksCsv) throw new Error("File must be a CSV (or plain text).");
  if (file.size > 8 * 1024 * 1024) throw new Error("CSV exceeds 8 MB.");
  const text = await file.text();
  return parseScheduleCsv(text, { fileName: file.name });
}
