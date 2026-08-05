/**
 * Pure helpers for the Data Exchange page.
 * Side-effectful download/file-read utilities live here as pure-ish I/O helpers
 * (no React / no TanStack Query).
 */
import { IMPORT_TARGETS } from "@/lib/onboardingTemplates";
import { normalizeRfiNumber, rfiNumberDedupKey } from "@/lib/rfiImportUtils";

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

export type ProjectLike = {
  id?: string;
  name?: string | null;
  project_number?: string | null;
  [key: string]: unknown;
};

export function formatProjectLabel(project: ProjectLike | null | undefined): string {
  if (!project) return "Select a project";
  return project.project_number ? `${project.project_number} - ${project.name}` : String(project.name || "");
}

/** Deduped project list for the picker (active + listed), sorted by name. */
export function buildProjectOptions(
  projects: ProjectLike[] | null | undefined,
  activeProject: ProjectLike | null | undefined,
): ProjectLike[] {
  const byId = new Map<string, ProjectLike>();
  for (const project of projects || []) {
    if (project?.id) byId.set(project.id, project);
  }
  if (activeProject?.id) byId.set(activeProject.id, activeProject);
  return [...byId.values()].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );
}

export function downloadTextFile({
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

export async function readDataExchangeFile(file: File | null | undefined): Promise<string> {
  if (!file) return "";
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const xlsxModule = await import("xlsx");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const XLSX: any = (xlsxModule as any).default || xlsxModule;
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return "";
    return XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName], { blankrows: false });
  }
  return file.text();
}

export type ImportRecordLike = {
  rfi_number?: string | null;
  submittal_number?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

/**
 * Apply RFI number normalization + natural-key dedupe before bulk create.
 * Matches the previous inline mutation logic byte-for-byte on outputs.
 */
export function prepareImportRecords(opts: {
  targetKey: string;
  validRecords: ImportRecordLike[];
  existingRecords: ImportRecordLike[];
  importSourceName: string;
}): { recordsToCreate: ImportRecordLike[]; skippedDuplicates: number } {
  const { targetKey, validRecords, existingRecords, importSourceName } = opts;
  let skippedDuplicates = 0;
  const dedupField =
    targetKey === "rfis"
      ? "rfi_number"
      : targetKey === "submittals"
        ? "submittal_number"
        : null;
  const dedupKey = (value: unknown) =>
    targetKey === "rfis"
      ? rfiNumberDedupKey(value as string)
      : value == null
        ? ""
        : String(value).trim().toLowerCase();
  const existingKeys = dedupField
    ? new Set(
        existingRecords.map((record) => dedupKey(record[dedupField])).filter(Boolean),
      )
    : null;
  const stagedKeys = new Set<string>();

  const recordsToCreate = validRecords.flatMap((record) => {
    const nextRecord =
      targetKey === "rfis" && record.rfi_number
        ? { ...record, rfi_number: normalizeRfiNumber(record.rfi_number) }
        : record;
    if (dedupField) {
      const key = dedupKey(nextRecord[dedupField]);
      if (key) {
        if (existingKeys!.has(key) || stagedKeys.has(key)) {
          skippedDuplicates += 1;
          return [];
        }
        stagedKeys.add(key);
      }
    }
    const metadata = { ...(record.metadata || {}) };
    delete metadata.onboarding_import;
    return [
      {
        ...nextRecord,
        metadata: {
          ...metadata,
          data_exchange_import: true,
          import_source_name: importSourceName,
        },
      },
    ];
  });

  return { recordsToCreate, skippedDuplicates };
}
