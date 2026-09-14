/**
 * Seed / bulk-create helpers for Onboarding.
 * Entity clients are injected so tests can stub without React.
 */
import { SEED_ENTITY_MAP } from "@/lib/onboardingTemplates";
import { readFileText } from "@/lib/textDecoding";

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

export type EntityClient = {
  bulkCreate: (records: SeedRecord[]) => Promise<SeedRecord[]>;
  create: (record: SeedRecord) => Promise<SeedRecord>;
};

export async function bulkCreateWithFallback(
  entity: EntityClient | null | undefined,
  records: SeedRecord[],
): Promise<SeedRecord[]> {
  if (!records.length) return [];
  if (!entity) {
    console.warn("[onboarding] entity client unavailable; seed rows skipped");
    return [];
  }

  try {
    return await entity.bulkCreate(records);
  } catch (err) {
    console.warn("[onboarding] bulkCreate failed, falling back to row creates", err);
    const created: SeedRecord[] = [];
    for (const record of records) {
      try {
        created.push(await entity.create(record));
      } catch (rowErr: unknown) {
        // Skip a failing row (e.g. a duplicate unique key) instead of aborting
        // the seed and leaving an unhandled rejection.
        const detail = rowErr instanceof Error ? rowErr.message : String(rowErr);
        console.warn("[onboarding] seed row skipped:", detail);
      }
    }
    return created;
  }
}

export async function createSeedRecords(
  seedPayloads: Partial<Record<SeedPayloadKey, SeedRecord[]>>,
  entities: Record<string, EntityClient | undefined>,
  seedOrder: readonly SeedPayloadKey[] = SEED_ORDER,
): Promise<Partial<Record<SeedPayloadKey, SeedRecord[]>>> {
  const createdByKey: Partial<Record<SeedPayloadKey, SeedRecord[]>> = {};

  for (const payloadKey of seedOrder) {
    const entityKey = SEED_ENTITY_MAP[payloadKey];
    const entity = entities[entityKey];
    let records = seedPayloads[payloadKey] ?? [];
    if (!entity || records.length === 0) {
      createdByKey[payloadKey] = [];
      continue;
    }

    const createdDrawingSets = createdByKey.drawingSets ?? [];
    if (payloadKey === "drawings" && createdDrawingSets.length > 0) {
      const setIdByName = new Map<string, string>();
      for (const set of createdDrawingSets) {
        const setName = typeof set.set_name === "string" ? set.set_name : "";
        if (setName && set.id != null) setIdByName.set(setName, String(set.id));
      }

      records = records.map((record) => {
        const drawingSetName =
          typeof record.drawing_set_name === "string" ? record.drawing_set_name : "";
        return {
          ...record,
          drawing_set_id:
            setIdByName.get(drawingSetName) ?? record.drawing_set_id ?? null,
        };
      });
    }

    createdByKey[payloadKey] = await bulkCreateWithFallback(entity, records);
  }

  return createdByKey;
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
