import { parseUTCDate } from "@/components/shared/formatters";

export const mono = { fontFamily: "var(--font-mono)" };

export const BIC_COLORS = {
  Contractor: { bg: "rgba(255,107,0,0.15)", text: "var(--accent)" },
  GC: { bg: "rgba(68,226,205,0.18)", text: "var(--secondary)" },
  Engineer: { bg: "rgba(255,185,95,0.15)", text: "var(--status-warning)" },
  Architect: { bg: "rgba(168,240,203,0.18)", text: "var(--status-success)" },
  Owner: { bg: "rgba(255,180,171,0.18)", text: "var(--status-error)" },
};

export const PRIORITY_CFG = {
  Critical: { color: "var(--status-error)", bg: "var(--danger-muted)" },
  High: { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  Medium: { color: "var(--accent)", bg: "var(--accent-muted)" },
  Low: { color: "var(--text-muted)", bg: "var(--hover-bg)" },
};

export const STATUS_CFG = {
  Open: { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  "Under Review": { color: "var(--status-info)", bg: "var(--info-muted)" },
  Answered: { color: "var(--status-success)", bg: "var(--success-muted)" },
  Closed: { color: "var(--text-muted)", bg: "var(--hover-bg)" },
};

export const statusColumns = ["Open", "Under Review", "Answered", "Closed"];
export const RFI_NUMBER_PATTERN = /^RFI #(\d+)$/i;

export const extractRfiSequence = (value) => {
  if (!value) return null;
  const match = String(value).trim().match(RFI_NUMBER_PATTERN);
  return match ? Number(match[1]) : null;
};

export const sortRfisForRepair = (a, b) => {
  const numericDiff =
    (extractRfiSequence(a.rfi_number) ?? Number.MAX_SAFE_INTEGER) -
    (extractRfiSequence(b.rfi_number) ?? Number.MAX_SAFE_INTEGER);
  if (numericDiff !== 0) return numericDiff;

  const dateA = new Date(a.submitted_date || a.created_date || 0).getTime();
  const dateB = new Date(b.submitted_date || b.created_date || 0).getTime();
  if (dateA !== dateB) return dateA - dateB;

  return String(a.id).localeCompare(String(b.id));
};

export const buildRfiNumberRepairs = (records) => {
  const groups = records.reduce((acc, record) => {
    const key = record.project_id || "__missing_project__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {});

  const repairs = [];
  let skippedWithoutProject = 0;

  Object.entries(groups).forEach(([projectKey, group]) => {
    if (projectKey === "__missing_project__") {
      skippedWithoutProject += group.length;
      return;
    }

    const sorted = [...group].sort(sortRfisForRepair);
    const reserved = new Set();
    let nextNumber = 0;
    const candidates = [];

    sorted.forEach((record) => {
      const numeric = extractRfiSequence(record.rfi_number);
      if (numeric && !reserved.has(numeric)) {
        reserved.add(numeric);
        nextNumber = Math.max(nextNumber, numeric);
        return;
      }

      candidates.push(record);
    });

    candidates.forEach((record) => {
      nextNumber += 1;
      repairs.push({
        id: record.id,
        project_id: record.project_id,
        project_name: record.project_name || "",
        previous_number: record.rfi_number || "",
        next_number: `RFI #${String(nextNumber).padStart(3, "0")}`,
      });
    });
  });

  return { repairs, skippedWithoutProject };
};

export const daysOpen = (r) => {
  if (!r.submitted_date) return 0;
  const start = new Date(r.submitted_date);
  const end = r.date_answered && ["Answered", "Closed"].includes(r.status) ? new Date(r.date_answered) : new Date();
  return Math.max(0, Math.floor((end - start) / 86400000));
};

export const isClosed = (r) => ["Answered", "Closed"].includes(r.status);
export const isOverdue = (r) => !isClosed(r) && r.date_required && parseUTCDate(r.date_required) < new Date();
