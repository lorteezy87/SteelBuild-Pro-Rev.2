/** Pure helpers for Revenue by Client / Type reports. */

import { latestCertifiedPerLineItem } from "@/pages/dashboard/projectMetrics";

export type BilledByProjectMap = Record<string, number>;

export type RevenueByClientRow = {
  client: string;
  projectCount: number;
  contractValue: number;
  billed: number;
};

export type RevenueByTypeRow = {
  type: string;
  projectCount: number;
  contractValue: number;
  billed: number;
};

/** Per-project billed total from latest certified SOV lines. */
export function billedByProjectMap(
  sov: Array<Record<string, any>> = [],
): BilledByProjectMap {
  const m: BilledByProjectMap = {};
  for (const r of latestCertifiedPerLineItem(sov)) {
    const sv = Number(r.scheduled_value) || 0;
    const pct = Number(r.current_percent_complete) || 0;
    if (!sv || pct <= 0) continue;
    const key = r.project_id != null ? String(r.project_id) : "";
    if (!key) continue;
    m[key] = (m[key] || 0) + sv * (pct / 100);
  }
  return m;
}

export function groupRevenueByClient(input: {
  projects?: Array<{
    id?: string | null;
    general_contractor?: string | null;
    client?: string | null;
    original_contract_value?: number | string | null;
  }>;
  billedByProject?: BilledByProjectMap;
}): RevenueByClientRow[] {
  const billedByProject = input.billedByProject || {};
  const m: Record<string, RevenueByClientRow> = {};
  for (const p of input.projects || []) {
    const client = p.general_contractor || p.client || "Unspecified";
    if (!m[client]) {
      m[client] = { client, projectCount: 0, contractValue: 0, billed: 0 };
    }
    m[client].projectCount += 1;
    m[client].contractValue += Number(p.original_contract_value) || 0;
    const pid = p.id != null ? String(p.id) : "";
    m[client].billed += (pid && billedByProject[pid]) || 0;
  }
  return Object.values(m).sort((a, b) => b.billed - a.billed);
}

export function groupRevenueByType(input: {
  projects?: Array<{
    id?: string | null;
    contract_type?: string | null;
    original_contract_value?: number | string | null;
  }>;
  billedByProject?: BilledByProjectMap;
}): RevenueByTypeRow[] {
  const billedByProject = input.billedByProject || {};
  const m: Record<string, RevenueByTypeRow> = {};
  for (const p of input.projects || []) {
    const type = p.contract_type || "Unspecified";
    if (!m[type]) {
      m[type] = { type, projectCount: 0, contractValue: 0, billed: 0 };
    }
    m[type].projectCount += 1;
    m[type].contractValue += Number(p.original_contract_value) || 0;
    const pid = p.id != null ? String(p.id) : "";
    m[type].billed += (pid && billedByProject[pid]) || 0;
  }
  return Object.values(m).sort((a, b) => b.billed - a.billed);
}

export function totalBilledFromGroups(
  groups: Array<{ billed: number }>,
): number {
  return (groups || []).reduce((s, r) => s + r.billed, 0);
}

export function maxBilledFromGroups(groups: Array<{ billed: number }>): number {
  return Math.max(...(groups || []).map((r) => r.billed), 1);
}

export function withSharePct<T extends { billed: number }>(
  groups: T[],
  totalBilled: number,
): Array<T & { sharePct: number }> {
  return (groups || []).map((r) => ({
    ...r,
    sharePct: totalBilled ? (r.billed / totalBilled) * 100 : 0,
  }));
}
