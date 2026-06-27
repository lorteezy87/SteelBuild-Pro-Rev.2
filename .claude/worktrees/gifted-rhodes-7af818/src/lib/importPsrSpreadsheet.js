const MAX_PSR_FILE_BYTES = 16 * 1024 * 1024;
const PSR_HISTORY_LIMIT = 10;

const SECTION_MARKERS = [
  "DESIGN REVISION",
  "COORDINATION DOCS.",
  "RFI #/ DESCRIPTION",
  "QUERY #/ DESCRIPTION",
  "COMMENTS",
];

const normalizeText = (value) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeKey = (value) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[._/#:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const digitsOnly = (value) => normalizeText(value).replace(/\D+/g, "");

function extractJobNumberFromFileName(fileName) {
  const baseName = normalizeText(fileName).split(/[\\/]/).pop() || "";
  const parenthetical = baseName.match(/\((\d{4,6})\)/);
  return parenthetical?.[1] || "";
}

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asObject = (value) => (isPlainObject(value) ? value : {});

function normalizeRow(row) {
  return Array.from(row || [], (cell) => {
    if (cell == null) return "";
    return normalizeText(cell);
  });
}

function getFirstNonEmptyAfter(row, startIndex = 1) {
  for (let i = startIndex; i < row.length; i += 1) {
    const value = normalizeText(row[i]);
    if (value) return value;
  }
  return "";
}

function findRowIndex(rows, label) {
  const wanted = normalizeKey(label);
  return rows.findIndex((row) => normalizeKey(row[0]) === wanted);
}

function findHeaderValue(rows, label) {
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

function findNextSectionIndex(rows, startIndex, markerLabels) {
  const markers = new Set(markerLabels.map(normalizeKey));
  for (let i = Math.max(0, startIndex); i < rows.length; i += 1) {
    if (markers.has(normalizeKey(rows[i]?.[0]))) return i;
  }
  return rows.length;
}

function hasMeaningfulData(row, startIndex = 1) {
  return row.slice(startIndex).some((cell) => normalizeText(cell));
}

function isAreaRow(row) {
  const title = normalizeText(row[0]);
  if (!title || hasMeaningfulData(row)) return false;
  return (
    /^building\b/i.test(title) ||
    /^area\b/i.test(title) ||
    /^phase\b/i.test(title) ||
    /^zone\b/i.test(title)
  );
}

function normalizeDateDisplay(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  return raw;
}

function parseDateForRisk(value) {
  const raw = normalizeDateDisplay(value);
  if (!raw) return null;

  const clean = raw.split(",")[0].trim();
  let match = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})$/.exec(clean);
  if (match) {
    const months = {
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

function isPastDue(dateValue, now = new Date()) {
  const date = parseDateForRisk(dateValue);
  if (!date) return false;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return date.getTime() < today.getTime();
}

function buildSchedule(rows, startIndex, endIndex) {
  const header = rows[startIndex] || [];
  const schedule = [];
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

    const item = {
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

function buildDesignRevisions(rows, startIndex, endIndex) {
  const revisions = [];
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

function buildCoordinationDocs(rows, startIndex, endIndex, now) {
  const docs = [];
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

function buildHeaderMap(row) {
  const map = {};
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

function extractNumberAndDescription(value, token) {
  const raw = normalizeText(value);
  const numberMatch = new RegExp(`${token}\\s*#?\\s*([\\w.-]+)`, "i").exec(raw);
  const descMatch = /\((.*)\)/.exec(raw);
  return {
    source_text: raw,
    number: numberMatch ? numberMatch[1] : "",
    description: descMatch ? descMatch[1].trim() : raw,
  };
}

function isClosedStatus(status) {
  const key = normalizeKey(status);
  return key.includes("closed") && !key.includes("partially");
}

function buildIssueRows(rows, startIndex, endIndex, token) {
  const headerMap = buildHeaderMap(rows[startIndex] || []);
  const issues = [];
  const fallback = token === "RFI"
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

function buildComments(rows, startIndex) {
  if (startIndex < 0) return [];
  return rows
    .slice(startIndex + 1)
    .map((row) => normalizeText(row[0]))
    .filter(Boolean);
}

function recommendHealthStatus({ coordinationDocs, coordination_docs, rfis, queries }) {
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

export function parsePsrRows(rawRows, { fileName = "", sheetName = "", now = new Date() } = {}) {
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

  const headerJobNumber = findHeaderValue(rows, "S & H #");
  const fileJobNumber = extractJobNumberFromFileName(fileName);
  const jobNumber = headerJobNumber || fileJobNumber;
  const parsed = {
    source_type: "sol_psr_spreadsheet",
    file_name: fileName,
    sheet_name: sheetName,
    job_number: jobNumber,
    job_number_source: headerJobNumber ? "worksheet" : jobNumber ? "filename" : "missing",
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

  parsed.counts = {
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
  parsed.proposed_health_status = recommendHealthStatus(parsed);
  parsed.confidence = jobNumber && parsed.job_name && (schedule.length || rfis.length || coordinationDocs.length)
    ? "high"
    : "needs-review";
  parsed.warnings = [];
  if (!jobNumber) parsed.warnings.push("No S & H project number was found.");
  if (!headerJobNumber && jobNumber) {
    parsed.warnings.push("No S & H project number was found on the worksheet; using the file name.");
  }
  if (!parsed.job_name) parsed.warnings.push("No job name was found.");
  if (!schedule.length && !rfis.length && !coordinationDocs.length) {
    parsed.warnings.push("No PSR schedule, coordination, or RFI sections were found.");
  }

  return parsed;
}

function selectPsrCandidate(candidates, fileName) {
  const fileDigits = digitsOnly(fileName);
  return [...candidates].sort((a, b) => {
    const aScore = candidateScore(a, fileDigits);
    const bScore = candidateScore(b, fileDigits);
    return bScore - aScore;
  })[0];
}

function candidateScore(candidate, fileDigits) {
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

export async function readPsrSpreadsheetFile(file) {
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
  const candidates = [];

  workbook.SheetNames.forEach((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
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

export function matchPsrToProject(parsed, projects = []) {
  const jobDigits = digitsOnly(parsed?.job_number);
  const nameKey = normalizeKey(parsed?.job_name);

  const scored = projects.map((project) => {
    const projectDigits = digitsOnly(project.project_number);
    const projectNameKey = normalizeKey(project.name);
    let score = 0;
    const reasons = [];

    if (jobDigits && projectDigits && jobDigits === projectDigits) {
      score += 100;
      reasons.push("S & H number matches project number");
    } else if (jobDigits && projectDigits && (projectDigits.includes(jobDigits) || jobDigits.includes(projectDigits))) {
      score += 70;
      reasons.push("Project number partially matches S & H number");
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

export function buildPsrProjectPatch(project, parsed, { applyHealthStatus = false, importedAt = new Date().toISOString() } = {}) {
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

  const patch = {
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

export function getPsrReportDate(project) {
  const metadata = asObject(project?.metadata);
  const psr = asObject(metadata.psr);
  return (
    project?.last_report_date ||
    project?.lastReportDate ||
    psr.last_imported_at ||
    psr.latest?.imported_at ||
    psr.last_source_updated ||
    null
  );
}

export function formatPsrSummary(parsed) {
  if (!parsed) return "";
  const counts = parsed.counts || {};
  return `${counts.open_rfis || 0} open RFIs, ${counts.pending_coordination_docs || 0} pending docs`;
}
