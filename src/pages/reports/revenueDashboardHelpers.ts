/** Pure helpers for Revenue Dashboard — billed splits and per-project export. */

import {
  cashCollected,
  pendingPayment,
  retentionHeld,
  totalBilled,
} from "@/pages/dashboard/projectMetrics";

export type BilledSegment = { label: string; value: number };
export type DecoratedSegment = BilledSegment & { color: string };

export type PerProjectRevenueRow = {
  number: string;
  name: string;
  client: string;
  contractType: string;
  billed: number;
  collected: number;
  pending: number;
  retention: number;
};

/** Billed value from SOV scheduled_value × percent complete. */
export function sovBilledValue(item: {
  scheduled_value?: number | string | null;
  current_percent_complete?: number | string | null;
}): number {
  return (
    ((Number(item.scheduled_value) || 0) *
      (Number(item.current_percent_complete) || 0)) /
    100
  );
}

/**
 * Group certified SOV billings by client (GC / client).
 * Collapses the long tail past `topN` into "Other".
 */
export function billedByClient(
  certifiedItems: Array<{ project_id?: string | null; scheduled_value?: number | string | null; current_percent_complete?: number | string | null }>,
  projectsById: Map<
    string,
    { general_contractor?: string | null; client?: string | null }
  >,
  topN = 6,
): BilledSegment[] {
  const map = new Map<string, number>();
  for (const i of certifiedItems || []) {
    const proj = i.project_id != null ? projectsById.get(String(i.project_id)) : undefined;
    const client = proj?.general_contractor || proj?.client || "Unknown";
    map.set(client, (map.get(client) || 0) + sovBilledValue(i));
  }
  const all = [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  if (all.length <= topN) return all;
  const top = all.slice(0, topN);
  const otherTotal = all.slice(topN).reduce((s, r) => s + r.value, 0);
  return [...top, { label: "Other", value: otherTotal }];
}

export function billedByContractType(
  certifiedItems: Array<{ project_id?: string | null; scheduled_value?: number | string | null; current_percent_complete?: number | string | null }>,
  projectsById: Map<string, { contract_type?: string | null }>,
): BilledSegment[] {
  const map = new Map<string, number>();
  for (const i of certifiedItems || []) {
    const proj = i.project_id != null ? projectsById.get(String(i.project_id)) : undefined;
    const type = proj?.contract_type || "Unspecified";
    map.set(type, (map.get(type) || 0) + sovBilledValue(i));
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function decoratePositiveSegments(
  segments: BilledSegment[],
  palette: readonly string[],
): DecoratedSegment[] {
  return (segments || [])
    .filter((s) => s.value > 0)
    .map((s, i) => ({ ...s, color: palette[i % palette.length] }));
}

export function collectedPercent(collected: number, billed: number): number {
  return billed ? (collected / billed) * 100 : 0;
}

export function buildPerProjectRevenueRows(input: {
  projects?: Array<{
    id?: string | null;
    project_number?: string | null;
    name?: string | null;
    general_contractor?: string | null;
    client?: string | null;
    contract_type?: string | null;
  }>;
  sovItems?: Array<Record<string, unknown>>;
}): PerProjectRevenueRow[] {
  const sovItems = input.sovItems || [];
  return (input.projects || []).map((p) => {
    const items = sovItems.filter((i) => i.project_id === p.id);
    const pending = pendingPayment(items);
    return {
      number: p.project_number || `P-${p.id}`,
      name: p.name || "",
      client: p.general_contractor || p.client || "",
      contractType: p.contract_type || "",
      billed: totalBilled(items),
      collected: cashCollected(items),
      pending: pending.total,
      retention: retentionHeld(items),
    };
  });
}
