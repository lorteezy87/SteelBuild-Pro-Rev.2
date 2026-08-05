import React, { useMemo, useState } from "react";
import PhoenixModal, { btnPrimary, btnSecondary, inputStyle } from "@/components/shared/PhoenixModal";
import {
  parseBlock,
  buildExistingWpNumberSet,
  flagDuplicateWpRows,
} from "./wpBulkAddHelpers";

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
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
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
    () => buildExistingWpNumberSet(existingWPs),
    [existingWPs]
  );

  const rowsWithDupFlags = useMemo(
    () => flagDuplicateWpRows(rows, existingWpNumbers),
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
              background: "var(--bg-surface)",
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
                  background: "var(--bg-surface-low)",
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
