/**
 * Seed / bulk-create helpers for Onboarding.
 * Entity clients are injected so tests can stub without React.
 */
import { SEED_ENTITY_MAP } from "@/lib/onboardingTemplates";

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
] as const;

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
  bulkCreate: (records: unknown[]) => Promise<unknown[]>;
  create: (record: unknown) => Promise<unknown>;
};

export async function bulkCreateWithFallback(
  entity: EntityClient | null | undefined,
  records: unknown[],
): Promise<unknown[]> {
  if (!records.length) return [];
  try {
    return await entity!.bulkCreate(records);
  } catch (err) {
    console.warn("[onboarding] bulkCreate failed, falling back to row creates", err);
    const created: unknown[] = [];
    for (const record of records) {
      try {
        created.push(await entity!.create(record));
      } catch (rowErr: any) {
        // Skip a failing row (e.g. a duplicate unique key) instead of aborting
        // the seed and leaving an unhandled rejection.
        console.warn("[onboarding] seed row skipped:", rowErr?.message || rowErr);
      }
    }
    return created;
  }
}

export async function createSeedRecords(
  seedPayloads: Record<string, any[]>,
  entities: Record<string, EntityClient | undefined>,
  seedOrder: readonly string[] = SEED_ORDER,
): Promise<Record<string, unknown[]>> {
  const createdByKey: Record<string, unknown[]> = {};

  for (const payloadKey of seedOrder) {
    const entityKey = SEED_ENTITY_MAP[payloadKey];
    const entity = entities[entityKey];
    let records = seedPayloads[payloadKey] || [];
    if (!entity || records.length === 0) {
      createdByKey[payloadKey] = [];
      continue;
    }

    if (payloadKey === "drawings" && (createdByKey.drawingSets as any[])?.length) {
      const setIdByName = new Map(
        (createdByKey.drawingSets as any[]).map((set) => [set.set_name, set.id]),
      );
      records = records.map((record) => ({
        ...record,
        drawing_set_id: setIdByName.get(record.drawing_set_name) || record.drawing_set_id || null,
      }));
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
  return {
    text: await file.text(),
    sourceName: file.name,
  };
}
