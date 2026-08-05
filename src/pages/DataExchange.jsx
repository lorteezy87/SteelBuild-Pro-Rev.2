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
import {
  DATASET_KEYS,
  IMPORT_EXAMPLES,
  formatProjectLabel,
  buildProjectOptions,
  downloadTextFile,
  readDataExchangeFile,
  prepareImportRecords,
  buildImportResultToast,
} from "./dataExchange/dataExchangePageHelpers";
import {
  SectionHeader,
  StatCard,
  MappingPreview,
  InvalidRowsPanel,
  RecordPreview,
} from "./dataExchange/DataExchangeUi";
import { dataExchangeStyles } from "./dataExchange/dataExchangeStyles";

export default function DataExchange() {
  const queryClient = useQueryClient();
  const projectId = useProjectId();
  // On-hold projects aren't selectable here — the picker mirrors the switcher.
  const { activeProject, activeProjects: projects, loading: projectsLoading } = useProjectContext();
  const fileInputRef = useRef(null);

  const projectOptions = useMemo(
    () => buildProjectOptions(projects, activeProject),
    [activeProject, projects],
  );

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

      // Skip rows that already exist (or repeat within the paste) by the
      // target's natural key, so a re-import doesn't 409 on the unique index.
      const { recordsToCreate, skippedDuplicates } = prepareImportRecords({
        targetKey,
        validRecords: stagedImport.validRecords,
        existingRecords: records,
        importSourceName,
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
      const resultToast = buildImportResultToast({
        rowsCreated: rows.length,
        skippedDuplicates,
        skippedCreates,
        label: selectedTarget.label,
      });
      if (resultToast.kind === "warning") toast.warning(resultToast.message);
      else if (resultToast.kind === "success") toast.success(resultToast.message);
      else toast.info(resultToast.message);
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

