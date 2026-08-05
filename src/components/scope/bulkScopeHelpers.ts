/** Pure line/CSV parse for BulkScopeModal. */

export const TYPES = ["Scope", "Exclusion", "Clarification"];

// ─── Parsing ─────────────────────────────────────────────────────────
export function parseInput(text, mode, { defaultType, defaultCategory, addedBy }) {
  const rows = [];
  const errors = [];

  if (mode === "lines") {
    const lines = (text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      rows.push({
        description: line,
        type: defaultType,
        category: defaultCategory,
        added_by: addedBy,
      });
    }
    return { rows, errors };
  }

  // CSV mode
  const lines = (text || "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { rows, errors };
  const headers = splitCsv(lines[0]).map(h => h.trim().toLowerCase());
  const descIdx = headers.indexOf("description");
  if (descIdx === -1) {
    errors.push('First row must include a "description" header.');
    return { rows, errors };
  }
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsv(lines[i]);
    const description = (cells[descIdx] || "").trim();
    if (!description) {
      errors.push(`Row ${i + 1}: empty description`);
      continue;
    }
    const type = cleanType(pickCell(cells, headers, "type")) || defaultType;
    const category = pickCell(cells, headers, "category") || defaultCategory;
    rows.push({
      description,
      type,
      category,
      notes:     pickCell(cells, headers, "notes"),
      reference: pickCell(cells, headers, "reference"),
      added_by:  pickCell(cells, headers, "added_by") || addedBy,
    });
  }
  return { rows, errors };
}

export function pickCell(cells, headers, name) {
  const idx = headers.indexOf(name);
  if (idx === -1) return "";
  return (cells[idx] || "").trim();
}

export function cleanType(raw) {
  if (!raw) return null;
  const norm = String(raw).trim().toLowerCase();
  for (const t of TYPES) if (t.toLowerCase() === norm) return t;
  return null;
}

// Minimal CSV splitter — handles quoted values with embedded commas. Does
// NOT try to be fully RFC-4180 compliant; good enough for pasted scope
// narratives.
export function splitCsv(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQ = false; continue; }
      cur += ch;
    } else {
      if (ch === '"') { inQ = true; continue; }
      if (ch === ",") { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}