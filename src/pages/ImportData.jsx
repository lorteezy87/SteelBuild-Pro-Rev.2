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
      cleaned[k] = Number(v);
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

export default function ImportData() {
  const [files, setFiles] = useState({});
  const [status, setStatus] = useState({});
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
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
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e) => processFiles(e.target.files);

  const runImport = async () => {
    setRunning(true);
    setLog([]);

    for (const entityName of IMPORT_ORDER) {
      const rows = files[entityName];
      if (!rows || rows.length === 0) {
        addLog(`⊘ ${entityName}: no file loaded — skipped`);
        continue;
      }

      setStatus((prev) => ({
        ...prev,
        [entityName]: {
          done: 0,
          total: rows.length,
          errors: 0,
          state: "running",
        },
      }));
      addLog(`▶ ${entityName}: importing ${rows.length} records...`);

      let done = 0;
      let errors = 0;
      const BATCH = 5;

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map((row) => base44.entities[entityName].create(cleanRow(row)))
        );

        results.forEach((r, idx) => {
          if (r.status === "fulfilled") {
            done++;
          } else {
            errors++;
            addLog(
              `  ✕ ${entityName} row ${i + idx + 1}: ${
                r.reason?.message || "unknown error"
              }`
            );
          }
        });

        setStatus((prev) => ({
          ...prev,
          [entityName]: {
            done,
            total: rows.length,
            errors,
            state: "running",
          },
        }));

        if (i + BATCH < rows.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      const state = errors === rows.length ? "error" : "done";
      setStatus((prev) => ({
        ...prev,
        [entityName]: { done, total: rows.length, errors, state },
      }));
      addLog(
        `${errors === 0 ? "✓" : "⚠"} ${entityName}: ${done} created, ${errors} failed`
      );
    }

    setRunning(false);
    addLog("═══════════════════════════");
    addLog("Import complete");
  };

  const totalRecords =
    Object.values(files).reduce((sum, rows) => sum + (rows?.length || 0), 0) || 0;

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={runImport}
            disabled={running || Object.keys(files).length === 0}
            style={{
              background: running
                ? "var(--bg-surface-high)"
                : "var(--accent)",
              color: running ? "var(--text-muted)" : "#0A0A0B",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "10px 24px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              cursor:
                running || Object.keys(files).length === 0
                  ? "not-allowed"
                  : "pointer",
              opacity: Object.keys(files).length === 0 ? 0.4 : 1,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              transition: "all 0.15s",
            }}
          >
            {running ? "▶ IMPORTING..." : "▶ RUN IMPORT"}
          </button>
          {Object.keys(files).length > 0 && !running && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
              }}
            >
              {totalRecords.toLocaleString()} total records ready
            </span>
          )}
        </div>
      </div>

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
          This importer creates NEW records. Running it multiple times will create duplicate
          data. Projects, Alerts, and ScheduleTask records are excluded from import. Drop all
          CSV files at once, verify counts match, then click Run Import.
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${
            isDragging ? "var(--accent)" : "var(--border-strong)"
          }`,
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "200px 80px 80px 1fr 100px",
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
        <div>Loaded</div>
        <div>Created</div>
        <div>Progress</div>
        <div>Status</div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {IMPORT_ORDER.map((entity) => {
          const loaded = files[entity]?.length || 0;
          const s = status[entity] || {
            done: 0,
            total: loaded,
            errors: 0,
            state: "idle",
          };
          const icon = STATUS_ICON[s.state] || STATUS_ICON.idle;
          const pct = s.total ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
          return (
            <div
              key={entity}
              style={{
                display: "grid",
                gridTemplateColumns: "200px 80px 80px 1fr 100px",
                gap: "8px",
                alignItems: "center",
                padding: "10px 12px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-card)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-primary)",
                }}
              >
                {entity}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                {loaded}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color:
                    s.errors > 0
                      ? "var(--status-warning)"
                      : "var(--status-success)",
                }}
              >
                {s.done || 0}
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
                    ? ` — ${s.done}/${s.total} (${s.errors} errors)`
                    : s.total
                    ? ` — ${s.done}/${s.total}`
                    : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>

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
