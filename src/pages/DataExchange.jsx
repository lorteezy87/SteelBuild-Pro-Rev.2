import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  Import as ImportIcon,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { IMPORT_TARGETS, stageImportText } from "@/lib/onboardingTemplates";
import {
  buildJsonExport,
  bulkCreateWithFallback,
  collectExportFields,
  makeExportFilename,
  recordsToCsv,
} from "@/lib/dataExchange";
import { normalizeRfiNumber, rfiNumberDedupKey } from "@/lib/rfiImportUtils";

const DATASET_KEYS = Object.keys(IMPORT_TARGETS);

const IMPORT_EXAMPLES = {
  rfis: "RFI #,Title,Question,Drawing Reference,Priority,Status\n001,Anchor bolt projection,Confirm projection at grid B/4,S1.02,High,Open",
  scheduleTasks: "Task Name,Phase,Start Date,End Date,Status,Assigned To\nDetail anchor bolt plan,Detailing,2026-06-01,2026-06-07,Not Started,Detailing Lead",
  workPackages: "WP Number,Name,Phase,Status,Tonnage,Crew\nWP-001,Anchor Bolts,Detailing,Not Started,18,Detailing",
  deliveries: "PO Number,Description,Scheduled Date,Required Date,Status,Pieces,Receiving Location\nPO-1001,Sequence 1 steel,2026-07-15,2026-07-17,Scheduled,86,North laydown yard",
  punchlist: "Description,Category,Location,Assigned To,Priority,Status\nTouch up primer at Column B4,Coating,Grid B/4,Field Crew,Medium,Open",
  contacts: "First Name,Last Name,Company,Role,Email,Phone\nJordan,Steel,Demo Steel,Project Manager,jordan@example.com,555-0100",
  sovItems: "Line Item,Description,Scheduled Value,Current % Complete,Retainage %,Status\n1,Structural Steel Fabrication,485000,35,10,Open\n2,Erection & Field Labor,220000,10,10,Open",
  costCodes: "Code,Description,Category,Budget,Actual Cost,Committed Cost,Forecast to Complete\n01,Project Management,General Conditions,45000,12500,22000,10500\n02,Detailing,Engineering,85000,42000,85000,0",
  expenses: "Description,Expense Type,Cost Code,Amount,Vendor,Invoice #,Invoice Date,Payment Status\nShop drawing review,Engineering,02,4500,Detailing Consultants,INV-2026-041,2026-05-01,Approved",
};

function formatProjectLabel(project) {
  if (!project) return "Select a project";
  return project.project_number ? `${project.project_number} - ${project.name}` : project.name;
}

function downloadTextFile({ filename, content, type }) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function readDataExchangeFile(file) {
  if (!file) return "";
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const xlsxModule = await import("xlsx");
    const XLSX = xlsxModule.default || xlsxModule;
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return "";
    return XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName], { blankrows: false });
  }
  return file.text();
}

function SectionHeader({ icon: Icon, title, detail }) {
  return (
    <div className="de-section-header">
      <div className="de-section-icon"><Icon size={18} /></div>
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value, detail }) {
  return (
    <div className="de-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function MappingPreview({ stagedImport }) {
  return (
    <div className="de-mapping">
      <div className="de-mapping-row de-mapping-head">
        <span>Source column</span>
        <span>Mapped field</span>
      </div>
      {stagedImport.headers.map((header, index) => (
        <div className="de-mapping-row" key={`${header}-${index}`}>
          <span>{header || "(blank)"}</span>
          <strong>{stagedImport.mappedHeaders[index] || "Ignored"}</strong>
        </div>
      ))}
      {stagedImport.headers.length === 0 && (
        <div className="de-empty-line">Paste or upload a file to preview column mapping.</div>
      )}
    </div>
  );
}

function InvalidRowsPanel({ invalidRows }) {
  if (!invalidRows.length) return null;
  return (
    <div className="de-validation">
      <AlertTriangle size={18} />
      <div>
        <strong>{invalidRows.length} row(s) need review before import.</strong>
        <ul>
          {invalidRows.slice(0, 6).map((row) => (
            <li key={row.rowNumber}>
              Row {row.rowNumber}: {row.missing?.length ? `missing ${row.missing.join(", ")}` : ""}
              {row.invalidValues?.length ? ` invalid ${row.invalidValues.map((item) => `${item.field}=${item.value}`).join(", ")}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RecordPreview({ rows, fields }) {
  const previewRows = rows.slice(0, 6);
  return (
    <div className="de-table-wrap">
      <table className="de-preview-table">
        <thead>
          <tr>
            {fields.map((field) => <th key={field}>{field}</th>)}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, rowIndex) => (
            <tr key={`preview-${rowIndex}`}>
              {fields.map((field) => <td key={field}>{String(row?.[field] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {previewRows.length === 0 && <div className="de-empty-line">No valid records are ready for preview.</div>}
    </div>
  );
}

export default function DataExchange() {
  const queryClient = useQueryClient();
  const projectId = useProjectId();
  // On-hold projects aren't selectable here — the picker mirrors the switcher.
  const { activeProject, activeProjects: projects, loading: projectsLoading } = useProjectContext();
  const fileInputRef = useRef(null);

  const projectOptions = useMemo(() => {
    const byId = new Map();
    for (const project of projects || []) {
      if (project?.id) byId.set(project.id, project);
    }
    if (activeProject?.id) byId.set(activeProject.id, activeProject);
    return [...byId.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [activeProject, projects]);

  const [selectedProjectId, setSelectedProjectId] = useState(projectId || activeProject?.id || "");
  const [targetKey, setTargetKey] = useState(DATASET_KEYS[0]);
  const [importText, setImportText] = useState("");
  const [importSourceName, setImportSourceName] = useState("Manual paste");
  const [importApproved, setImportApproved] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);

  useEffect(() => {
    if (projectId && projectId !== selectedProjectId) setSelectedProjectId(projectId);
  }, [projectId, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId && activeProject?.id) setSelectedProjectId(activeProject.id);
  }, [activeProject?.id, selectedProjectId]);

  useEffect(() => {
    setImportApproved(false);
  }, [selectedProjectId, targetKey]);

  const selectedProject = useMemo(() => (
    projectOptions.find((project) => project.id === selectedProjectId) || null
  ), [projectOptions, selectedProjectId]);

  const selectedTarget = IMPORT_TARGETS[targetKey] || IMPORT_TARGETS[DATASET_KEYS[0]];
  const selectedEntity = entities[selectedTarget.entityKey];

  const recordsQuery = useQuery({
    queryKey: ["data-exchange", selectedTarget.entityKey, selectedProjectId],
    enabled: Boolean(selectedProjectId && selectedEntity),
    queryFn: () => selectedEntity.filter({ project_id: selectedProjectId }, "-created_at"),
    staleTime: 30 * 1000,
  });

  const records = recordsQuery.data || [];
  const exportFields = useMemo(() => (
    collectExportFields(records, selectedTarget.fields)
  ), [records, selectedTarget.fields]);

  const stagedImport = useMemo(() => stageImportText({
    targetKey,
    text: importText,
    project: selectedProject,
  }), [importText, selectedProject, targetKey]);

  const importPreviewFields = useMemo(() => (
    collectExportFields(stagedImport.validRecords, selectedTarget.fields)
  ), [selectedTarget.fields, stagedImport.validRecords]);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject?.id) throw new Error("Select a project before importing.");
      if (!selectedEntity) throw new Error(`No entity client is available for ${selectedTarget.label}.`);
      if (stagedImport.invalidRows.length) throw new Error("Resolve invalid import rows before committing.");
      if (!stagedImport.validRecords.length) throw new Error("No valid rows are ready to import.");
      if (!importApproved) throw new Error("Review and approve the import before committing records.");

      let skippedDuplicates = 0;
      // Skip rows that already exist (or repeat within the paste) by the
      // target's natural key, so a re-import doesn't 409 on the unique index.
      // RFIs key on the normalized rfi_number; submittals on submittal_number
      // (the (project_id, submittal_number) unique index). Other targets have
      // no natural key here and aren't deduped.
      const dedupField =
        targetKey === "rfis" ? "rfi_number"
          : targetKey === "submittals" ? "submittal_number"
            : null;
      const dedupKey = (value) =>
        targetKey === "rfis"
          ? rfiNumberDedupKey(value)
          : value == null ? "" : String(value).trim().toLowerCase();
      const existingKeys = dedupField
        ? new Set(records.map((record) => dedupKey(record[dedupField])).filter(Boolean))
        : null;
      const stagedKeys = new Set();

      const recordsToCreate = stagedImport.validRecords.flatMap((record) => {
        const nextRecord = targetKey === "rfis" && record.rfi_number
          ? { ...record, rfi_number: normalizeRfiNumber(record.rfi_number) }
          : record;
        if (dedupField) {
          const key = dedupKey(nextRecord[dedupField]);
          if (key) {
            if (existingKeys.has(key) || stagedKeys.has(key)) {
              skippedDuplicates += 1;
              return [];
            }
            stagedKeys.add(key);
          }
        }
        const metadata = { ...(record.metadata || {}) };
        delete metadata.onboarding_import;
        return [{
          ...nextRecord,
          metadata: {
            ...metadata,
            data_exchange_import: true,
            import_source_name: importSourceName,
          },
        }];
      });

      if (!recordsToCreate.length) {
        return { rows: [], skippedDuplicates, skippedCreates: 0 };
      }

      const { created, skipped } = await bulkCreateWithFallback(selectedEntity, recordsToCreate);
      return { rows: created, skippedDuplicates, skippedCreates: skipped };
    },
    onSuccess: ({ rows, skippedDuplicates, skippedCreates = 0 }) => {
      queryClient.invalidateQueries({ queryKey: ["data-exchange", selectedTarget.entityKey, selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: [selectedTarget.entityKey] });
      setImportApproved(false);
      const skipBits = [];
      if (skippedDuplicates) skipBits.push(`${skippedDuplicates} duplicate skipped`);
      if (skippedCreates) skipBits.push(`${skippedCreates} row create failed`);
      const skipSuffix = skipBits.length ? `, ${skipBits.join(", ")}` : "";
      if (rows.length > 0 && skippedCreates > 0) {
        toast.warning(`Imported ${rows.length} ${selectedTarget.label.toLowerCase()}${skipSuffix}`);
      } else if (rows.length > 0) {
        toast.success(`Imported ${rows.length} ${selectedTarget.label.toLowerCase()}${skipSuffix}`);
      } else if (skippedDuplicates || skippedCreates) {
        toast.warning(
          `${skipBits.join(", ") || "rows skipped"}; no new rows imported`,
        );
      } else {
        toast.info("No rows were imported");
      }
    },
    onError: (err) => toast.error(err?.message || "Import failed"),
  });

  const exportDisabled = !selectedProject?.id || recordsQuery.isFetching || records.length === 0;
  const importDisabled = !selectedProject?.id
    || importMutation.isPending
    || recordsQuery.isFetching
    || stagedImport.validRecords.length === 0
    || stagedImport.invalidRows.length > 0
    || !importApproved;

  function handleDatasetChange(nextKey) {
    setTargetKey(nextKey);
    setImportText("");
    setImportSourceName("Manual paste");
    setImportApproved(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleExportCsv() {
    if (!selectedProject?.id || !records.length) return;
    const exportedAt = new Date().toISOString();
    downloadTextFile({
      filename: makeExportFilename({ project: selectedProject, target: selectedTarget, extension: "csv", exportedAt }),
      content: recordsToCsv(records, selectedTarget.fields),
      type: "text/csv;charset=utf-8",
    });
  }

  function handleExportJson() {
    if (!selectedProject?.id || !records.length) return;
    const exportedAt = new Date().toISOString();
    const payload = buildJsonExport({
      project: selectedProject,
      targetKey,
      target: selectedTarget,
      records,
      exportedAt,
    });
    downloadTextFile({
      filename: makeExportFilename({ project: selectedProject, target: selectedTarget, extension: "json", exportedAt }),
      content: `${JSON.stringify(payload, null, 2)}\n`,
      type: "application/json;charset=utf-8",
    });
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileBusy(true);
    try {
      const text = await readDataExchangeFile(file);
      setImportText(text);
      setImportSourceName(file.name);
      setImportApproved(false);
      toast.success(`Loaded ${file.name}`);
    } catch (err) {
      toast.error(err?.message || "Could not read import file");
    } finally {
      setFileBusy(false);
    }
  }

  function loadSampleRows() {
    setImportText(IMPORT_EXAMPLES[targetKey] || "");
    setImportSourceName("Sample rows");
    setImportApproved(false);
  }

  return (
    <div className="sb-dashboard-reference-page data-exchange-page">
      <style>{dataExchangeStyles}</style>

      <header className="de-header">
        <div>
          <span className="de-eyebrow">SETUP / DATA EXCHANGE</span>
          <h1>Import and Export Project Data</h1>
          <p>
            Move project records in and out of SteelBuild Pro with reviewable CSV, XLSX, and JSON workflows.
            Imports stage data first, validate required fields, and require approval before writing.
          </p>
        </div>
        <button type="button" className="de-icon-btn" onClick={() => recordsQuery.refetch()} disabled={!selectedProject?.id || recordsQuery.isFetching}>
          <RefreshCw size={16} />
          {recordsQuery.isFetching ? "Refreshing" : "Refresh"}
        </button>
      </header>

      <section className="de-control-bar">
        <label className="de-field">
          <span>Project</span>
          <select
            value={selectedProjectId}
            onChange={(event) => {
              setSelectedProjectId(event.target.value);
              setImportApproved(false);
            }}
            disabled={projectsLoading}
          >
            <option value="">{projectsLoading ? "Loading projects..." : "Select a project"}</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>{formatProjectLabel(project)}</option>
            ))}
          </select>
        </label>
        <label className="de-field">
          <span>Dataset</span>
          <select value={targetKey} onChange={(event) => handleDatasetChange(event.target.value)}>
            {DATASET_KEYS.map((key) => (
              <option key={key} value={key}>{IMPORT_TARGETS[key].label}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="de-stats">
        <StatCard label="Selected dataset" value={selectedTarget.label} detail={selectedTarget.entityKey} />
        <StatCard label="Records available" value={recordsQuery.isFetching ? "..." : records.length} detail={selectedProject ? formatProjectLabel(selectedProject) : "No project selected"} />
        <StatCard label="Rows ready to import" value={stagedImport.validRecords.length} detail={`${stagedImport.invalidRows.length} invalid`} />
        <StatCard label="Required fields" value={selectedTarget.required.join(", ") || "None"} detail="validated before write" />
      </section>

      {!selectedProject?.id && (
        <div className="de-banner">
          <AlertTriangle size={18} />
          <span>Select a project before exporting or importing project data.</span>
        </div>
      )}

      <main className="de-grid">
        <section className="de-panel">
          <SectionHeader
            icon={Download}
            title="Export"
            detail="Download clean, project-scoped data for reporting, review, or transfer."
          />
          <div className="de-export-summary">
            <div>
              <span>Fields</span>
              <strong>{exportFields.length}</strong>
            </div>
            <div>
              <span>Rows</span>
              <strong>{records.length}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{recordsQuery.isFetching ? "Loading" : records.length ? "Ready" : "Empty"}</strong>
            </div>
          </div>
          <div className="de-actions">
            <button type="button" className="de-primary-btn" onClick={handleExportCsv} disabled={exportDisabled}>
              <FileSpreadsheet size={16} />
              Export CSV
            </button>
            <button type="button" className="de-secondary-btn" onClick={handleExportJson} disabled={exportDisabled}>
              <FileJson size={16} />
              Export JSON
            </button>
          </div>
          <div className="de-note">
            <Database size={16} />
            <span>Exports omit internal row IDs and project IDs from record rows. The JSON file includes project and dataset metadata.</span>
          </div>
          <RecordPreview rows={records} fields={exportFields.slice(0, 8)} />
        </section>

        <section className="de-panel">
          <SectionHeader
            icon={ImportIcon}
            title="Import"
            detail="Upload or paste CSV, TSV, XLS, or XLSX data, inspect the mapped fields, then approve the write."
          />
          <div className="de-import-controls">
            <label className="de-upload">
              <Upload size={16} />
              <span>{fileBusy ? "Reading file..." : "Upload file"}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                onChange={handleImportFile}
                disabled={fileBusy}
              />
            </label>
            <button type="button" className="de-secondary-btn" onClick={loadSampleRows}>
              <FileSpreadsheet size={16} />
              Load sample rows
            </button>
          </div>

          <div className="de-import-editor">
            <div className="de-import-meta">
              <span>{importSourceName}</span>
              <span>{stagedImport.validRecords.length} ready / {stagedImport.invalidRows.length} invalid</span>
            </div>
            <textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportSourceName("Manual paste");
                setImportApproved(false);
              }}
              placeholder="Paste CSV or TSV rows here..."
              spellCheck={false}
            />
          </div>

          <MappingPreview stagedImport={stagedImport} />
          <InvalidRowsPanel invalidRows={stagedImport.invalidRows} />

          <div className="de-approval">
            <label>
              <input
                type="checkbox"
                checked={importApproved}
                onChange={(event) => setImportApproved(event.target.checked)}
              />
              I reviewed the preview and approve writing these records to the selected project.
            </label>
            <button type="button" className="de-primary-btn" onClick={() => importMutation.mutate()} disabled={importDisabled}>
              {importMutation.isPending ? <RefreshCw size={16} /> : <ClipboardCheck size={16} />}
              {importMutation.isPending ? "Importing..." : `Commit ${stagedImport.validRecords.length} rows`}
            </button>
          </div>
        </section>

        <section className="de-panel de-wide">
          <SectionHeader
            icon={ShieldCheck}
            title="Staged Preview"
            detail="This is what will be written if you approve the import. Fix the source data if rows are missing required fields or contain disallowed statuses."
          />
          <RecordPreview rows={stagedImport.validRecords} fields={importPreviewFields} />
          {stagedImport.validRecords.length > 6 && (
            <div className="de-note">
              <CheckCircle2 size={16} />
              <span>Showing the first 6 of {stagedImport.validRecords.length} valid rows.</span>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const dataExchangeStyles = `
.data-exchange-page {
  min-height: 100%;
  padding: 24px;
  color: var(--text-primary);
  background: var(--bg);
}

.de-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.de-header h1 {
  margin: 4px 0 8px;
  font-size: 30px;
  line-height: 1.15;
  letter-spacing: 0;
}

.de-header p {
  max-width: 780px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.de-eyebrow,
.de-field span,
.de-stat-card span,
.de-import-meta,
.de-export-summary span {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.de-control-bar,
.de-stats,
.de-grid,
.de-import-controls,
.de-actions,
.de-approval,
.de-export-summary {
  display: grid;
  gap: 14px;
}

.de-control-bar {
  grid-template-columns: minmax(260px, 1.2fr) minmax(220px, 0.8fr);
  margin-bottom: 14px;
}

.de-field {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.de-field select,
.de-import-editor textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-elevated, var(--card));
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.4;
  outline: none;
}

.de-field select {
  min-height: 42px;
  padding: 0 12px;
}

.de-field select:focus,
.de-import-editor textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
}

.de-stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 14px;
}

.de-stat-card,
.de-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

.de-stat-card {
  display: grid;
  gap: 4px;
  padding: 14px;
}

.de-stat-card strong {
  min-width: 0;
  font-size: 20px;
  line-height: 1.2;
  word-break: break-word;
}

.de-stat-card small {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.de-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.12);
  color: var(--text-primary);
  font-size: 13px;
}

.de-grid {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
}

.de-panel {
  padding: 18px;
  min-width: 0;
}

.de-wide {
  grid-column: 1 / -1;
}

.de-section-header {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.de-section-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--surface-muted, rgba(15, 23, 42, 0.06));
  color: var(--accent);
  flex: 0 0 auto;
}

.de-section-header h2 {
  margin: 0 0 4px;
  font-size: 18px;
  letter-spacing: 0;
}

.de-section-header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.de-export-summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 14px;
}

.de-export-summary > div {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.de-export-summary strong {
  font-size: 18px;
}

.de-actions,
.de-import-controls,
.de-approval {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 14px;
}

.de-primary-btn,
.de-secondary-btn,
.de-icon-btn,
.de-upload {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 13px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  white-space: nowrap;
}

.de-primary-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg-base);
}

.de-secondary-btn,
.de-icon-btn,
.de-upload {
  background: var(--surface-elevated, var(--card));
  color: var(--text-primary);
}

.de-primary-btn:disabled,
.de-secondary-btn:disabled,
.de-icon-btn:disabled,
.de-upload:has(input:disabled) {
  opacity: 0.55;
  cursor: not-allowed;
}

.de-upload {
  position: relative;
  overflow: hidden;
}

.de-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.de-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.de-import-editor {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  overflow: hidden;
  margin-bottom: 14px;
}

.de-import-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-elevated, var(--card));
}

.de-import-editor textarea {
  display: block;
  min-height: 210px;
  resize: vertical;
  border: 0;
  border-radius: 0;
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  background: var(--surface-elevated, var(--card));
}

.de-mapping {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 14px;
}

.de-mapping-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  font-size: 13px;
}

.de-mapping-row:last-child {
  border-bottom: 0;
}

.de-mapping-row span,
.de-mapping-row strong {
  min-width: 0;
  overflow-wrap: anywhere;
}

.de-mapping-head {
  background: var(--surface-elevated, var(--card));
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.de-validation {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.10);
  color: var(--text-primary);
}

.de-validation ul {
  margin: 6px 0 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.de-approval {
  align-items: center;
}

.de-approval label {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-elevated, var(--card));
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.4;
}

.de-approval input {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
}

.de-table-wrap {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.de-preview-table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
  font-size: 12px;
}

.de-preview-table th,
.de-preview-table td {
  max-width: 240px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.de-preview-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-elevated, var(--card));
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.de-preview-table tr:last-child td {
  border-bottom: 0;
}

.de-empty-line {
  padding: 14px;
  color: var(--text-muted);
  font-size: 13px;
}

@media (max-width: 980px) {
  .de-header,
  .de-control-bar,
  .de-grid {
    grid-template-columns: 1fr;
  }

  .de-header {
    display: grid;
  }

  .de-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .data-exchange-page {
    padding: 16px;
  }

  .de-header h1 {
    font-size: 24px;
  }

  .de-stats,
  .de-actions,
  .de-import-controls,
  .de-approval,
  .de-export-summary {
    grid-template-columns: 1fr;
  }

  .de-primary-btn,
  .de-secondary-btn,
  .de-icon-btn,
  .de-upload {
    width: 100%;
  }

  .de-import-meta {
    align-items: flex-start;
    flex-direction: column;
  }
}
`;
