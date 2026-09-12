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
  type LucideIcon,
} from "lucide-react";
import { formatProjectLabel, type DataExchangeRecord } from "./dataExchangeLogic";
import type {
  DataExchangeController,
  InvalidImportRow,
  StagedImport,
} from "./useDataExchangeController";

function SectionHeader({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
}) {
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

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string | null;
}) {
  return (
    <div className="de-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function MappingPreview({ stagedImport }: { stagedImport: StagedImport }) {
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
        <div className="de-empty-line">
          Paste or upload a file to preview column mapping.
        </div>
      )}
    </div>
  );
}

function InvalidRowsPanel({ invalidRows }: { invalidRows: InvalidImportRow[] }) {
  if (!invalidRows.length) return null;
  return (
    <div className="de-validation">
      <AlertTriangle size={18} />
      <div>
        <strong>{invalidRows.length} row(s) need review before import.</strong>
        <ul>
          {invalidRows.slice(0, 6).map((row) => (
            <li key={row.rowNumber}>
              Row {row.rowNumber}:{" "}
              {row.missing?.length ? `missing ${row.missing.join(", ")}` : ""}
              {row.invalidValues?.length
                ? ` invalid ${row.invalidValues
                  .map((invalidValue) => `${invalidValue.field}=${invalidValue.value}`)
                  .join(", ")}`
                : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RecordPreview({
  rows,
  fields,
}: {
  rows: DataExchangeRecord[];
  fields: string[];
}) {
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
              {fields.map((field) => (
                <td key={field}>{String(row[field] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {previewRows.length === 0 && (
        <div className="de-empty-line">No valid records are ready for preview.</div>
      )}
    </div>
  );
}

function DataExchangeHeader({
  controller,
}: {
  controller: DataExchangeController;
}) {
  return (
    <header className="de-header">
      <div>
        <span className="de-eyebrow">SETUP / DATA EXCHANGE</span>
        <h1>Import and Export Project Data</h1>
        <p>
          Move project records in and out of SteelBuild Pro with reviewable CSV,
          XLSX, and JSON workflows. Imports stage data first, validate required
          fields, and require approval before writing.
        </p>
      </div>
      <button
        type="button"
        className="de-icon-btn"
        onClick={controller.refreshRecords}
        disabled={!controller.selectedProject?.id || controller.recordsQuery.isFetching}
      >
        <RefreshCw size={16} />
        {controller.recordsQuery.isFetching ? "Refreshing" : "Refresh"}
      </button>
    </header>
  );
}

function DataSourceControls({
  controller,
}: {
  controller: DataExchangeController;
}) {
  return (
    <section className="de-control-bar">
      <label className="de-field">
        <span>Project</span>
        <select
          value={controller.selectedProjectId}
          onChange={(event) => controller.handleProjectChange(event.target.value)}
          disabled={controller.projectsLoading}
        >
          <option value="">
            {controller.projectsLoading ? "Loading projects..." : "Select a project"}
          </option>
          {controller.projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {formatProjectLabel(project)}
            </option>
          ))}
        </select>
      </label>
      <label className="de-field">
        <span>Dataset</span>
        <select
          value={controller.targetKey}
          onChange={(event) => controller.handleDatasetChange(event.target.value)}
        >
          {controller.datasetKeys.map((key) => (
            <option key={key} value={key}>
              {controller.importTargets[key].label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function DatasetSummaryCards({
  controller,
}: {
  controller: DataExchangeController;
}) {
  return (
    <section className="de-stats">
      <StatCard
        label="Selected dataset"
        value={controller.selectedTarget.label}
        detail={controller.selectedTarget.entityKey}
      />
      <StatCard
        label="Records available"
        value={controller.recordsQuery.isFetching ? "..." : controller.records.length}
        detail={controller.selectedProjectLabel}
      />
      <StatCard
        label="Rows ready to import"
        value={controller.stagedImport.validRecords.length}
        detail={`${controller.stagedImport.invalidRows.length} invalid`}
      />
      <StatCard
        label="Required fields"
        value={controller.selectedTarget.required.join(", ") || "None"}
        detail="validated before write"
      />
    </section>
  );
}

function ExportSourceCard({
  controller,
}: {
  controller: DataExchangeController;
}) {
  return (
    <section className="de-panel">
      <SectionHeader
        icon={Download}
        title="Export"
        detail="Download clean, project-scoped data for reporting, review, or transfer."
      />
      <div className="de-export-summary">
        <div>
          <span>Fields</span>
          <strong>{controller.exportFields.length}</strong>
        </div>
        <div>
          <span>Rows</span>
          <strong>{controller.records.length}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>
            {controller.recordsQuery.isFetching
              ? "Loading"
              : controller.records.length
                ? "Ready"
                : "Empty"}
          </strong>
        </div>
      </div>
      <div className="de-actions">
        <button
          type="button"
          className="de-primary-btn"
          onClick={controller.handleExportCsv}
          disabled={controller.exportDisabled}
        >
          <FileSpreadsheet size={16} />
          Export CSV
        </button>
        <button
          type="button"
          className="de-secondary-btn"
          onClick={controller.handleExportJson}
          disabled={controller.exportDisabled}
        >
          <FileJson size={16} />
          Export JSON
        </button>
      </div>
      <div className="de-note">
        <Database size={16} />
        <span>
          Exports omit internal row IDs and project IDs from record rows. The
          JSON file includes project and dataset metadata.
        </span>
      </div>
      <RecordPreview
        rows={controller.records}
        fields={controller.exportFields.slice(0, 8)}
      />
    </section>
  );
}

function ImportSourceCard({
  controller,
}: {
  controller: DataExchangeController;
}) {
  return (
    <section className="de-panel">
      <SectionHeader
        icon={ImportIcon}
        title="Import"
        detail="Upload or paste CSV, TSV, XLS, or XLSX data, inspect the mapped fields, then approve the write."
      />
      <div className="de-import-controls">
        <label className="de-upload">
          <Upload size={16} />
          <span>{controller.fileBusy ? "Reading file..." : "Upload file"}</span>
          <input
            ref={controller.fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls"
            onChange={controller.handleImportFile}
            disabled={controller.fileBusy}
          />
        </label>
        <button
          type="button"
          className="de-secondary-btn"
          onClick={controller.loadSampleRows}
        >
          <FileSpreadsheet size={16} />
          Load sample rows
        </button>
      </div>

      <div className="de-import-editor">
        <div className="de-import-meta">
          <span>{controller.importSourceName}</span>
          <span>
            {controller.stagedImport.validRecords.length} ready /{" "}
            {controller.stagedImport.invalidRows.length} invalid
          </span>
        </div>
        <textarea
          value={controller.importText}
          onChange={(event) => controller.handleImportTextChange(event.target.value)}
          placeholder="Paste CSV or TSV rows here..."
          spellCheck={false}
        />
      </div>

      <MappingPreview stagedImport={controller.stagedImport} />
      <InvalidRowsPanel invalidRows={controller.stagedImport.invalidRows} />

      <div className="de-approval">
        <label>
          <input
            type="checkbox"
            checked={controller.importApproved}
            onChange={(event) => {
              controller.handleImportApprovalChange(event.target.checked);
            }}
          />
          I reviewed the preview and approve writing these records to the selected
          project.
        </label>
        <button
          type="button"
          className="de-primary-btn"
          onClick={controller.commitImport}
          disabled={controller.importDisabled}
        >
          {controller.importMutation.isPending
            ? <RefreshCw size={16} />
            : <ClipboardCheck size={16} />}
          {controller.importMutation.isPending
            ? "Importing..."
            : `Commit ${controller.stagedImport.validRecords.length} rows`}
        </button>
      </div>
    </section>
  );
}

function ImportReviewSection({
  controller,
}: {
  controller: DataExchangeController;
}) {
  return (
    <section className="de-panel de-wide">
      <SectionHeader
        icon={ShieldCheck}
        title="Staged Preview"
        detail="This is what will be written if you approve the import. Fix the source data if rows are missing required fields or contain disallowed statuses."
      />
      <RecordPreview
        rows={controller.stagedImport.validRecords}
        fields={controller.importPreviewFields}
      />
      {controller.stagedImport.validRecords.length > 6 && (
        <div className="de-note">
          <CheckCircle2 size={16} />
          <span>
            Showing the first 6 of {controller.stagedImport.validRecords.length} valid
            rows.
          </span>
        </div>
      )}
    </section>
  );
}

export function DataExchangeSections({
  controller,
}: {
  controller: DataExchangeController;
}) {
  return (
    <>
      <DataExchangeHeader controller={controller} />
      <DataSourceControls controller={controller} />
      <DatasetSummaryCards controller={controller} />

      {!controller.selectedProject?.id && (
        <div className="de-banner">
          <AlertTriangle size={18} />
          <span>Select a project before exporting or importing project data.</span>
        </div>
      )}

      <main className="de-grid">
        <ExportSourceCard controller={controller} />
        <ImportSourceCard controller={controller} />
        <ImportReviewSection controller={controller} />
      </main>
    </>
  );
}
