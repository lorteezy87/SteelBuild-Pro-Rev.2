/**
 * Pure helpers for SOV page shell (filters + retainage resolution).
 */

export function resolveEffectiveRetainage(
  globalRetainage: string,
  customRetainage: string | number,
): number | null {
  if (globalRetainage === "per-row") return null;
  if (globalRetainage === "custom") return Number(customRetainage) || 0;
  return Number(globalRetainage);
}

export type SovLike = {
  application_number?: number | string | null;
  status?: string | null;
  line_item_number?: number | string | null;
  sov_id?: string | null;
  description?: string | null;
  phase?: string | null;
  cost_code?: string | null;
  [k: string]: unknown;
};

function sortSovLines(a: SovLike, b: SovLike): number {
  const aNum = Number(a.line_item_number);
  const bNum = Number(b.line_item_number);
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
  return String(a.sov_id || "").localeCompare(String(b.sov_id || ""), undefined, { numeric: true });
}

export function filterSovLines(
  sovs: SovLike[],
  opts: { appFilter: string; statusFilter: string },
): SovLike[] {
  return (sovs || [])
    .filter((s) => {
      const matchApp =
        opts.appFilter === "all" || String(s.application_number) === String(opts.appFilter);
      const matchStatus = opts.statusFilter === "all" || s.status === opts.statusFilter;
      return matchApp && matchStatus;
    })
    .sort(sortSovLines);
}

export function filterSovLinesForControlCenter(
  sovs: SovLike[],
  opts: { statusFilter: string; ccSearch: string },
): SovLike[] {
  const q = (opts.ccSearch || "").trim().toLowerCase();
  return (sovs || [])
    .filter((s) => {
      const matchStatus =
        opts.statusFilter === "all" ||
        opts.statusFilter === "All" ||
        s.status === opts.statusFilter;
      if (!matchStatus) return false;
      if (!q) return true;
      return (
        String(s.line_item_number || "").toLowerCase().includes(q) ||
        (s.sov_id || "").toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q) ||
        (s.phase || "").toLowerCase().includes(q) ||
        (s.cost_code || "").toLowerCase().includes(q)
      );
    })
    .sort(sortSovLines);
}

export const STATUS_CHIPS = ["All", "Draft", "Submitted", "Certified", "Paid"] as const;
