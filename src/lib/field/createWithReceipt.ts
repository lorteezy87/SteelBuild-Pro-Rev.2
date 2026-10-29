import { isUniqueViolation } from "./offlineQueue";
import { cleanRecord } from "@/api/client/fieldMapping";

function canonical(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, nested: unknown) => {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)));
    }
    return nested;
  });
}

/** Recover a lost create response only from a matching, unchanged receipt. */
export async function createWithReceipt<T extends object>(
  draft: Record<string, unknown>,
  create: () => Promise<T>,
  findReceipt: () => Promise<T[]>,
): Promise<T> {
  try { return await create(); } catch (error) {
    if (!isUniqueViolation(error) || !draft.client_op_id || !draft.project_id) throw error;
    const receipts = await findReceipt();
    const matching = receipts.filter(receipt => {
      const record = receipt as Record<string, unknown>;
      return record.client_op_id === draft.client_op_id && record.project_id === draft.project_id && !record.is_deleted;
    });
    if (matching.length !== 1) throw error;
    const receipt = matching[0] as Record<string, unknown>;
    const unchanged = Object.entries(cleanRecord(draft)).every(([key, value]) =>
      ["id", "created_at", "updated_at"].includes(key) || canonical(receipt[key]) === canonical(value),
    );
    if (!unchanged) {
      throw new Error("An earlier save of this capture already exists. Your current draft differs. Keep these edits and open the saved record before applying them.");
    }
    return matching[0];
  }
}
