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

/** Toggle chip chrome for SequenceFilter area/sequence pills. */
export function sequenceFilterChipStyle(
  active: boolean,
): Record<string, string | number> {
  return {
    padding: "4px 10px",
    borderRadius: 14,
    border: `1px solid ${active ? "var(--accent)" : "var(--divider)"}`,
    background: active ? "rgba(200,155,32,0.12)" : "transparent",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    fontWeight: 800,
    letterSpacing: "0.06em",
    cursor: "pointer",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
  };
}

