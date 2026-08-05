/** Pure helpers for Warranty page shell. */

export type WarrantyLike = {
  warranty_type?: string | null;
  expiration_date?: string | null;
  is_active?: boolean | null;
  [key: string]: unknown;
};

export function startOfLocalDay(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysUntilExpiry(
  expirationDate: string | null | undefined,
  today: Date = startOfLocalDay(),
): number | null {
  if (!expirationDate) return null;
  const expDate = new Date(expirationDate);
  return Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function filterWarranties(
  warranties: WarrantyLike[],
  opts: { filterType: string; filterStatus: string },
  today: Date = startOfLocalDay(),
): WarrantyLike[] {
  return (warranties || []).filter((w) => {
    const typeMatch = opts.filterType === "all" || w.warranty_type === opts.filterType;
    let statusMatch = true;
    if (opts.filterStatus !== "all") {
      if (!w.expiration_date) return false;
      const days = daysUntilExpiry(w.expiration_date, today);
      if (days == null) return false;
      if (opts.filterStatus === "active") statusMatch = !!w.is_active && days > 0;
      if (opts.filterStatus === "expiring") statusMatch = !!w.is_active && days > 0 && days <= 90;
      if (opts.filterStatus === "expired") statusMatch = days <= 0;
    }
    return typeMatch && statusMatch;
  });
}

export function computeWarrantyStats(
  warranties: WarrantyLike[],
  today: Date = startOfLocalDay(),
): { total: number; active: number; expiring: number; expired: number } {
  const rows = warranties || [];
  return {
    total: rows.length,
    active: rows.filter((w) => {
      if (!w.expiration_date) return false;
      return !!w.is_active && new Date(w.expiration_date) > today;
    }).length,
    expiring: rows.filter((w) => {
      const days = daysUntilExpiry(w.expiration_date, today);
      return days != null && !!w.is_active && days > 0 && days <= 90;
    }).length,
    expired: rows.filter((w) => {
      if (!w.expiration_date) return false;
      return new Date(w.expiration_date) <= today;
    }).length,
  };
}
