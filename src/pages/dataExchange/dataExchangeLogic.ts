import { IMPORT_TARGETS } from "@/lib/onboardingTemplates";
import { normalizeRfiNumber, rfiNumberDedupKey } from "@/lib/rfiImportUtils";
import { readFileText } from "@/lib/textDecoding";

export type DataExchangeRecord = Record<string, unknown>;

export interface DataExchangeProject extends DataExchangeRecord {
  id: string;
  name?: string | null;
  project_name?: string | null;
  project_number?: string | null;
}

export interface ImportTarget {
  entityKey: string;
  fields: string[];
  label: string;
  required: string[];
}

interface PrepareImportRecordsOptions {
  targetKey: string;
  existingRecords: DataExchangeRecord[];
  validRecords: DataExchangeRecord[];
  importSourceName: string;
}

interface ImportReadinessOptions {
  projectId?: string | null;
  entityAvailable: boolean;
  targetLabel: string;
  invalidRowCount: number;
  validRowCount: number;
  approved: boolean;
}

interface ImportResultSummaryOptions {
  importedCount: number;
  skippedDuplicates: number;
  skippedCreates?: number;
  targetLabel: string;
}

export const DATASET_KEYS = Object.keys(IMPORT_TARGETS);

export const IMPORT_EXAMPLES: Record<string, string> = {
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

export const dataExchangeQueryKeys = {
  records: (entityKey: string, projectId: string) =>
    ["data-exchange", entityKey, projectId] as const,
  entity: (entityKey: string) => [entityKey] as const,
};

export function buildProjectOptions(
  projects: DataExchangeProject[] | null | undefined,
  activeProject: DataExchangeProject | null | undefined,
): DataExchangeProject[] {
  const byId = new Map<string, DataExchangeProject>();
  for (const project of projects || []) {
    if (project?.id) byId.set(project.id, project);
  }
  if (activeProject?.id) byId.set(activeProject.id, activeProject);
  return [...byId.values()].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );
}

export function formatProjectLabel(
  project: DataExchangeProject | null | undefined,
): string | null | undefined {
  if (!project) return "Select a project";
  return project.project_number ? `${project.project_number} - ${project.name}` : project.name;
}

export async function readDataExchangeFile(file: File | null | undefined): Promise<string> {
  if (!file) return "";
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const xlsxModule = await import("xlsx");
    const XLSX = xlsxModule.default || xlsxModule;
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return "";
    return XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName], { blankrows: false });
  }
  return (await readFileText(file)).text;
}

export function assertImportReady({
  projectId,
  entityAvailable,
  targetLabel,
  invalidRowCount,
  validRowCount,
  approved,
}: ImportReadinessOptions): void {
  if (!projectId) throw new Error("Select a project before importing.");
  if (!entityAvailable) throw new Error(`No entity client is available for ${targetLabel}.`);
  if (invalidRowCount) throw new Error("Resolve invalid import rows before committing.");
  if (!validRowCount) throw new Error("No valid rows are ready to import.");
  if (!approved) throw new Error("Review and approve the import before committing records.");
}

function importDedupConfig(targetKey: string): {
  field: string;
  key: (value: unknown) => string | null;
} | null {
  if (targetKey === "rfis") {
    return { field: "rfi_number", key: rfiNumberDedupKey };
  }
  if (targetKey === "submittals") {
    return {
      field: "submittal_number",
      key: (value) => value == null ? "" : String(value).trim().toLowerCase(),
    };
  }
  return null;
}

export function prepareImportRecords({
  targetKey,
  existingRecords,
  validRecords,
  importSourceName,
}: PrepareImportRecordsOptions): {
  recordsToCreate: DataExchangeRecord[];
  skippedDuplicates: number;
} {
  const dedup = importDedupConfig(targetKey);
  const existingKeys = dedup
    ? new Set(existingRecords.map((record) => dedup.key(record[dedup.field])).filter(Boolean))
    : null;
  const stagedKeys = new Set<string>();
  let skippedDuplicates = 0;

  const recordsToCreate = validRecords.flatMap((record) => {
    const nextRecord = targetKey === "rfis" && record.rfi_number
      ? { ...record, rfi_number: normalizeRfiNumber(record.rfi_number) }
      : record;
    if (dedup && existingKeys) {
      const key = dedup.key(nextRecord[dedup.field]);
      if (key) {
        if (existingKeys.has(key) || stagedKeys.has(key)) {
          skippedDuplicates += 1;
          return [];
        }
        stagedKeys.add(key);
      }
    }
    const metadata = { ...((record.metadata || {}) as DataExchangeRecord) };
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

  return { recordsToCreate, skippedDuplicates };
}

export function summarizeImportResult({
  importedCount,
  skippedDuplicates,
  skippedCreates = 0,
  targetLabel,
}: ImportResultSummaryOptions): {
  level: "success" | "warning" | "info";
  message: string;
} {
  const skipBits: string[] = [];
  if (skippedDuplicates) skipBits.push(`${skippedDuplicates} duplicate skipped`);
  if (skippedCreates) skipBits.push(`${skippedCreates} row create failed`);
  const skipSuffix = skipBits.length ? `, ${skipBits.join(", ")}` : "";

  if (importedCount > 0 && skippedCreates > 0) {
    return {
      level: "warning",
      message: `Imported ${importedCount} ${targetLabel.toLowerCase()}${skipSuffix}`,
    };
  }
  if (importedCount > 0) {
    return {
      level: "success",
      message: `Imported ${importedCount} ${targetLabel.toLowerCase()}${skipSuffix}`,
    };
  }
  if (skippedDuplicates || skippedCreates) {
    return {
      level: "warning",
      message: `${skipBits.join(", ") || "rows skipped"}; no new rows imported`,
    };
  }
  return { level: "info", message: "No rows were imported" };
}
