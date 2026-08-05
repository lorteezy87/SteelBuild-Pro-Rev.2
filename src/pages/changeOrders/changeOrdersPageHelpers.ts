import { downloadTextFile } from "@/lib/exports/fabRelease";
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

/** @deprecated Prefer shared selectionHelpers. */
export {
  toggleSelectionId as nextSelectedToggle,
  selectAllOrNone,
} from "@/pages/shared/selectionHelpers";

export const CHANGE_ORDERS_CSV_HEADERS = [
  "CO #",
  "Title",
  "Status",
  "Reason Code",
  "Amount",
  "Sched Impact (d)",
  "Submitted",
  "Approved",
  "Approved By",
] as const;

export type ChangeOrderCsvLike = {
  co_number?: string | number | null;
  title?: string | null;
  status?: string | null;
  reason_code?: string | null;
  co_amount?: string | number | null;
  schedule_impact_days?: string | number | null;
  submitted_date?: string | null;
  approved_date?: string | null;
  approved_by?: string | null;
};

export function buildChangeOrdersCsvRows(rows: ChangeOrderCsvLike[]): string[][] {
  return (rows || []).map((c) => [
    String(c.co_number || ""),
    c.title || "",
    c.status || "",
    c.reason_code || "",
    String(c.co_amount ?? ""),
    String(c.schedule_impact_days ?? ""),
    c.submitted_date || "",
    c.approved_date || "",
    c.approved_by || "",
  ]);
}

export function buildChangeOrdersCsvString(rows: ChangeOrderCsvLike[]): string {
  const header = CHANGE_ORDERS_CSV_HEADERS.join(",");
  const body = buildChangeOrdersCsvRows(rows).map((cols) =>
    [
      cols[0],
      `"${String(cols[1]).replace(/"/g, '""')}"`,
      cols[2],
      cols[3],
      cols[4],
      cols[5],
      cols[6],
      cols[7],
      `"${String(cols[8]).replace(/"/g, '""')}"`,
    ].join(","),
  );
  return [header, ...body].join("\n");
}

export function changeOrdersCsvFilename(projectName: string): string {
  return `change-orders-${(projectName || "project").replace(/\s+/g, "-")}.csv`;
}

/** Side-effect CSV download for Change Orders register. */
export function downloadChangeOrdersCsv(
  rows: Parameters<typeof buildChangeOrdersCsvString>[0],
  projectName = "",
  filename?: string,
): void {
  downloadTextFile(
    buildChangeOrdersCsvString(rows),
    filename || changeOrdersCsvFilename(projectName),
    "text/csv;charset=utf-8",
  );
}

