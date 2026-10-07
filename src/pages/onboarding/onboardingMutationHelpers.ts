/**
 * Seed / bulk-create helpers for Onboarding.
 * Entity clients are injected so tests can stub without React.
 */
import { buildSeedPayloads, SEED_ENTITY_MAP } from "@/lib/onboardingTemplates";
import { readFileText } from "@/lib/textDecoding";
import { getActiveOrgGeneration, subscribeActiveOrgChange } from "@/lib/activeOrg";
import {
  bulkCreateWithFallback as recoverBulkCreate,
  assertImportWorkspace,
  getSessionBulkCreateRecovery,
  type BulkCreateEntity,
  type BulkCreateRecovery,
  type BulkCreateResult,
} from "@/lib/bulkCreateRecovery";

export type SeedPayloadKey = keyof typeof SEED_ENTITY_MAP;
export type SeedRecord = Record<string, unknown>;

export const SEED_ORDER = [
  "workPackages",
  "scheduleTasks",
  "drawingSets",
  "drawings",
  "submittals",
  "rfis",
  "deliveries",
  "dailyLogs",
  "photos",
  "punchlist",
  "safetyIncidents",
  "inspections",
  "qualityControlRecords",
] as const satisfies readonly SeedPayloadKey[];

export const IMPORT_EXAMPLES: Record<string, string> = {
  rfis: "RFI #,Title,Question,Drawing Reference,Priority,Status\n001,Anchor bolt projection,Confirm projection at grid B/4,S1.02,High,Open",
  scheduleTasks: "Task Name,Phase,Start Date,End Date,Status,Assigned To\nDetail anchor bolt plan,Detailing,2026-06-01,2026-06-07,Not Started,Detailing Lead",
  workPackages: "WP Number,Name,Phase,Status,Tonnage,Crew\nWP-001,Anchor Bolts,Detailing,Not Started,18,Detailing",
  deliveries: "PO Number,Description,Scheduled Date,Required Date,Status,Pieces,Receiving Location\nPO-1001,Sequence 1 steel,2026-07-15,2026-07-17,Scheduled,86,North laydown yard",
  punchlist: "Description,Category,Location,Assigned To,Priority,Status\nTouch up primer at Column B4,Coating,Grid B/4,Field Crew,Medium,Open",
  contacts: "First Name,Last Name,Company,Role,Email,Phone\nJordan,Steel,Demo Steel,Project Manager,jordan@example.com,555-0100",
};

export const INVALID_IMPORT_TARGET = "rfis";
export const ROLE_OPTIONS = ["owner", "admin", "pm", "field", "viewer"] as const;

export type EntityClient = BulkCreateEntity;

export interface OnboardingSetupAttempt {
  project: SeedRecord;
  seedPayloads: Partial<Record<SeedPayloadKey, SeedRecord[]>>;
  recovery: BulkCreateRecovery;
}

let setupAttempts = new Map<string, Promise<OnboardingSetupAttempt>>();
subscribeActiveOrgChange(() => { setupAttempts = new Map(); });

/** Reopening the same reviewed setup must reuse its project, including an in-flight create. */
export function getOrCreateOnboardingSetup(
  projectPayload: SeedRecord,
  templateKey: string,
  createProject: EntityClient["create"],
): Promise<OnboardingSetupAttempt> {
  const generation = getActiveOrgGeneration();
  const cache = setupAttempts;
  const key = JSON.stringify([projectPayload, templateKey]);
  const previous = cache.get(key);
  if (previous) return previous;
  const payload = structuredClone(projectPayload);
  const attempt = Promise.resolve().then(async () => {
    assertImportWorkspace(generation);
    const project = await createProject(payload);
    assertImportWorkspace(generation);
    return { project, seedPayloads: buildSeedPayloads(project, templateKey), recovery: getSessionBulkCreateRecovery() };
  });
  cache.set(key, attempt);
  // A rejected project create is retained too: a lost reply must not mint a
  // second project on reopen. A definite SQL rejection can safely be corrected.
  void attempt.catch((error: unknown) => {
    const fields = error && typeof error === "object" ? error as Record<string, unknown> : {};
    if (typeof fields.code === "string" && (/^[0-9A-Z]{5}$/.test(fields.code) || /^PGRST/.test(fields.code))) cache.delete(key);
  });
  return attempt;
}

export async function bulkCreateWithFallback(
  entity: EntityClient | null | undefined,
  records: SeedRecord[],
  recovery?: BulkCreateRecovery,
): Promise<BulkCreateResult> {
  return recoverBulkCreate(entity, records, "onboarding", recovery);
}

export interface SeedCreateResult {
  createdByKey: Partial<Record<SeedPayloadKey, SeedRecord[]>>;
  skipped: number;
  unresolved: number;
  retryable: number;
}

export async function createSeedRecords(
  seedPayloads: Partial<Record<SeedPayloadKey, SeedRecord[]>>,
  entities: Record<string, EntityClient | undefined>,
  seedOrder: readonly SeedPayloadKey[] = SEED_ORDER,
  recovery: BulkCreateRecovery = getSessionBulkCreateRecovery(),
): Promise<SeedCreateResult> {
  const generation = getActiveOrgGeneration();
  const createdByKey: Partial<Record<SeedPayloadKey, SeedRecord[]>> = {};
  const summary: SeedCreateResult = { createdByKey, skipped: 0, unresolved: 0, retryable: 0 };

  for (const payloadKey of seedOrder) {
    assertImportWorkspace(generation);
    const entityKey = SEED_ENTITY_MAP[payloadKey];
    const entity = entities[entityKey];
    let records = seedPayloads[payloadKey] ?? [];
    if (records.length === 0) {
      createdByKey[payloadKey] = [];
      continue;
    }

    const createdDrawingSets = createdByKey.drawingSets ?? [];
    if (payloadKey === "drawings" && (seedPayloads.drawingSets?.length || createdDrawingSets.length)) {
      const setIdByName = new Map<string, string>();
      for (const set of createdDrawingSets) {
        const setName = typeof set.set_name === "string" ? set.set_name : "";
        if (setName && set.id != null) setIdByName.set(setName, String(set.id));
      }

      records = records.flatMap((record) => {
        const drawingSetName =
          typeof record.drawing_set_name === "string" ? record.drawing_set_name : "";
        const drawingSetId = setIdByName.get(drawingSetName) ?? record.drawing_set_id;
        if (drawingSetName && !drawingSetId) {
          // A later set retry must not change the payload of a drawing already created without it.
          summary.skipped += 1;
          return [];
        }
        return [{
          ...record,
          drawing_set_id:
            drawingSetId ?? null,
        }];
      });
    }

    const result = await bulkCreateWithFallback(entity, records, recovery);
    createdByKey[payloadKey] = result.created;
    summary.skipped += result.skipped;
    summary.unresolved += result.unresolved;
    summary.retryable += result.retryable;
  }
  assertImportWorkspace(generation);
  return summary;
}

/** Read CSV text from a pasted/uploaded onboarding import file. */
export async function readOnboardingImportFile(file: File): Promise<{ text: string; sourceName: string }> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSXmod = await import("xlsx");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const XLSX: any = (XLSXmod as any).default || XLSXmod;
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return {
      text: XLSX.utils.sheet_to_csv(worksheet, { blankrows: false }),
      sourceName: `${file.name} / ${sheetName}`,
    };
  }
  // Decode by byte-order mark / UTF-16 sniff and drop U+0000, which Postgres
  // rejects (22P05). Throws TextDecodingError for UTF-32 and misnamed binaries.
  return {
    text: (await readFileText(file)).text,
    sourceName: file.name,
  };
}
