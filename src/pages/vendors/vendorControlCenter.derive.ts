/**
 * Pure derivations for the Vendor Control Center (canonical presentation redesign).
 * No React, no network. All inputs are plain data arrays.
 */

import type { PillTone } from "@/components/command";

export interface VendorRecord {
  id?: string;
  company_name?: string | null;
  vendor_type?: string | null;
  status?: string | null;
  is_preferred?: boolean | null;
  contact_person?: string | null;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  insurance_expiry?: string | null;
  certifications_expiry?: string | null;
  payment_terms?: string | null;
  pricing_tier?: string | null;
  [key: string]: unknown;
}

/** Per-vendor derived performance stats (built in Vendors.jsx vendorStats useMemo). */
export interface VendorStat {
  deliveryCount?: number;
  onTimeCount?: number;
  lateCount?: number;
  deliveries?: unknown[];
  coCount?: number;
  coValue?: number;
  totalSpend?: number;
  onTimeRate?: number | null;
}

/** Keyed by lowercased company_name OR original company_name (Vendors.jsx maps back to original casing). */
export type VendorStatsMap = Record<string, VendorStat>;

export interface VendorSummary {
  total: number;
  active: number;
  preferred: number;
  atRisk: number;
  expiringSoon: number;
  avgOnTime: number | null;
  totalSpend: number;
  complianceQueue: VendorRecord[];
  watchlist: VendorRecord[];
  topSpenders: VendorRecord[];
}

/** Map a vendor status to a PillTone for the Command UI. */
export function vendorStatusTone(status?: string | null): PillTone {
  switch (status) {
    case "Active":    return "good";
    case "Probation": return "warn";
    case "Suspended": return "danger";
    case "Inactive":  return "neutral";
    default:          return "neutral";
  }
}

/**
 * Whole days from today (local midnight) until `dateStr`.
 * Negative = already expired. null = missing or unparseable.
 */
export function daysUntilExpiry(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

/** True when a date string is within 0..30 days from today (not yet expired AND ≤30 days out). */
function isExpiringSoon(dateStr?: string | null): boolean {
  const d = daysUntilExpiry(dateStr);
  return d !== null && d >= 0 && d <= 30;
}

/** True when a date string is strictly in the past (already expired). */
function isExpired(dateStr?: string | null): boolean {
  const d = daysUntilExpiry(dateStr);
  return d !== null && d < 0;
}

/** The earliest expiry (insurance vs cert) as a days-until value, for sorting compliance queue. */
function earliestExpiryDays(vendor: VendorRecord): number {
  const ins = daysUntilExpiry(vendor.insurance_expiry);
  const cert = daysUntilExpiry(vendor.certifications_expiry);
  if (ins === null && cert === null) return Infinity;
  if (ins === null) return cert!;
  if (cert === null) return ins;
  return Math.min(ins, cert);
}

/**
 * Compute all KPIs, queues, and summary lists for the Vendor Control Center.
 *
 * @param vendors   Raw vendor rows (from entities.Vendor.list).
 * @param vendorStats  Per-vendor performance map keyed by original company_name
 *                     (the same shape produced by Vendors.jsx vendorStats useMemo).
 */
export function buildVendorSummary(
  vendors: VendorRecord[],
  vendorStats: VendorStatsMap,
): VendorSummary {
  const total = vendors.length;
  const active = vendors.filter((v) => v.status === "Active").length;
  const preferred = vendors.filter((v) => v.is_preferred).length;

  // atRisk: status Probation/Suspended, OR expired insurance/cert, OR onTimeRate < 70
  const atRiskVendors = vendors.filter((v) => {
    if (v.status === "Probation" || v.status === "Suspended") return true;
    if (isExpired(v.insurance_expiry)) return true;
    if (isExpired(v.certifications_expiry)) return true;
    const stat = vendorStats[v.company_name ?? ""];
    if (stat?.onTimeRate != null && stat.onTimeRate < 70) return true;
    return false;
  });
  const atRisk = atRiskVendors.length;

  // expiringSoon: insurance OR cert expiry within 0..30 days (not yet expired)
  const expiringSoonVendors = vendors.filter(
    (v) => isExpiringSoon(v.insurance_expiry) || isExpiringSoon(v.certifications_expiry),
  );
  const expiringSoon = expiringSoonVendors.length;

  // avgOnTime: mean of non-null onTimeRate values across all vendor stats
  const onTimeRates = vendors
    .map((v) => vendorStats[v.company_name ?? ""]?.onTimeRate)
    .filter((r): r is number => r != null);
  const avgOnTime =
    onTimeRates.length > 0
      ? Math.round(onTimeRates.reduce((s, r) => s + r, 0) / onTimeRates.length)
      : null;

  // totalSpend: sum of all vendorStats spend values
  const totalSpend = Object.values(vendorStats).reduce(
    (s, stat) => s + (stat.totalSpend ?? 0),
    0,
  );

  // complianceQueue: vendors with expired OR expiring-soon insurance/cert,
  // sorted by earliest expiry ascending (most urgent first)
  const complianceQueue = vendors
    .filter(
      (v) =>
        isExpired(v.insurance_expiry) ||
        isExpiringSoon(v.insurance_expiry) ||
        isExpired(v.certifications_expiry) ||
        isExpiringSoon(v.certifications_expiry),
    )
    .sort((a, b) => earliestExpiryDays(a) - earliestExpiryDays(b));

  // watchlist: onTimeRate < 80 OR status Probation, sorted by onTimeRate asc (worst first)
  const watchlist = vendors
    .filter((v) => {
      if (v.status === "Probation") return true;
      const stat = vendorStats[v.company_name ?? ""];
      return stat?.onTimeRate != null && stat.onTimeRate < 80;
    })
    .sort((a, b) => {
      const aRate = vendorStats[a.company_name ?? ""]?.onTimeRate ?? -1;
      const bRate = vendorStats[b.company_name ?? ""]?.onTimeRate ?? -1;
      return aRate - bRate;
    });

  // topSpenders: top 5 by totalSpend descending
  const topSpenders = [...vendors]
    .filter((v) => (vendorStats[v.company_name ?? ""]?.totalSpend ?? 0) > 0)
    .sort(
      (a, b) =>
        (vendorStats[b.company_name ?? ""]?.totalSpend ?? 0) -
        (vendorStats[a.company_name ?? ""]?.totalSpend ?? 0),
    )
    .slice(0, 5);

  return {
    total,
    active,
    preferred,
    atRisk,
    expiringSoon,
    avgOnTime,
    totalSpend,
    complianceQueue,
    watchlist,
    topSpenders,
  };
}
