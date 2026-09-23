/**
 * importPsrSpreadsheet.ts — parse a detailer's Job Status Report (PSR)
 * workbook into a structured snapshot, match it to a project, and build the
 * projects.metadata.psr patch that stores it.
 */

import { todayUtcMidnightFromLocal } from "@/lib/dateMath";

/** A worksheet row after normalizeRow: every cell trimmed text. */
type PsrRow = string[];

export type PsrHealthStatus = "At Risk" | "Watch" | "On Track";
export type PsrConfidence = "high" | "needs-review";

export interface PsrSchedulePackage {
  package_name: string;
  area: string | null;
  dates: Record<string, string>;
  notes: string[];
}

export interface PsrDesignRevision {
  title: string;
  received_date: string;
  detailer_cor_number: string;
  sent_date: string;
  approved_date: string;
  comments: string;
}

export interface PsrCoordinationDoc {
  title: string;
  requested_date: string;
  received_date: string;
  comments: string;
  is_pending: boolean;
  is_past_due: boolean;
}

export interface PsrIssue {
  source_text: string;
  number: string;
  description: string;
  client_reference: string;
  sent_date: string;
  received_date: string;
  status: string;
  comments: string;
  is_open: boolean;
}

export interface PsrCounts {
  schedule_packages: number;
  design_revisions: number;
  coordination_docs: number;
  pending_coordination_docs: number;
  past_due_coordination_docs: number;
  rfis: number;
  open_rfis: number;
  queries: number;
  open_queries: number;
  comments: number;
}

export interface ParsedPsr {
  source_type: "sol_psr_spreadsheet";
  file_name: string;
  sheet_name: string;
  job_number: string;
  job_number_source: "worksheet" | "filename" | "missing";
  customer: string;
  job_name: string;
  project_manager: string;
  detailer: string;
  date_received: string;
  last_updated: string;
  schedule: PsrSchedulePackage[];
  design_revisions: PsrDesignRevision[];
  coordination_docs: PsrCoordinationDoc[];
  rfis: PsrIssue[];
  queries: PsrIssue[];
  comments: string[];
  counts: PsrCounts;
  proposed_health_status: PsrHealthStatus;
  confidence: PsrConfidence;
  warnings: string[];
}

export type ParsedPsrWorkbook = ParsedPsr & {
  workbook_sheet_count: number;
  parsed_sheet_candidates: number;
};

/** The project columns PSR matching and patching read. */
export interface PsrProjectRef {
  id?: string;
  name?: string | null;
  project_number?: string | null;
  metadata?: unknown;
  last_report_date?: string | null;
  lastReportDate?: string | null;
}

export interface PsrProjectMatch<P extends PsrProjectRef = PsrProjectRef> {
  project: P | null;
  score: number;
  confidence: "high" | "needs-review" | "none";
  reasons: string[];
}

export interface PsrProjectPatch {
  metadata: Record<string, unknown>;
  health_status?: PsrHealthStatus;
}

interface PsrCandidate {
  index: number;
  sheetName: string;
  parsed: ParsedPsr;
}

interface IssueColumnMap {
  client?: number;
  sent?: number;
  received?: number;
  status?: number;
  comments?: number;
}

const MAX_PSR_FILE_BYTES = 16 * 1024 * 1024;
const PSR_HISTORY_LIMIT = 10;

const SECTION_MARKERS = [
  "DESIGN REVISION",
  "COORDINATION DOCS.",
  "RFI #/ DESCRIPTION",
  "QUERY #/ DESCRIPTION",
  "COMMENTS",
];

// Labels a PSR worksheet may print beside the job number, in priority order.
// "S & H #" is the label on the detailer's existing template — we read it
// because it is in their file, not as a name of our own. The rest are
// neutral aliases so other templates are recognised too.
const JOB_NUMBER_LABELS = [
  "S & H #",
  "JOB #",
  "JOB NUMBER",
  "JOB NO",
  "PROJECT #",
  "PROJECT NUMBER",
];

const normalizeText =(value: unknown): string =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeKey = (value: unknown): string =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[._/#:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const digitsOnly = (value: unknown): string => normalizeText(value).replace(/\D+/g, "");

function extractJobNumberFromFileName(fileName: unknown): string {
  const baseName = normalizeText(fileName).split(/[\\/]/).pop() || "";
  const parenthetical = baseName.match(/\((\d{4,6})\)/);
  return parenthetical?.[1] || "";
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asObject = (value: unknown): Record<string, unknown> => (isPlainObject(value) ? value : {});

function normalizeRow(row: ArrayLike<unknown> | null | undefined): PsrRow {
  return Array.from(row || [], (cell: unknown) => {
    if (cell == null) return "";
    return normalizeText(cell);
  });
}

function getFirstNonEmptyAfter(row: PsrRow, startIndex = 1): string {
  for (let i = startIndex; i < row.length; i += 1) {
    const value = normalizeText(row[i]);
    if (value) return value;
  }
  return "";
}

function findRowIndex(rows: PsrRow[], label: string): number {
  const wanted = normalizeKey(label);
  return rows.findIndex((row) => normalizeKey(row[0]) === wanted);
}

function findHeaderValue(rows: PsrRow[], label: string): string {
  const wanted = normalizeKey(label);
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      if (normalizeKey(row[i]) === wanted) {
        return getFirstNonEmptyAfter(row, i + 1);
      }
    }
  }
  return "";
}

function findFirstHeaderValue(rows: PsrRow[], labels: string[]): string {
  for (const label of labels) {
    const value = findHeaderValue(rows, label);
    if (value) return value;
  }
  return "";
}

function findNextSectionIndex(rows: PsrRow[], startIndex: number, markerLabels: string[]): number {
  const markers = new Set(markerLabels.map(normalizeKey));
  for (let i = Math.max(0, startIndex); i < rows.length; i += 1) {
    if (markers.has(normalizeKey(rows[i]?.[0]))) return i;
  }
  return rows.length;
}

function hasMeaningfulData(row: PsrRow, startIndex = 1): boolean {
  return row.slice(startIndex).some((cell) => normalizeText(cell));
}

function isAreaRow(row: PsrRow): boolean {
  const title = normalizeText(row[0]);
  if (!title || hasMeaningfulData(row)) return false;
  return (
    /^building\b/i.test(title) ||
    /^area\b/i.test(title) ||
    /^phase\b/i.test(title) ||
    /^zone\b/i.test(title)
  );
}

function normalizeDateDisplay(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  return raw;
}

function parseDateForRisk(value: unknown): Date | null {
  const raw = normalizeDateDisplay(value);
  if (!raw) return null;

  const clean = raw.split(",")[0].trim();
  let match = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})$/.exec(clean);
  if (match) {
    const months: Record<string, number> = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
      apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
      aug: 7, august: 7, sep: 8, sept: 8, september: 8,
      oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
    };
    const month = months[match[2].toLowerCase()];
    if (month !== undefined) {
      let year = Number(match[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      return new Date(Date.UTC(year, month, Number(match[1])));
    }
  }

  match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(clean);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return new Date(Date.UTC(year, Number(match[1]) - 1, Number(match[2])));
  }

  match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(clean);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  const parsed = Date.parse(clean);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function isPastDue(dateValue: unknown, now: Date = new Date()): boolean {
  const date = parseDateForRisk(dateValue);
  if (!date) return false;
  // parseDateForRisk anchors at UTC midnight; today must be the user's local
  // calendar day on that same anchor, or an Arizona evening reads as tomorrow.
  const today = todayUtcMidnightFromLocal(now);
  return date.getTime() < today.getTime();
}

function buildSchedule(rows: PsrRow[], startIndex: number, endIndex: number): PsrSchedulePackage[] {
  const header = rows[startIndex] || [];
  const schedule: PsrSchedulePackage[] = [];
  let currentArea = "";

  for (let i = startIndex + 1; i < endIndex; i += 1) {
    const row = rows[i] || [];
    const packageName = normalizeText(row[0]);
    if (!packageName) continue;
    if (isAreaRow(row)) {
      currentArea = packageName;
      continue;
    }
    if (!hasMeaningfulData(row)) continue;

    const item: PsrSchedulePackage = {
      package_name: packageName,
      area: currentArea || null,
      dates: {},
      notes: [],
    };

    for (let col = 1; col < Math.min(header.length, row.length); col += 1) {
      const key = normalizeText(header[col]);
      const value = normalizeDateDisplay(row[col]);
      if (!value) continue;
      if (key) item.dates[key] = value;
      else item.notes.push(value);
    }

    for (let col = header.length; col < row.length; col += 1) {
      const value = normalizeText(row[col]);
      if (value) item.notes.push(value);
    }

    schedule.push(item);
  }

  return schedule;
}

function buildDesignRevisions(rows: PsrRow[], startIndex: number, endIndex: number): PsrDesignRevision[] {
  const revisions: PsrDesignRevision[] = [];
  for (let i = startIndex + 1; i < endIndex; i += 1) {
    const row = rows[i] || [];
    const title = normalizeText(row[0]);
    if (!title) continue;
    revisions.push({
      title,
      received_date: normalizeDateDisplay(row[1]),
      detailer_cor_number: normalizeText(row[3]),
      sent_date: normalizeDateDisplay(row[5]),
      approved_date: normalizeDateDisplay(row[6]),
      comments: normalizeText(row[8] || row[5]),
    });
  }
  return revisions;
}

function buildCoordinationDocs(rows: PsrRow[], startIndex: number, endIndex: number, now: Date): PsrCoordinationDoc[] {
  const docs: PsrCoordinationDoc[] = [];
  for (let i = startIndex + 1; i < endIndex; i += 1) {
    const row = rows[i] || [];
    const title = normalizeText(row[0]);
    if (!title) continue;
    const requestedDate = normalizeDateDisplay(row[1]);
    const receivedDate = normalizeDateDisplay(row[2]);
    const comments = normalizeText(row.slice(3).filter(Boolean).join(" "));
    docs.push({
      title,
      requested_date: requestedDate,
      received_date: receivedDate,
      comments,
      is_pending: Boolean(requestedDate && !receivedDate),
      is_past_due: Boolean(requestedDate && !receivedDate && isPastDue(requestedDate, now)),
    });
  }
  return docs;
}

function buildHeaderMap(row: PsrRow): IssueColumnMap {
  const map: IssueColumnMap = {};
  row.forEach((cell, index) => {
    const key = normalizeKey(cell);
    if (!key) return;
    if (key.includes("client rfi")) map.client = index;
    else if (key === "sent") map.sent = index;
    else if (key === "received" || key === "reply date") map.received = index;
    else if (key === "status") map.status = index;
    else if (key === "comments" || key === "comment" || key === "remark") map.comments = index;
  });
  return map;
}

function extractNumberAndDescription(value: unknown, token: string): { source_text: string; number: string; description: string } {
  const raw = normalizeText(value);
  const numberMatch = new RegExp(`${token}\\s*#?\\s*([\\w.-]+)`, "i").exec(raw);
  const descMatch = /\((.*)\)/.exec(raw);
  return {
    source_text: raw,
    number: numberMatch ? numberMatch[1] : "",
    description: descMatch ? descMatch[1].trim() : raw,
  };
}

function isClosedStatus(status: unknown): boolean {
  const key = normalizeKey(status);
  return key.includes("closed") && !key.includes("partially");
}

function buildIssueRows(rows: PsrRow[], startIndex: number, endIndex: number, token: "RFI" | "Query"): PsrIssue[] {
  const headerMap = buildHeaderMap(rows[startIndex] || []);
  const issues: PsrIssue[] = [];
  const fallback: Required<IssueColumnMap> = token === "RFI"
    ? { client: 1, sent: 3, received: 4, status: 5, comments: 8 }
    : { client: 1, sent: 3, received: 4, status: 5, comments: 5 };

  for (let i = startIndex + 1; i < endIndex; i += 1) {
    const row = rows[i] || [];
    const title = normalizeText(row[0]);
    if (!title) continue;
    const parsed = extractNumberAndDescription(title, token);
    const status = normalizeText(row[headerMap.status ?? fallback.status]);
    const received = normalizeDateDisplay(row[headerMap.received ?? fallback.received]);
    const comments = normalizeText(row[headerMap.comments ?? fallback.comments]);

    issues.push({
      source_text: parsed.source_text,
      number: parsed.number,
      description: parsed.description,
      client_reference: normalizeText(row[headerMap.client ?? fallback.client]),
      sent_date: normalizeDateDisplay(row[headerMap.sent ?? fallback.sent]),
      received_date: received,
      status,
      comments,
      is_open: !received || !isClosedStatus(status || comments),
    });
  }

  return issues;
}

function buildComments(rows: PsrRow[], startIndex: number): string[] {
  if (startIndex < 0) return [];
  return rows
    .slice(startIndex + 1)
    .map((row) => normalizeText(row[0]))
    .filter(Boolean);
}

function recommendHealthStatus({
  coordinationDocs,
  coordination_docs,
  rfis,
  queries,
}: {
  coordinationDocs?: PsrCoordinationDoc[];
  coordination_docs?: PsrCoordinationDoc[];
  rfis?: PsrIssue[];
  queries?: PsrIssue[];
}): PsrHealthStatus {
  const docs = coordinationDocs || coordination_docs || [];
  const rfiRows = rfis || [];
  const queryRows = queries || [];
  const pendingDocs = docs.filter((doc) => doc.is_pending);
  const pastDueDocs = pendingDocs.filter((doc) => doc.is_past_due);
  const openRfis = rfiRows.filter((rfi) => rfi.is_open);
  const openQueries = queryRows.filter((query) => query.is_open);

  if (pastDueDocs.length > 0 || openRfis.length >= 3) return "At Risk";
  if (pendingDocs.length > 0 || openRfis.length > 0 || openQueries.length > 0) return "Watch";
  return "On Track";
}

export function parsePsrRows(
  rawRows: ReadonlyArray<ArrayLike<unknown> | null | undefined>,
  { fileName = "", sheetName = "", now = new Date() }: { fileName?: string; sheetName?: string; now?: Date } = {},
): ParsedPsr {
  const rows = rawRows.map(normalizeRow).filter((row) => row.some(Boolean));
  const scheduleMarker = findRowIndex(rows, "SCHEDULE");
  const scheduleHeaderIndex = rows.findIndex((row, index) =>
    index > scheduleMarker && normalizeKey(row[0]) === "submittal package"
  );
  const designIndex = findRowIndex(rows, "DESIGN REVISION");
  const coordinationIndex = findRowIndex(rows, "COORDINATION DOCS.");
  const rfiIndex = findRowIndex(rows, "RFI #/ DESCRIPTION");
  const queryIndex = findRowIndex(rows, "QUERY #/ DESCRIPTION");
  const commentsIndex = findRowIndex(rows, "COMMENTS");

  const scheduleEnd = findNextSectionIndex(rows, scheduleHeaderIndex + 1, SECTION_MARKERS);
  const designEnd = coordinationIndex >= 0 ? coordinationIndex : findNextSectionIndex(rows, designIndex + 1, SECTION_MARKERS.slice(1));
  const coordinationEnd = rfiIndex >= 0 ? rfiIndex : findNextSectionIndex(rows, coordinationIndex + 1, SECTION_MARKERS.slice(2));
  const rfiEnd = queryIndex >= 0 ? queryIndex : findNextSectionIndex(rows, rfiIndex + 1, SECTION_MARKERS.slice(3));
  const queryEnd = commentsIndex >= 0 ? commentsIndex : rows.length;

  const coordinationDocs = coordinationIndex >= 0
    ? buildCoordinationDocs(rows, coordinationIndex, coordinationEnd, now)
    : [];
  const rfis = rfiIndex >= 0 ? buildIssueRows(rows, rfiIndex, rfiEnd, "RFI") : [];
  const queries = queryIndex >= 0 ? buildIssueRows(rows, queryIndex, queryEnd, "Query") : [];
  const schedule = scheduleHeaderIndex >= 0 ? buildSchedule(rows, scheduleHeaderIndex, scheduleEnd) : [];
  const designRevisions = designIndex >= 0 ? buildDesignRevisions(rows, designIndex, designEnd) : [];
  const comments = buildComments(rows, commentsIndex);

  const headerJobNumber = findFirstHeaderValue(rows, JOB_NUMBER_LABELS);
  const fileJobNumber = extractJobNumberFromFileName(fileName);
  const jobNumber = headerJobNumber || fileJobNumber;
  const jobNumberSource: ParsedPsr["job_number_source"] =
    headerJobNumber ? "worksheet" : jobNumber ? "filename" : "missing";
  const sections = {
    source_type: "sol_psr_spreadsheet" as const,
    file_name: fileName,
    sheet_name: sheetName,
    job_number: jobNumber,
    job_number_source: jobNumberSource,
    customer: findHeaderValue(rows, "CUSTOMER"),
    job_name: findHeaderValue(rows, "JOB NAME"),
    project_manager: findHeaderValue(rows, "PROJECT MANAGER/TEAM") || findHeaderValue(rows, "PROJECT MANAGER"),
    detailer: findHeaderValue(rows, "DETAILER"),
    date_received: findHeaderValue(rows, "DATE RECEIVED"),
    last_updated: findHeaderValue(rows, "LAST UPDATED"),
    schedule,
    design_revisions: designRevisions,
    coordination_docs: coordinationDocs,
    rfis,
    queries,
    comments,
  };

  const counts: PsrCounts = {
    schedule_packages: schedule.length,
    design_revisions: designRevisions.length,
    coordination_docs: coordinationDocs.length,
    pending_coordination_docs: coordinationDocs.filter((doc) => doc.is_pending).length,
    past_due_coordination_docs: coordinationDocs.filter((doc) => doc.is_past_due).length,
    rfis: rfis.length,
    open_rfis: rfis.filter((rfi) => rfi.is_open).length,
    queries: queries.length,
    open_queries: queries.filter((query) => query.is_open).length,
    comments: comments.length,
  };
  const parsed: ParsedPsr = {
    ...sections,
    counts,
    proposed_health_status: recommendHealthStatus(sections),
    confidence: jobNumber && sections.job_name && (schedule.length || rfis.length || coordinationDocs.length)
      ? "high"
      : "needs-review",
    warnings: [],
  };
  if (!jobNumber) parsed.warnings.push("No job number was found.");
  if (!headerJobNumber && jobNumber) {
    parsed.warnings.push("No job number was found on the worksheet; using the file name.");
  }
  if (!parsed.job_name) parsed.warnings.push("No job name was found.");
  if (!schedule.length && !rfis.length && !coordinationDocs.length) {
    parsed.warnings.push("No PSR schedule, coordination, or RFI sections were found.");
  }

  return parsed;
}

function selectPsrCandidate(candidates: PsrCandidate[], fileName: string): PsrCandidate {
  const fileDigits = digitsOnly(fileName);
  return [...candidates].sort((a, b) => {
    const aScore = candidateScore(a, fileDigits);
    const bScore = candidateScore(b, fileDigits);
    return bScore - aScore;
  })[0];
}

function candidateScore(candidate: PsrCandidate, fileDigits: string): number {
  let score = candidate.index;
  const parsed = candidate.parsed;
  const jobDigits = digitsOnly(parsed.job_number);
  const parsedSections =
    parsed.counts.schedule_packages +
    parsed.counts.coordination_docs +
    parsed.counts.rfis +
    parsed.counts.queries;
  if (parsed.confidence === "high") score += 100;
  if (parsed.job_number_source === "worksheet") score += 25;
  if (parsed.job_number_source === "filename") score += 5;
  if (jobDigits && fileDigits.includes(jobDigits)) score += 40;
  const lastUpdated = parseDateForRisk(parsed.last_updated);
  if (lastUpdated && lastUpdated.getUTCFullYear() >= 2020) score += 20;
  score += Math.min(parsedSections, 20);
  return score;
}

export async function readPsrSpreadsheetFile(file: File | null | undefined): Promise<ParsedPsrWorkbook> {
  if (!file) throw new Error("No file provided.");
  if (!/\.(xls|xlsx|xlsm)$/i.test(file.name)) {
    throw new Error("PSR import expects a .xls, .xlsx, or .xlsm spreadsheet.");
  }
  if (file.size > MAX_PSR_FILE_BYTES) {
    throw new Error(`PSR spreadsheet exceeds 16 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
  }

  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, cellStyles: false });
  const candidates: PsrCandidate[] = [];

  workbook.SheetNames.forEach((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const hasReportTitle = rows.some((row) => normalizeKey(row?.[0]) === "job status report");
    if (!hasReportTitle) return;
    candidates.push({
      index,
      sheetName,
      parsed: parsePsrRows(rows, { fileName: file.name, sheetName }),
    });
  });

  if (candidates.length === 0) {
    throw new Error("No JOB STATUS REPORT worksheet was found in this workbook.");
  }

  const selected = selectPsrCandidate(candidates, file.name);
  return {
    ...selected.parsed,
    workbook_sheet_count: workbook.SheetNames.length,
    parsed_sheet_candidates: candidates.length,
  };
}

export function matchPsrToProject<P extends PsrProjectRef>(
  parsed: Pick<ParsedPsr, "job_number" | "job_name"> | null | undefined,
  projects: ReadonlyArray<P> = [],
): PsrProjectMatch<P> {
  const jobDigits = digitsOnly(parsed?.job_number);
  const nameKey = normalizeKey(parsed?.job_name);

  const scored = projects.map((project) => {
    const projectDigits = digitsOnly(project.project_number);
    const projectNameKey = normalizeKey(project.name);
    let score = 0;
    const reasons: string[] = [];

    if (jobDigits && projectDigits && jobDigits === projectDigits) {
      score += 100;
      reasons.push("Job number matches project number");
    } else if (jobDigits && projectDigits && (projectDigits.includes(jobDigits) || jobDigits.includes(projectDigits))) {
      score += 70;
      reasons.push("Project number partially matches job number");
    }

    if (nameKey && projectNameKey) {
      if (projectNameKey === nameKey) {
        score += 50;
        reasons.push("Job name matches project name");
      } else if (projectNameKey.includes(nameKey) || nameKey.includes(projectNameKey)) {
        score += 30;
        reasons.push("Job name partially matches project name");
      }
    }

    return { project, score, reasons };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 30) {
    return { project: null, score: 0, confidence: "none", reasons: [] };
  }
  return {
    project: best.project,
    score: best.score,
    confidence: best.score >= 100 ? "high" : "needs-review",
    reasons: best.reasons,
  };
}

export function buildPsrProjectPatch(
  project: PsrProjectRef | null | undefined,
  parsed: ParsedPsr,
  {
    applyHealthStatus = false,
    importedAt = new Date().toISOString(),
  }: { applyHealthStatus?: boolean; importedAt?: string } = {},
): PsrProjectPatch {
  const existingMetadata = asObject(project?.metadata);
  const existingPsr = asObject(existingMetadata.psr);
  const history = Array.isArray(existingPsr.import_history) ? existingPsr.import_history : [];

  const snapshot = {
    source_type: parsed.source_type,
    file_name: parsed.file_name,
    sheet_name: parsed.sheet_name,
    job_number: parsed.job_number,
    job_name: parsed.job_name,
    customer: parsed.customer,
    project_manager: parsed.project_manager,
    detailer: parsed.detailer,
    date_received: parsed.date_received,
    last_updated: parsed.last_updated,
    imported_at: importedAt,
    counts: parsed.counts,
    proposed_health_status: parsed.proposed_health_status,
    schedule: parsed.schedule,
    design_revisions: parsed.design_revisions,
    coordination_docs: parsed.coordination_docs,
    rfis: parsed.rfis,
    queries: parsed.queries,
    comments: parsed.comments,
  };

  const nextPsr = {
    ...existingPsr,
    latest: snapshot,
    last_imported_at: importedAt,
    last_source_updated: parsed.last_updated || existingPsr.last_source_updated || null,
    source_file_name: parsed.file_name,
    job_number: parsed.job_number,
    job_name: parsed.job_name,
    counts: parsed.counts,
    import_history: [
      {
        imported_at: importedAt,
        file_name: parsed.file_name,
        sheet_name: parsed.sheet_name,
        job_number: parsed.job_number,
        last_updated: parsed.last_updated,
        counts: parsed.counts,
        proposed_health_status: parsed.proposed_health_status,
      },
      ...history,
    ].slice(0, PSR_HISTORY_LIMIT),
  };

  const patch: PsrProjectPatch = {
    metadata: {
      ...existingMetadata,
      psr: nextPsr,
    },
  };

  if (applyHealthStatus && parsed.proposed_health_status) {
    patch.health_status = parsed.proposed_health_status;
  }

  return patch;
}

export function getPsrReportDate(project: PsrProjectRef | null | undefined): unknown {
  const metadata = asObject(project?.metadata);
  const psr = asObject(metadata.psr);
  return (
    project?.last_report_date ||
    project?.lastReportDate ||
    psr.last_imported_at ||
    asObject(psr.latest).imported_at ||
    psr.last_source_updated ||
    null
  );
}

export function formatPsrSummary(parsed: Pick<ParsedPsr, "counts"> | null | undefined): string {
  if (!parsed) return "";
  const counts: Partial<PsrCounts> = parsed.counts || {};
  return `${counts.open_rfis || 0} open RFIs, ${counts.pending_coordination_docs || 0} pending docs`;
}
