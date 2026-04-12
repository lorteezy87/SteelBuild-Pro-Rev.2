// ONE-TIME IMPORT UTILITY
// Remove from nav and routes after migration is complete
// Added: 2026-03-27
import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

const FILE_MAP = {
  "WorkPackage_export.csv": { entity: "WorkPackage", label: "Work Packages" },
  "Drawing_export.csv": { entity: "Drawing", label: "Drawings" },
  "RFI_export.csv": { entity: "RFI", label: "RFIs" },
  "CostCode_export.csv": { entity: "CostCode", label: "Cost Codes" },
  "SOVItem_export.csv": { entity: "SOVItem", label: "SOV Items" },
  "ChangeOrder_export.csv": { entity: "ChangeOrder", label: "Change Orders" },
  "Delivery_export.csv": { entity: "Delivery", label: "Deliveries" },
  "Expense_export.csv": { entity: "Expense", label: "Expenses" },
  "ProductionNote_export.csv": { entity: "ProductionNote", label: "Production Notes" },
  "Contact_export.csv": { entity: "Contact", label: "Contacts" },
  "Resource_export.csv": { entity: "Resource", label: "Resources" },
  "ScopeItem_export.csv": { entity: "ScopeItem", label: "Scope Items" },
  "LookAhead_export.csv": { entity: "LookAhead", label: "Look-Ahead Items" },
};

const IGNORE_FILES = [
  "Project_export.csv",
  "ProjectNumberSequence_export.csv",
  "Alert_export.csv",
  "ScheduleTask_export.csv",
];

const STRIP_FIELDS = new Set([
  "id",
  "created_date",
  "updated_date",
  "created_by_id",
  "created_by",
  "is_sample",
  "project_name",
  "work_package_name",
  "sov_line_item_name",
  "cost_code_name",
  "drawing_set_name",
  "drawing_id",
  "drawing_set_id",
]);

const IMPORT_ORDER = [
  "Contact",
  "CostCode",
  "WorkPackage",
  "Drawing",
  "RFI",
  "SOVItem",
  "ChangeOrder",
  "Delivery",
  "Expense",
  "ProductionNote",
  "Resource",
  "ScopeItem",
  "LookAhead",
];

// Business key extractors for idempotent duplicate detection.
// Falls back to full-row fingerprint for entities without specific keys.
function buildFingerprint(entityName, row) {
  const pid = row.project_id || "";
  switch (entityName) {
    case "RFI":
      if (row.project_id && row.rfi_number) return `${pid}::rfi::${row.rfi_number}`;
      break;
    case "WorkPackage":
      if (row.project_id && row.wp_number) return `${pid}::wp::${row.wp_number}`;
      break;
    case "ChangeOrder":
      if (row.project_id && row.co_number) return `${pid}::co::${row.co_number}`;
      break;
    case "CostCode":
      if (row.project_id && row.cost_code_number) return `${pid}::cc::${row.cost_code_number}`;
      break;
    case "Drawing":
      if (row.project_id && row.sheet_number) return `${pid}::dwg::${row.sheet_number}`;
      break;
    case "Expense":
      if (row.project_id && row.expense_number) return `${pid}::exp::${row.expense_number}`;
      break;
    case "Delivery":
      if (row.project_id && row.delivery_id) return `${pid}::del::${row.delivery_id}`;
      break;
    case "Contact":
      if (row.email) return `contact::email::${row.email.toLowerCase().trim()}`;
      if (row.name && row.company) return `contact::name::${row.name.toLowerCase().trim()}::${row.company.toLowerCase().trim()}`;
      break;
    default:
      break;
  }
  // Fallback: stable JSON fingerprint of all meaningful fields
  const cleaned = {};
  for (const [k, v] of Object.entries(row)) {
    if (!STRIP_FIELDS.has(k) && v !== "" && v !== null && v !== undefined) {
      cleaned[k] = v;
    }
  }
  return JSON.stringify(cleaned, Object.keys(cleaned).sort());
}

const STATUS_ICON = {
  idle: { icon: "○", color: "var(--text-muted)" },
  running: { icon: "▶", color: "var(--status-warning)" },
  done: { icon: "✓", color: "var(--status-success)" },
  error: { icon: "⚠", color: "var(--status-error)" },
};

function parseCSV(text) {
  const lines = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
    } else if (ch === "\r" && next === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
      i++;
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) return [];

  const parseRow = (line) => {
    const fields = [];
    let field = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === '"') {
        if (inQ && next === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        fields.push(field);
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields;
  };

  const headers = parseRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseRow(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = values[idx] || "";
    });
    rows.push(obj);
  }
  return rows;
}

function cleanRow(row) {
  const cleaned = {};
  for (const [k, vRaw] of Object.entries(row)) {
    if (STRIP_FIELDS.has(k)) continue;
    if (vRaw === "" || vRaw === null || vRaw === undefined) continue;
    const v = vRaw;
    if (["true", "false"].includes(v)) {
      cleaned[k] = v === "true";
    } else if (
      !isNaN(v) &&
      v !== "" &&
      ![
        "rfi_number",
        "wp_number",
        "co_number",
        "expense_number",
        "delivery_id",
        "phone",
        "project_number",
        "line_item_number",
        "application_number",
        "task_number",
        "cost_code_number",
        "sheet_number",
        "wbs_code",
        "spec_section",
      ].includes(k)
    ) {
      const num = Number(v);
      cleaned[k] = Number.isFinite(num) ? num : 0;
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportData() {
  const [files, setFiles] = useState({});
  const [status, setStatus] = useState({});
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [estimate, setEstimate] = useState(null); // { entity: { toCreate, toSkip } }
  const [liveCounts, setLiveCounts] = useState(null); // { entity: number }
  const [estimating, setEstimating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [summary, setSummary] = useState(null); // final import/estimate run result
  const [overridePreflight, setOverridePreflight] = useState(false);
  const fileInputRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const addLog = (msg) =>
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);

  const processFiles = async (fileList) => {
    const parsed = { ...files };
    const newLog = [];

    for (const file of Array.from(fileList)) {
      if (IGNORE_FILES.includes(file.name)) {
        newLog.push(`⊘ ${file.name} — excluded from import`);
        continue;
      }
      const mapping = FILE_MAP[file.name];
      if (!mapping) {
        newLog.push(`? ${file.name} — unrecognized, skipped`);
        continue;
      }
      const text = await file.text();
      const rows = parseCSV(text).filter((r) => r.is_sample !== "true");
      parsed[mapping.entity] = rows;
      newLog.push(`✓ ${file.name} — ${rows.length} records loaded`);
    }

    setFiles(parsed);
    setLog(newLog);
    setEstimate(null);
    setLiveCounts(null);
    setSummary(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e) => processFiles(e.target.files);

  // ── Preflight ────────────────────────────────────────────────────────────────
  const loadedEntities = new Set(Object.keys(files));
  const missingEntities = IMPORT_ORDER.filter((e) => !loadedEntities.has(e));
  const preflightClear = missingEntities.length === 0;
  const importAllowed = preflightClear || overridePreflight;

  // ── Estimate Import (dry run) ─────────────────────────────────────────────
  const runEstimate = async () => {
    setEstimating(true);
    setLog([]);
    addLog("▶ Estimate Import — fetching live records...");

    const result = {};

    for (const entityName of IMPORT_ORDER) {
      const rows = files[entityName];
      if (!rows || rows.length === 0) {
        addLog(`⊘ ${entityName}: no file loaded — skipped`);
        continue;
      }

      addLog(`  · ${entityName}: fetching live records...`);
      let liveRecords = [];
      try {
        liveRecords = await base44.entities[entityName].list();
      } catch (err) {
        addLog(`  ⚠ ${entityName}: could not fetch live records — ${err?.message || "unknown"}`);
      }

      // Build fingerprint set from live records
      const liveFingerprints = new Set(
        liveRecords.map((rec) => buildFingerprint(entityName, rec))
      );

      let toCreate = 0;
      let toSkip = 0;
      for (const row of rows) {
        const fp = buildFingerprint(entityName, row);
        if (liveFingerprints.has(fp)) {
          toSkip++;
        } else {
          toCreate++;
        }
      }

      result[entityName] = { toCreate, toSkip, csvTotal: rows.length, liveTotal: liveRecords.length };
      addLog(`  ✓ ${entityName}: ${toCreate} would create, ${toSkip} would skip (${liveRecords.length} live)`);
    }

    setEstimate(result);
    setSummary({ type: "estimate", timestamp: new Date().toISOString(), entities: result });
    addLog("═══════════════════════════");
    addLog("Estimate complete — no records were written");
    setEstimating(false);
  };

  // ── Verify Live Counts ────────────────────────────────────────────────────
  const verifyLiveCounts = async () => {
    setVerifying(true);
    setLog([]);
    addLog("▶ Verifying live record counts...");

    const counts = {};
    for (const entityName of IMPORT_ORDER) {
      try {
        const recs = await base44.entities[entityName].list();
        counts[entityName] = recs.length;
        const loaded = files[entityName]?.length || 0;
        const match = loaded > 0 && recs.length === loaded ? " ✓ matches CSV" : loaded > 0 ? ` (CSV has ${loaded})` : "";
        addLog(`  ${entityName}: ${recs.length} live${match}`);
      } catch (err) {
        counts[entityName] = null;
        addLog(`  ⚠ ${entityName}: fetch failed — ${err?.message || "unknown"}`);
      }
    }

    setLiveCounts(counts);
    addLog("═══════════════════════════");
    addLog("Verification complete");
    setVerifying(false);
  };

  // ── Run Import ────────────────────────────────────────────────────────────
  const runImport = async () => {
    setRunning(true);
    setLog([]);
    setSummary(null);

    const runResult = {};

    for (const entityName of IMPORT_ORDER) {
      const rows = files[entityName];
      if (!rows || rows.length === 0) {
        addLog(`⊘ ${entityName}: no file loaded — skipped`);
        continue;
      }

      setStatus((prev) => ({
        ...prev,
        [entityName]: { done: 0, total: rows.length, skipped: 0, errors: 0, state: "running" },
      }));
      addLog(`▶ ${entityName}: importing ${rows.length} records...`);

      // Fetch live fingerprints for idempotent create
      let liveFingerprints = new Set();
      try {
        const liveRecords = await base44.entities[entityName].list();
        liveFingerprints = new Set(liveRecords.map((rec) => buildFingerprint(entityName, rec)));
      } catch {
        addLog(`  ⚠ ${entityName}: could not fetch live records for dedup — proceeding without dedup`);
      }

      let done = 0;
      let skipped = 0;
      let errors = 0;
      const BATCH = 5;

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map((row) => {
            const fp = buildFingerprint(entityName, row);
            if (liveFingerprints.has(fp)) {
              return Promise.resolve({ __skipped: true });
            }
            return base44.entities[entityName].create(cleanRow(row));
          })
        );

        results.forEach((r, idx) => {
          if (r.status === "fulfilled") {
            if (r.value?.__skipped) {
              skipped++;
            } else {
              done++;
              // Add new fingerprint to prevent duplicate within this run
              liveFingerprints.add(buildFingerprint(entityName, batch[idx]));
            }
          } else {
            errors++;
            addLog(
              `  ✕ ${entityName} row ${i + idx + 1}: ${r.reason?.message || "unknown error"}`
            );
          }
        });

        setStatus((prev) => ({
          ...prev,
          [entityName]: { done, total: rows.length, skipped, errors, state: "running" },
        }));

        if (i + BATCH < rows.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      const state = errors === rows.length && rows.length > 0 ? "error" : "done";
      setStatus((prev) => ({
        ...prev,
        [entityName]: { done, total: rows.length, skipped, errors, state },
      }));
      runResult[entityName] = { done, skipped, errors, total: rows.length };
      addLog(
        `${errors === 0 ? "✓" : "⚠"} ${entityName}: ${done} created, ${skipped} skipped, ${errors} failed`
      );
    }

    setSummary({ type: "import", timestamp: new Date().toISOString(), entities: runResult });
    setRunning(false);
    addLog("═══════════════════════════");
    addLog("Import complete");
  };

  const totalRecords =
    Object.values(files).reduce((sum, rows) => sum + (rows?.length || 0), 0) || 0;

  const anyRunning = running || estimating || verifying;

  return (
    <div
      style={{
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        color: "var(--text-primary)",
        background: "var(--bg-page)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 24,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Import Data
          </div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            One-time migration — reads CSV exports and creates all records in Base44
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={runEstimate}
            disabled={anyRunning || Object.keys(files).length === 0}
            style={btnStyle("var(--bg-surface-high)", "var(--text-secondary)", anyRunning || Object.keys(files).length === 0)}
          >
            {estimating ? "▶ ESTIMATING..." : "≈ ESTIMATE IMPORT"}
          </button>
          <button
            type="button"
            onClick={verifyLiveCounts}
            disabled={anyRunning}
            style={btnStyle("var(--bg-surface-high)", "var(--text-secondary)", anyRunning)}
          >
            {verifying ? "▶ VERIFYING..." : "⊛ VERIFY LIVE COUNTS"}
          </button>
          <button
            type="button"
            onClick={runImport}
            disabled={anyRunning || Object.keys(files).length === 0 || !importAllowed}
            style={btnStyle(
              anyRunning ? "var(--bg-surface-high)" : "var(--accent)",
              anyRunning ? "var(--text-muted)" : "var(--accent-text)",
              anyRunning || Object.keys(files).length === 0 || !importAllowed
            )}
          >
            {running ? "▶ IMPORTING..." : "▶ RUN IMPORT"}
          </button>
          {summary && (
            <button
              type="button"
              onClick={() =>
                downloadJSON(
                  summary,
                  `import-${summary.type}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`
                )
              }
              style={btnStyle("var(--bg-surface-high)", "var(--text-secondary)", false)}
            >
              ↓ DOWNLOAD SUMMARY
            </button>
          )}
        </div>
      </div>

      {/* Warning banner */}
      <div
        style={{
          background: "var(--warning-muted)",
          border: "1px solid var(--warning-border)",
          borderLeft: "4px solid var(--status-warning)",
          borderRadius: "var(--radius-card)",
          padding: "12px 16px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--status-warning)",
            marginBottom: 4,
            letterSpacing: "0.08em",
          }}
        >
          ⚠ IMPORTANT — READ BEFORE RUNNING
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          Run <strong>Estimate Import</strong> first — it compares CSV rows against live records using business
          keys and reports what would be created vs skipped without writing anything. Use{" "}
          <strong>Verify Live Counts</strong> to confirm post-import state. Projects, Alerts, and
          ScheduleTask records are excluded from import.
        </div>
      </div>

      {/* Preflight panel */}
      {Object.keys(files).length > 0 && (
        <div
          style={{
            background: preflightClear ? "var(--success-muted, rgba(34,197,94,0.08))" : "var(--warning-muted)",
            border: `1px solid ${preflightClear ? "var(--status-success)" : "var(--warning-border)"}`,
            borderLeft: `4px solid ${preflightClear ? "var(--status-success)" : "var(--status-warning)"}`,
            borderRadius: "var(--radius-card)",
            padding: "12px 16px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              color: preflightClear ? "var(--status-success)" : "var(--status-warning)",
              marginBottom: 4,
              letterSpacing: "0.08em",
            }}
          >
            {preflightClear ? "✓ PREFLIGHT CLEAR" : "⚠ PREFLIGHT BLOCKED"}
          </div>
          {!preflightClear && (
            <>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                Missing CSVs: {missingEntities.join(", ")}
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={overridePreflight}
                  onChange={(e) => setOverridePreflight(e.target.checked)}
                />
                Override — proceed with partial CSV set
              </label>
            </>
          )}
          {preflightClear && (
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>
              All {IMPORT_ORDER.length} required CSV files loaded — {totalRecords.toLocaleString()} total records
            </div>
          )}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? "var(--accent)" : "var(--border-strong)"}`,
          borderRadius: "var(--radius-card)",
          padding: "40px",
          textAlign: "center",
          background: isDragging ? "var(--accent-muted)" : "var(--bg-surface)",
          transition: "all 0.2s",
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>⊕</div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--text-primary)",
            marginBottom: 6,
          }}
        >
          Drop all CSV export files here
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
          }}
        >
          WorkPackage_export.csv · Drawing_export.csv · RFI_export.csv · and 10 more
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            marginTop: 16,
            background: "var(--bg-surface-high)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-btn)",
            padding: "6px 16px",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Browse Files
        </button>
      </div>

      {/* Entity table header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "160px 70px 70px 70px 70px 1fr 100px",
          gap: "8px",
          alignItems: "center",
          padding: "8px 12px",
          background: "var(--bg-surface-low)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <div>Entity</div>
        <div>CSV</div>
        <div>Live</div>
        <div>Create</div>
        <div>Skip</div>
        <div>Progress</div>
        <div>Status</div>
      </div>

      {/* Entity rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {IMPORT_ORDER.map((entity) => {
          const loaded = files[entity]?.length || 0;
          const live = liveCounts ? (liveCounts[entity] ?? "—") : "—";
          const est = estimate?.[entity];
          const s = status[entity] || { done: 0, total: loaded, skipped: 0, errors: 0, state: "idle" };
          const icon = STATUS_ICON[s.state] || STATUS_ICON.idle;
          const pct = s.total ? Math.min(100, Math.round(((s.done + (s.skipped || 0)) / s.total) * 100)) : 0;

          return (
            <div
              key={entity}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 70px 70px 70px 70px 1fr 100px",
                gap: "8px",
                alignItems: "center",
                padding: "10px 12px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-card)",
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)" }}>
                {entity}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                {loaded || "—"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                {live}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: est ? "var(--status-success)" : s.done ? "var(--status-success)" : "var(--text-muted)",
                }}
              >
                {s.state !== "idle" ? s.done : est ? est.toCreate : "—"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                {s.state !== "idle" ? (s.skipped || 0) : est ? est.toSkip : "—"}
              </div>
              <div
                style={{
                  width: "100%",
                  height: 6,
                  background: "var(--bg-surface-low)",
                  borderRadius: "var(--radius-card)",
                  overflow: "hidden",
                  border: "1px solid var(--border-default)",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background:
                      s.state === "running"
                        ? "var(--status-warning)"
                        : "var(--status-success)",
                    transition: "width 0.2s",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: icon.color,
                }}
              >
                <span>{icon.icon}</span>
                <span>
                  {s.state || "idle"}
                  {s.errors > 0
                    ? ` — ${s.done}/${s.total} (${s.errors} err)`
                    : s.total && s.state !== "idle"
                    ? ` — ${s.done + (s.skipped || 0)}/${s.total}`
                    : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Log */}
      <div
        style={{
          background: "var(--bg-surface-low)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: "12px 16px",
          maxHeight: 280,
          overflowY: "auto",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-secondary)",
          lineHeight: 1.8,
        }}
        ref={logRef}
      >
        {log.length === 0 ? (
          <em style={{ color: "var(--text-muted)" }}>
            Drop CSV files above to begin — log will appear here
          </em>
        ) : (
          log.map((line, idx) => <div key={idx}>{line}</div>)
        )}
      </div>
    </div>
  );
}

function btnStyle(bg, color, disabled) {
  return {
    background: bg,
    color: color,
    border: "1px solid var(--border-default)",
    borderRadius: "var(--radius-btn)",
    padding: "10px 18px",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  };
}
