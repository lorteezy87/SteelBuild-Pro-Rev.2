/** Pure helpers for Unbilled Revenue report. */

import { latestCertifiedPerLineItem } from "@/pages/dashboard/projectMetrics";

export type UnbilledRow = {
  id: string | null | undefined;
  projectName: string;
  projectNumber: string;
  client: string;
  contractValue: number;
  billed: number;
  unbilledLineItems: number;
  unbilled: number;
};

export function buildUnbilledRows(input: {
  projects?: Array<{
    id?: string | null;
    name?: string | null;
    project_number?: string | null;
    general_contractor?: string | null;
    client?: string | null;
    original_contract_value?: number | string | null;
  }>;
  sov?: Array<{
    project_id?: string | null;
    line_item_number?: string | number | null;
    scheduled_value?: number | string | null;
    current_percent_complete?: number | string | null;
    is_deleted?: boolean | null;
    status?: string | null;
    submitted_date?: string | null;
    application_number?: number | string | null;
  }>;
}): UnbilledRow[] {
  const projects = input.projects || [];
  const sov = input.sov || [];
  const m: Record<string, Omit<UnbilledRow, "unbilled">> = {};

  for (const p of projects) {
    if (p.id == null) continue;
    m[String(p.id)] = {
      id: p.id,
      projectName: p.name || "Untitled",
      projectNumber: p.project_number || "",
      client: p.general_contractor || p.client || "",
      contractValue: Number(p.original_contract_value) || 0,
      billed: 0,
      unbilledLineItems: 0,
    };
  }

  for (const r of latestCertifiedPerLineItem(sov as any)) {
    const sv = Number(r.scheduled_value) || 0;
    const pct = Number(r.current_percent_complete) || 0;
    const key = r.project_id != null ? String(r.project_id) : "";
    if (key && m[key]) {
      m[key].billed += sv * (pct / 100);
    }
  }

  // Pending lines = line items with no submitted billing row at all.
  // Certified or Paid both count as "submitted somewhere down the workflow".
  const seenLineItems = new Set<string>();
  for (const r of sov) {
    if (r.is_deleted) continue;
    if (r.status !== "Certified" && r.status !== "Paid") continue;
    if (!r.submitted_date) continue;
    seenLineItems.add(`${r.project_id}|${r.line_item_number}`);
  }
  for (const r of sov) {
    if (r.is_deleted) continue;
    const key = r.project_id != null ? String(r.project_id) : "";
    if (!key || !m[key]) continue;
    const lineKey = `${r.project_id}|${r.line_item_number}`;
    if (seenLineItems.has(lineKey)) continue;
    seenLineItems.add(lineKey);
    m[key].unbilledLineItems += 1;
  }

  return Object.values(m).map((r) => ({
    ...r,
    unbilled: Math.max(0, r.contractValue - r.billed),
  }));
}

export function filterUnbilledRows(
  rows: UnbilledRow[],
  search = "",
): UnbilledRow[] {
  let out = (rows || []).filter((r) => r.unbilled > 0);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    out = out.filter(
      (r) =>
        r.projectName.toLowerCase().includes(q) ||
        r.projectNumber.toLowerCase().includes(q) ||
        r.client.toLowerCase().includes(q),
    );
  }
  return out;
}

export function sumUnbilled(rows: UnbilledRow[]): number {
  return (rows || []).reduce((s, r) => s + r.unbilled, 0);
}

export function sumContractValue(rows: UnbilledRow[]): number {
  return (rows || []).reduce((s, r) => s + r.contractValue, 0);
}
