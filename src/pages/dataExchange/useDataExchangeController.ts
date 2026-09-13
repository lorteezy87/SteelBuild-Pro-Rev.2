import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefCallback,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
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
  assertImportReady,
  buildProjectOptions,
  DATASET_KEYS,
  dataExchangeQueryKeys,
  type DataExchangeProject,
  type DataExchangeRecord,
  formatProjectLabel,
  type ImportTarget,
  IMPORT_EXAMPLES,
  prepareImportRecords,
  readDataExchangeFile,
  summarizeImportResult,
} from "./dataExchangeLogic";

interface InvalidImportValue {
  field: string;
  value: unknown;
  allowed?: unknown[];
}

export interface InvalidImportRow {
  rowNumber: number;
  missing?: string[];
  invalidValues?: InvalidImportValue[];
  raw?: unknown[];
}

export interface StagedImport {
  headers: string[];
  mappedHeaders: Array<string | null>;
  validRecords: DataExchangeRecord[];
  invalidRows: InvalidImportRow[];
}

interface DataExchangeEntity {
  filter: (
    conditions: Record<string, unknown>,
    sortBy?: string,
  ) => Promise<DataExchangeRecord[]>;
  bulkCreate: (records: DataExchangeRecord[]) => Promise<DataExchangeRecord[]>;
  create: (record: DataExchangeRecord) => Promise<DataExchangeRecord>;
}

interface ImportMutationResult {
  rows: DataExchangeRecord[];
  skippedDuplicates: number;
  skippedCreates: number;
}

export interface DataExchangeController {
  projectOptions: DataExchangeProject[];
  projectsLoading: boolean;
  selectedProjectId: string;
  selectedProject: DataExchangeProject | null;
  targetKey: string;
  datasetKeys: string[];
  importTargets: Record<string, ImportTarget>;
  selectedTarget: ImportTarget;
  records: DataExchangeRecord[];
  exportFields: string[];
  importPreviewFields: string[];
  stagedImport: StagedImport;
  importText: string;
  importSourceName: string;
  importApproved: boolean;
  fileBusy: boolean;
  fileInputRef: RefCallback<HTMLInputElement>;
  recordsQuery: UseQueryResult<DataExchangeRecord[], Error>;
  importMutation: UseMutationResult<ImportMutationResult, Error, void>;
  exportDisabled: boolean;
  importDisabled: boolean;
  selectedProjectLabel: string | null | undefined;
  handleProjectChange: (projectId: string) => void;
  handleDatasetChange: (targetKey: string) => void;
  handleImportTextChange: (text: string) => void;
  handleImportApprovalChange: (approved: boolean) => void;
  handleImportFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleExportCsv: () => void;
  handleExportJson: () => void;
  loadSampleRows: () => void;
  refreshRecords: () => void;
  commitImport: () => void;
}

const importTargets = IMPORT_TARGETS as Record<string, ImportTarget>;
const buildTypedJsonExport = buildJsonExport as (options: {
  project: DataExchangeProject;
  targetKey: string;
  target: ImportTarget;
  records: DataExchangeRecord[];
  exportedAt: string;
}) => unknown;

function downloadTextFile({
  filename,
  content,
  type,
}: {
  filename: string;
  content: string;
  type: string;
}): void {
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

function errorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object"
    && error !== null
    && "message" in error
    && typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

export function useDataExchangeController(): DataExchangeController {
  const queryClient = useQueryClient();
  const projectId = useProjectId();
  const projectContext = useProjectContext();
  const activeProject = projectContext.activeProject as DataExchangeProject | null;
  const projects = projectContext.activeProjects as DataExchangeProject[];
  const projectsLoading = Boolean(projectContext.loading);
  const fileInputElementRef = useRef<HTMLInputElement | null>(null);

  const projectOptions = useMemo(
    () => buildProjectOptions(projects, activeProject),
    [activeProject, projects],
  );

  const [selectedProjectId, setSelectedProjectId] = useState(
    projectId || activeProject?.id || "",
  );
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

  const selectedProject = useMemo(
    () => projectOptions.find((project) => project.id === selectedProjectId) || null,
    [projectOptions, selectedProjectId],
  );

  const selectedTarget = importTargets[targetKey] || importTargets[DATASET_KEYS[0]];
  const selectedEntity = entities[selectedTarget.entityKey as keyof typeof entities] as
    | DataExchangeEntity
    | undefined;

  const recordsQuery = useQuery<DataExchangeRecord[], Error>({
    queryKey: dataExchangeQueryKeys.records(selectedTarget.entityKey, selectedProjectId),
    enabled: Boolean(selectedProjectId && selectedEntity),
    queryFn: () => {
      if (!selectedEntity) {
        throw new Error(`No entity client is available for ${selectedTarget.label}.`);
      }
      return selectedEntity.filter({ project_id: selectedProjectId }, "-created_at");
    },
    staleTime: 30 * 1000,
  });

  const records = recordsQuery.data || [];
  const exportFields = useMemo(
    () => collectExportFields(records, selectedTarget.fields) as string[],
    [records, selectedTarget.fields],
  );

  const stagedImport = useMemo(
    () => stageImportText({
      targetKey,
      text: importText,
      project: selectedProject,
    }) as StagedImport,
    [importText, selectedProject, targetKey],
  );

  const importPreviewFields = useMemo(
    () => collectExportFields(
      stagedImport.validRecords,
      selectedTarget.fields,
    ) as string[],
    [selectedTarget.fields, stagedImport.validRecords],
  );

  const importMutation = useMutation<ImportMutationResult, Error>({
    mutationFn: async () => {
      assertImportReady({
        projectId: selectedProject?.id,
        entityAvailable: Boolean(selectedEntity),
        targetLabel: selectedTarget.label,
        invalidRowCount: stagedImport.invalidRows.length,
        validRowCount: stagedImport.validRecords.length,
        approved: importApproved,
      });
      const { recordsToCreate, skippedDuplicates } = prepareImportRecords({
        targetKey,
        existingRecords: records,
        validRecords: stagedImport.validRecords,
        importSourceName,
      });

      if (!recordsToCreate.length) {
        return { rows: [], skippedDuplicates, skippedCreates: 0 };
      }

      const { created, skipped } = await bulkCreateWithFallback(
        selectedEntity,
        recordsToCreate,
      );
      return {
        rows: created as DataExchangeRecord[],
        skippedDuplicates,
        skippedCreates: skipped,
      };
    },
    onSuccess: ({ rows, skippedDuplicates, skippedCreates = 0 }) => {
      queryClient.invalidateQueries({
        queryKey: dataExchangeQueryKeys.records(
          selectedTarget.entityKey,
          selectedProjectId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: dataExchangeQueryKeys.entity(selectedTarget.entityKey),
      });
      setImportApproved(false);
      const summary = summarizeImportResult({
        importedCount: rows.length,
        skippedDuplicates,
        skippedCreates,
        targetLabel: selectedTarget.label,
      });
      toast[summary.level](summary.message);
    },
    onError: (error) => toast.error(errorMessage(error, "Import failed")),
  });

  const exportDisabled = !selectedProject?.id
    || recordsQuery.isFetching
    || records.length === 0;
  const importDisabled = !selectedProject?.id
    || importMutation.isPending
    || recordsQuery.isFetching
    || stagedImport.validRecords.length === 0
    || stagedImport.invalidRows.length > 0
    || !importApproved;

  function handleProjectChange(nextProjectId: string): void {
    setSelectedProjectId(nextProjectId);
    setImportApproved(false);
  }

  function handleDatasetChange(nextKey: string): void {
    setTargetKey(nextKey);
    setImportText("");
    setImportSourceName("Manual paste");
    setImportApproved(false);
    if (fileInputElementRef.current) fileInputElementRef.current.value = "";
  }

  function handleImportTextChange(text: string): void {
    setImportText(text);
    setImportSourceName("Manual paste");
    setImportApproved(false);
  }

  function handleExportCsv(): void {
    if (!selectedProject?.id || !records.length) return;
    const exportedAt = new Date().toISOString();
    downloadTextFile({
      filename: makeExportFilename({
        project: selectedProject,
        target: selectedTarget,
        extension: "csv",
        exportedAt,
      }),
      content: recordsToCsv(records, selectedTarget.fields),
      type: "text/csv;charset=utf-8",
    });
  }

  function handleExportJson(): void {
    if (!selectedProject?.id || !records.length) return;
    const exportedAt = new Date().toISOString();
    const payload = buildTypedJsonExport({
      project: selectedProject,
      targetKey,
      target: selectedTarget,
      records,
      exportedAt,
    });
    downloadTextFile({
      filename: makeExportFilename({
        project: selectedProject,
        target: selectedTarget,
        extension: "json",
        exportedAt,
      }),
      content: `${JSON.stringify(payload, null, 2)}\n`,
      type: "application/json;charset=utf-8",
    });
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileBusy(true);
    try {
      const text = await readDataExchangeFile(file);
      setImportText(text);
      setImportSourceName(file.name);
      setImportApproved(false);
      toast.success(`Loaded ${file.name}`);
    } catch (error) {
      toast.error(errorMessage(error, "Could not read import file"));
    } finally {
      setFileBusy(false);
    }
  }

  function loadSampleRows(): void {
    setImportText(IMPORT_EXAMPLES[targetKey] || "");
    setImportSourceName("Sample rows");
    setImportApproved(false);
  }

  return {
    projectOptions,
    projectsLoading,
    selectedProjectId,
    selectedProject,
    targetKey,
    datasetKeys: DATASET_KEYS,
    importTargets,
    selectedTarget,
    records,
    exportFields,
    importPreviewFields,
    stagedImport,
    importText,
    importSourceName,
    importApproved,
    fileBusy,
    fileInputRef: (element) => {
      fileInputElementRef.current = element;
    },
    recordsQuery,
    importMutation,
    exportDisabled,
    importDisabled,
    selectedProjectLabel: selectedProject
      ? formatProjectLabel(selectedProject)
      : "No project selected",
    handleProjectChange,
    handleDatasetChange,
    handleImportTextChange,
    handleImportApprovalChange: setImportApproved,
    handleImportFile,
    handleExportCsv,
    handleExportJson,
    loadSampleRows,
    refreshRecords: () => {
      void recordsQuery.refetch();
    },
    commitImport: () => importMutation.mutate(),
  };
}
