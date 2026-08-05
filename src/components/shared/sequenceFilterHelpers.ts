/**
 * Pure tag builder for SequenceFilter (area + sequence chips).
 */

export type SequenceFilterItem = {
  area?: string | null;
  sequence_number?: string | number | null;
  area_sequence?: string | null;
  project_area?: string | null;
};

export type SequenceFilterTag = {
  type: "area" | "seq";
  value: string;
  label: string;
};

export function buildSequenceFilterTags(
  items: SequenceFilterItem[] | null | undefined,
): SequenceFilterTag[] {
  const areaSet = new Set<string>();
  const seqSet = new Set<string>();
  for (const item of items || []) {
    if (item.area) areaSet.add(String(item.area).trim());
    if (item.sequence_number) seqSet.add(String(item.sequence_number).trim());
    if (item.area_sequence) areaSet.add(String(item.area_sequence).trim());
    if (item.project_area) areaSet.add(String(item.project_area).trim());
  }
  const natural = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  const areas = [...areaSet].filter(Boolean).sort(natural).map((a) => ({ type: "area" as const, value: a, label: a }));
  const seqs = [...seqSet].filter(Boolean).sort(natural).map((s) => ({ type: "seq" as const, value: s, label: s }));
  return [...areas, ...seqs];
}
