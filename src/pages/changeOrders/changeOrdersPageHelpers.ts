/**
 * Pure helpers for ChangeOrders page shell (filter + source-RFI label).
 */
export type ChangeOrderLike = {
  id?: string;
  status?: string | null;
  co_number?: string | null;
  title?: string | null;
  description?: string | null;
  reason_code?: string | null;
  source_rfi_id?: string | null;
  [k: string]: unknown;
};

export type RfiLabelLike = {
  id?: string;
  rfi_number?: string | null;
};

/** Banner label for CO converted from RFI — never written back to the record. */
export function sourceRfiLabel(
  activeSourceRfiId: string | null | undefined,
  rfis: RfiLabelLike[],
): string {
  if (!activeSourceRfiId) return "";
  const r = (rfis || []).find((x) => x.id === activeSourceRfiId);
  return r?.rfi_number ? `RFI ${r.rfi_number}` : r ? "the source RFI" : "";
}

export function filterChangeOrders(
  cos: ChangeOrderLike[],
  filter: string,
  debouncedSearch: string,
): ChangeOrderLike[] {
  const q = (debouncedSearch || "").trim().toLowerCase();
  return (cos || []).filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    if (!q) return true;
    return (
      (c.co_number || "").toLowerCase().includes(q) ||
      (c.title || "").toLowerCase().includes(q) ||
      (c.description || "").toLowerCase().includes(q) ||
      (c.reason_code || "").toLowerCase().includes(q)
    );
  });
}

export function nextSelectedToggle(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectAllOrNone(checked: boolean, ids: string[]): Set<string> {
  return checked ? new Set(ids) : new Set();
}
