/** Pure helpers for Vendors page shell (register filters + spend stats). */

import { exportToCSV } from "@/lib/csv";
export type VendorLike = {
  id?: string;
  company_name?: string | null;
  contact_person?: string | null;
  vendor_type?: string | null;
  status?: string | null;
  phone?: string | null;
  email?: string | null;
  is_preferred?: boolean | null;
  [key: string]: unknown;
};

export type DeliveryLike = {
  vendor?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  actual_date?: string | null;
  [key: string]: unknown;
};

export type CoLike = {
  title?: string | null;
  description?: string | null;
  co_amount?: number | null;
  [key: string]: unknown;
};

export type ExpenseLike = {
  vendor?: string | null;
  amount?: number | null;
  [key: string]: unknown;
};

export type VendorStatBucket = {
  deliveryCount: number;
  onTimeCount: number;
  lateCount: number;
  deliveries: DeliveryLike[];
  coCount: number;
  coValue: number;
  totalSpend: number;
  onTimeRate: number | null;
};

function emptyBucket(): VendorStatBucket {
  return {
    deliveryCount: 0,
    onTimeCount: 0,
    lateCount: 0,
    deliveries: [],
    coCount: 0,
    coValue: 0,
    totalSpend: 0,
    onTimeRate: null,
  };
}

export function normalizeVendorName(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase();
}

export function buildPerVendorStats(
  vendors: VendorLike[],
  deliveries: DeliveryLike[],
  changeOrders: CoLike[],
  expenses: ExpenseLike[],
): Record<string, VendorStatBucket> {
  const stats: Record<string, VendorStatBucket> = {};
  const normalize = normalizeVendorName;

  for (const d of deliveries || []) {
    const key = normalize(d.vendor);
    if (!key) continue;
    if (!stats[key]) stats[key] = emptyBucket();
    stats[key].deliveryCount += 1;
    stats[key].deliveries.push(d);
    if (d.status === "Delivered") {
      const scheduled = d.scheduled_date ? new Date(d.scheduled_date) : null;
      const actual = d.actual_date ? new Date(d.actual_date) : null;
      if (scheduled && actual) {
        if (actual <= scheduled) stats[key].onTimeCount += 1;
        else stats[key].lateCount += 1;
      }
    }
  }

  for (const co of changeOrders || []) {
    for (const vendorName of Object.keys(stats)) {
      if (
        normalize(co.title).includes(vendorName) ||
        normalize(co.description).includes(vendorName)
      ) {
        stats[vendorName].coCount += 1;
        stats[vendorName].coValue += Number(co.co_amount) || 0;
      }
    }
  }

  for (const exp of expenses || []) {
    const key = normalize(exp.vendor);
    if (!key) continue;
    if (!stats[key]) stats[key] = emptyBucket();
    stats[key].totalSpend += Number(exp.amount) || 0;
  }

  for (const key of Object.keys(stats)) {
    const s = stats[key];
    const delivered = s.onTimeCount + s.lateCount;
    s.onTimeRate = delivered > 0 ? Math.round((s.onTimeCount / delivered) * 100) : null;
  }

  const result: Record<string, VendorStatBucket> = {};
  for (const v of vendors || []) {
    const key = normalize(v.company_name);
    if (stats[key]) result[v.company_name || ""] = stats[key];
  }
  return result;
}

export function filterVendors(
  vendors: VendorLike[],
  opts: { search: string; statusFilter: string; typeFilter: string },
): VendorLike[] {
  const q = (opts.search || "").toLowerCase();
  return (vendors || []).filter((v) => {
    const matchSearch =
      !q ||
      v.company_name?.toLowerCase().includes(q) ||
      v.contact_person?.toLowerCase().includes(q) ||
      v.vendor_type?.toLowerCase().includes(q);
    const matchStatus = opts.statusFilter === "all" || v.status === opts.statusFilter;
    const matchType = opts.typeFilter === "all" || v.vendor_type === opts.typeFilter;
    return matchSearch && matchStatus && matchType;
  });
}

export function uniqueVendorTypes(vendors: VendorLike[]): string[] {
  return [...new Set((vendors || []).map((v) => v.vendor_type).filter(Boolean) as string[])].sort();
}

export function buildVendorCsvRows(
  filtered: VendorLike[],
  vendorStats: Record<string, VendorStatBucket>,
): Array<Array<string | number>> {
  return (filtered || []).map((v) => {
    const stats = vendorStats[v.company_name || ""] || ({} as Partial<VendorStatBucket>);
    return [
      v.company_name ?? "",
      v.vendor_type ?? "",
      v.contact_person ?? "",
      v.phone ?? "",
      v.email ?? "",
      v.status ?? "",
      v.is_preferred ? "Yes" : "No",
      stats.deliveryCount || 0,
      stats.onTimeRate != null ? `${stats.onTimeRate}%` : "N/A",
      stats.coCount || 0,
      stats.totalSpend || 0,
    ];
  });
}

export const VENDOR_CSV_HEADERS = [
  "Company",
  "Type",
  "Contact",
  "Phone",
  "Email",
  "Status",
  "Preferred",
  "Deliveries",
  "On-Time %",
  "COs",
  "Spend",
] as const;

/** Side-effect CSV download for filtered vendor register. */
export function downloadVendorsCsv(
  filtered: VendorLike[],
  vendorStats: Record<string, VendorStatBucket>,
  filename = "vendors.csv",
): void {
  exportToCSV({
    filename,
    headers: [...VENDOR_CSV_HEADERS],
    rows: buildVendorCsvRows(filtered, vendorStats),
  });
}

