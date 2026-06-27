import React, { useMemo, useState } from "react";
import PhoenixModal, { btnPrimary, btnSecondary, inputStyle } from "@/components/shared/PhoenixModal";

/*
 * WPBulkAddModal — paste a tab-separated (or CSV) block of work packages
 * and commit them all at once. Designed to accept the exact shape that
 * `exportCSV` on the WorkPackages page produces, so users can round-trip
 * an Excel/Sheets block without manual re-entry.
 *
 * Expected columns (header row optional, case-insensitive, order-flexible):
 *   WP #, Name, Phase, Status, Tonnage, % Complete,
 *   Crew, Shop Hrs Budget, Shop Hrs Actual, Notes
 */

const VALID_PHASES = ["Detailing", "Fabrication", "Delivery", "Erection"];
const VALID_STATUSES = ["Not Started", "In Progress", "Complete", "On Hold"];

const HEADER_ALIASES = {
  "wp #": "wp_number",
  "wp#": "wp_number",
  "wp number": "wp_number",
  "wp_number": "wp_number",
  "number": "wp_number",
  "#": "wp_number",
  "name": "name",
  "description": "name",
  "phase": "phase",
  "status": "status",
  "tonnage": "tonnage",
  "tons": "tonnage",
  "% complete": "percent_complete",
  "percent complete": "percent_complete",
  "percent_complete": "percent_complete",
  "progress": "percent_complete",
  "crew": "crew",
  "shop hrs budget": "shop_hours_budget",
  "shop_hrs_budget": "shop_hours_budget",
  "shop hours budget": "shop_hours_budget",
  "shop hrs actual": "shop_hours_actual",
  "shop_hrs_actual": "shop_hours_actual",
  "shop hours actual": "shop_hours_actual",
  "notes": "notes",
};

// Canonical column order for the preview table header
const PREVIEW_COLUMNS = [
  { key: "wp_number", label: "WP #", width: 96 },
  { key: "name", label: "Name", width: 260 },
  { key: "phase", label: "Phase", width: 124 },
  { key: "status", label: "Status", width: 128 },
  { key: "tonnage", label: "Tons", width: 82, numeric: true },
  { key: "percent_complete", label: "%", width: 72, numeric: true },
  { key: "crew", label: "Crew", width: 126 },
  { key: "shop_hours_budget", label: "Shop Bud", width: 104, numeric: true },
  { key: "shop_hours_actual", label: "Shop Act", width: 104, numeric: true },
  { key: "notes", label: "Notes", width: 200 },
];

const PREVIEW_MIN_WIDTH = PREVIEW_COLUMNS.reduce((sum, col) => sum + col.width, 46);
const PASTE_INPUT_STYLE = {
  ...inputStyle,
  background: "rgb(14,20,31)",
  border: "1px solid rgba(135,154,180,0.28)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  lineHeight: "20px",
  minHeight: 160,
  maxHeight: 240,
  whiteSpace: "pre",
  overflow: "auto",
  resize: "vertical",
  tabSize: 4,
};

// Strip an optional wrapping "" quote pair, and collapse escaped "".
const unquote = (s) => {
  if (s == null) return "";
  let v = String(s).trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    v = v.slice(1, -1).replace(/""/g, '"');
  }
  return v;
};

// Parse a single line honoring "..." quoted fields.
const splitLine = (line, delim) => {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === delim) { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
};

const detectDelim = (raw) => {
  const first = (raw.split(/\r?\n/).find((l) => l.trim()) || "");
  const tabs = (first.match(/\t/g) || []).length;
  const commas = (first.match(/,/g) || []).length;
  return tabs >= commas ? "\t" : ",";
};

const parsePct = (s) => {
  if (s == null || s === "") return 0;
  const n = Number(String(s).replace(/%/g, "").trim());
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : NaN;
};

const parseNum = (s) => {
  if (s == null || s === "") return 0;
  const n = Number(String(s).replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
};

// Title-case-ish matcher for phase/status so "fabrication" → "Fabrication".
const matchEnum = (raw, choices) => {
  if (!raw) return null;
  const needle = String(raw).trim().toLowerCase();
  return choices.find((c) => c.toLowerCase() === needle) || null;
};

/**
 * parseBlock — takes raw textarea content and returns an array of row objects
 * with normalized fields and per-row validation errors.
 */
function parseBlock(raw) {
  if (!raw || !raw.trim()) return { rows: [], headerDetected: false, columnMap: null };

  const delim = detectDelim(raw);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], headerDetected: false, columnMap: null };

  // Header detection: if the first row's cells all match known aliases, treat as header.
  const firstCells = splitLine(lines[0], delim).map(unquote);
  const firstLower = firstCells.map((c) => c.toLowerCase().replace(/[_\s]+/g, " ").trim());
  const matchedAliases = firstLower.filter((c) => HEADER_ALIASES[c]);
  const headerDetected = matchedAliases.length >= Math.max(2, Math.floor(firstLower.length * 0.6));

  let columnMap; // index → field name
  let dataLines;
  if (headerDetected) {
    columnMap = firstLower.map((c) => HEADER_ALIASES[c] || null);
    dataLines = lines.slice(1);
  } else {
    // No header → assume exportCSV column order.
    columnMap = [
      "wp_number", "name", "phase", "status", "tonnage",
      "percent_complete", "crew", "shop_hours_budget", "shop_hours_actual", "notes",
    ];
    dataLines = lines;
  }

  const rows = dataLines.map((line, idx) => {
    const cells = splitLine(line, delim).map(unquote);
    const fields = {};
    columnMap.forEach((key, i) => {
      if (key && cells[i] !== undefined) fields[key] = cells[i];
    });

    // Normalize
    const wp_number = (fields.wp_number || "").trim();
    const name = (fields.name || "").trim();
    const phaseRaw = (fields.phase || "").trim();
    const statusRaw = (fields.status || "").trim();
    const tonnage = parseNum(fields.tonnage);
    const percent_complete = parsePct(fields.percent_complete);
    const crew = (fields.crew || "").trim();
    const shop_hours_budget = parseNum(fields.shop_hours_budget);
    const shop_hours_actual = parseNum(fields.shop_hours_actual);
    const notes = (fields.notes || "").trim();

    const phase = matchEnum(phaseRaw, VALID_PHASES);
    const status = matchEnum(statusRaw, VALID_STATUSES) || "Not Started";

    const errors = {};
    if (!name) errors.name = "Required";
    if (phaseRaw && !phase) errors.phase = `Invalid (${phaseRaw})`;
    if (statusRaw && !matchEnum(statusRaw, VALID_STATUSES))
      errors.status = `Invalid (${statusRaw})`;
    if (Number.isNaN(tonnage)) errors.tonnage = "NaN";
    if (Number.isNaN(percent_complete)) errors.percent_complete = "NaN";
    if (Number.isNaN(shop_hours_budget)) errors.shop_hours_budget = "NaN";
    if (Number.isNaN(shop_hours_actual)) errors.shop_hours_actual = "NaN";

    return {
      __index: idx,
      wp_number,
      name,
      phase: phase || "Detailing",
      status,
      tonnage: Number.isNaN(tonnage) ? 0 : tonnage,
      percent_complete: Number.isNaN(percent_complete) ? 0 : percent_complete,
      crew,
      shop_hours_budget: Number.isNaN(shop_hours_budget) ? 0 : shop_hours_budget,
      shop_hours_actual: Number.isNaN(shop_hours_actual) ? 0 : shop_hours_actual,
      notes,
      errors,
    };
  });

  return { rows, headerDetected, columnMap };
}

const EXAMPLE = `WP #\tName\tPhase\tStatus\tTonnage\t% Complete\tCrew\tShop Hrs Budget\tShop Hrs Actual\tNotes
WP-001\tShop A - Main Steel\tFabrication\tNot Started\t42.5\t0%\t\t120\t0\t
WP-002\tShop B - Misc Steel\tDetailing\tNot Started\t18.2\t0%\t\t80\t0\t`;

export default function WPBulkAddModal({
  open,
  onClose,
  onCommit,
  projectId,
  projectName,
  existingWPs = [],
  isSaving = false,
}) {
  const [raw, setRaw] = useState("");

  const { rows, headerDetected } = useMemo(() => parseBlock(raw), [raw]);

  const existingWpNumbers = useMemo(
    () => new Set(existingWPs.map((w) => (w.wp_number || "").trim()).filter(Boolean)),
    [existingWPs]
  );

  const rowsWithDupFlags = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        isDuplicate: r.wp_number && existingWpNumbers.has(r.wp_number),
      })),
    [rows, existingWpNumbers]
  );

  const validRows = rowsWithDupFlags.filter((r) => Object.keys(r.errors).length === 0);
  const errorCount = rowsWithDupFlags.filter((r) => Object.keys(r.errors).length > 0).length;
  const dupCount = rowsWithDupFlags.filter((r) => r.isDuplicate).length;
  const blankNumberCount = rowsWithDupFlags.filter((r) => !r.wp_number).length;

  const canCommit = !isSaving && validRows.length > 0 && !!projectId;

  const handleCommit = () => {
    if (!canCommit) return;
    // Strip UI-only fields; leave wp_number empty for rows that need auto-allocation.
    const payload = validRows.map(({ __index, errors: _errors, isDuplicate: _isDuplicate, ...data }) => ({
      ...data,
      project_id: projectId,
      project_name: projectName || undefined,
    }));
    onCommit(payload);
  };

  const loadExample = () => setRaw(EXAMPLE);

  const footer = (
    <>
      <button
        type="button"
        onClick={loadExample}
        style={{ ...btnSecondary, marginRight: "auto" }}
        disabled={isSaving}
      >
        Load Example
      </button>
      <button type="button" onClick={onClose} style={btnSecondary} disabled={isSaving}>
        Cancel
      </button>
      <button
        type="button"
        onClick={handleCommit}
        disabled={!canCommit}
        style={{
          ...btnPrimary,
          opacity: canCommit ? 1 : 0.5,
          cursor: canCommit ? "pointer" : "not-allowed",
        }}
      >
        {isSaving
          ? "Saving…"
          : validRows.length === 0
          ? "Paste rows to enable"
          : `Add ${validRows.length} Work Package${validRows.length === 1 ? "" : "s"}`}
      </button>
    </>
  );

  return (
    <PhoenixModal open={open} onClose={onClose} title="Bulk Add Work Packages" footer={footer} maxWidth={1100}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Help strip */}
        <div
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            lineHeight: 1.55,
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          Paste directly from Excel or a CSV. Supports tab- or comma-separated values. Expected columns
          (in any order when a header row is included):{" "}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)" }}>
            WP #, Name, Phase, Status, Tonnage, % Complete, Crew, Shop Hrs Budget, Shop Hrs Actual, Notes
          </span>
          . Blank WP # values will be auto-numbered on save. Duplicates of existing WP numbers on this project
          are flagged but allowed.
        </div>

        {/* Paste textarea */}
        <div>
          <label
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Paste Here
          </label>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"WP #\tName\tPhase\tStatus\tTonnage\t% Complete\tCrew\tShop Hrs Budget\tShop Hrs Actual\tNotes\nWP-001\tShop A - Main Steel\tFabrication\tNot Started\t42.5\t0%\t\t120\t0\t"}
            spellCheck={false}
            style={{
              ...PASTE_INPUT_STYLE,
              width: "100%",
            }}
          />
        </div>

        {/* Status strip */}
        {rows.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
            }}
          >
            <Chip label={`${rows.length} PARSED`} color="var(--text-secondary)" />
            <Chip
              label={`${validRows.length} VALID`}
              color={validRows.length > 0 ? "var(--status-success)" : "var(--text-muted)"}
            />
            {errorCount > 0 && (
              <Chip label={`${errorCount} WITH ERRORS`} color="var(--status-error)" />
            )}
            {dupCount > 0 && (
              <Chip label={`${dupCount} DUPLICATE WP #`} color="var(--status-warning)" />
            )}
            {blankNumberCount > 0 && (
              <Chip label={`${blankNumberCount} WILL AUTO-NUMBER`} color="var(--status-info)" />
            )}
            {headerDetected && <Chip label="HEADER DETECTED" color="var(--text-muted)" />}
          </div>
        )}

        {/* Preview table */}
        {rows.length > 0 && (
          <div
            style={{
              border: "1px solid rgba(135,154,180,0.28)",
              borderRadius: 8,
              overflow: "auto",
              maxHeight: 320,
              background: "rgb(10,15,23)",
            }}
          >
            <table
              className="sbd-table"
              style={{
                width: "max(100%, var(--wp-preview-min-width))",
                minWidth: PREVIEW_MIN_WIDTH,
                borderCollapse: "collapse",
                fontFamily: "var(--font-body)",
                fontSize: 12,
                "--wp-preview-min-width": `${PREVIEW_MIN_WIDTH}px`,
              }}
            >
              <thead
                style={{
                  background: "rgb(12,17,25)",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                <tr>
                  <th
                    style={{
                      padding: "8px 6px",
                      textAlign: "left",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      letterSpacing: "0.1em",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      borderBottom: "1px solid var(--divider)",
                      width: 28,
                    }}
                  >
                    #
                  </th>
                  {PREVIEW_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        padding: "8px 6px",
                        textAlign: col.numeric ? "right" : "left",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        letterSpacing: "0.1em",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      borderBottom: "1px solid var(--divider)",
                      minWidth: col.width,
                      whiteSpace: "nowrap",
                    }}
                  >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsWithDupFlags.map((row) => {
                  const hasErrors = Object.keys(row.errors).length > 0;
                  return (
                    <tr
                      key={row.__index}
                      style={{
                        background: hasErrors
                          ? "rgb(41,19,24)"
                          : row.isDuplicate
                          ? "rgb(37,26,11)"
                          : "rgb(10,15,23)",
                        borderBottom: "1px solid var(--divider)",
                      }}
                    >
                      <td
                        style={{
                          padding: "6px",
                          color: "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                        }}
                      >
                        {row.__index + 1}
                      </td>
                      {PREVIEW_COLUMNS.map((col) => {
                        const val = row[col.key];
                        const err = row.errors[col.key];
                        const isDupCol = col.key === "wp_number" && row.isDuplicate;
                        return (
                          <td
                            key={col.key}
                            title={err || (isDupCol ? "Duplicate of existing WP # on this project" : "")}
                            style={{
                              padding: "6px",
                              textAlign: col.numeric ? "right" : "left",
                              color: err
                                ? "var(--status-error)"
                                : isDupCol
                                ? "var(--status-warning)"
                                : "var(--text-primary)",
                              fontFamily: col.numeric || col.key === "wp_number"
                                ? "var(--font-mono)"
                                : "var(--font-body)",
                              fontSize: col.numeric ? 11 : 12,
                              lineHeight: "18px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: col.width + 60,
                            }}
                          >
                            {col.key === "wp_number" && !val ? (
                              <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>auto</span>
                            ) : col.numeric ? (
                              Number(val || 0).toString()
                            ) : (
                              val || ""
                            )}
                            {err && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 9,
                                  color: "var(--status-error)",
                                }}
                              >
                                ⚠
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!projectId && (
          <div
            style={{
              fontSize: 11,
              color: "var(--status-warning)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Select a project before bulk-adding work packages.
          </div>
        )}
      </div>
    </PhoenixModal>
  );
}

const Chip = ({ label, color }) => (
  <span
    style={{
      padding: "3px 8px",
      borderRadius: 4,
      border: `1px solid ${color}`,
      color,
      background: `${color}14`,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.08em",
    }}
  >
    {label}
  </span>
);
