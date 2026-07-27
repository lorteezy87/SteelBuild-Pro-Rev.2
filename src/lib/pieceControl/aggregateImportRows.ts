import type { ImportPayload } from "./reconciliation";
import { normalizePieceMark } from "./identity";

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[, ]+/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Collapse instance-level import rows (PowerFab assemblies, IFC parts) into one
 * register row per exact piece mark. Never invents marks; skips blank marks.
 */
export function aggregatePieceRowsByMark(rows: ImportPayload[]): ImportPayload[] {
  const byMark = new Map<string, ImportPayload>();

  for (const row of rows) {
    const mark = String(
      row.piece_mark ?? row.assembly_mark ?? row.mark ?? "",
    ).trim();
    const normalized = normalizePieceMark(mark);
    if (!normalized) continue;

    const quantity = asNumber(row.quantity) ?? 1;
    const weightEach = asNumber(row.weight_each_lbs ?? row.unit_weight_lbs);
    const weightTotal =
      asNumber(row.weight_total_lbs ?? row.total_weight_lbs) ??
      (asNumber(row.weight_kg) != null
        ? (asNumber(row.weight_kg) as number) * 2.2046226218
        : null);
    const existing = byMark.get(normalized);

    if (!existing) {
      byMark.set(normalized, {
        ...row,
        piece_mark: mark,
        quantity,
        ...(weightEach != null ? { weight_each_lbs: weightEach } : {}),
        ...(weightTotal != null ? { weight_total_lbs: weightTotal } : {}),
        external_ref:
          row.external_ref ?? row.element_guid ?? row.ModelRef ?? null,
      });
      continue;
    }

    const nextQuantity = (asNumber(existing.quantity) ?? 0) + quantity;
    const existingTotal = asNumber(existing.weight_total_lbs);
    const nextTotal =
      existingTotal != null || weightTotal != null
        ? (existingTotal ?? 0) + (weightTotal ?? 0)
        : null;

    byMark.set(normalized, {
      ...existing,
      quantity: nextQuantity,
      ...(nextTotal != null ? { weight_total_lbs: nextTotal } : {}),
      profile: existing.profile ?? row.profile ?? null,
      material_grade: existing.material_grade ?? row.material_grade ?? row.grade ?? null,
      sequence_number: existing.sequence_number ?? row.sequence_number ?? null,
      erection_area: existing.erection_area ?? row.erection_area ?? null,
      external_ref: existing.external_ref ?? row.external_ref ?? row.element_guid ?? null,
    });
  }

  return Array.from(byMark.values());
}
