export type SovStagedRow = {
  valid?: boolean;
  autoMapped?: boolean;
  reason?: string;
  record: Record<string, unknown>;
};

export function summarizeSovStaged(staged: SovStagedRow[] | null | undefined) {
  const list = staged || [];
  const v = list.filter((s) => s.valid);
  return {
    valid: v.length,
    invalid: list.length - v.length,
    autoMapped: list.filter((s) => s.valid && s.autoMapped).length,
    validRecords: v.map((s) => s.record),
  };
}

export function formatSovCostLabel(r: {
  cost_code?: string | null;
  cost_code_name?: string | null;
}): string {
  return r.cost_code
    ? `${r.cost_code}${r.cost_code_name ? ` — ${r.cost_code_name}` : ""}`
    : "—";
}
