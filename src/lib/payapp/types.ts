/**
 * Pay-application domain types (Phase 2 — G702/G703). Self-contained bounded
 * context with its own typed repository over public.pay_applications /
 * pay_application_lines (the per-period ledger over sov_items).
 */

export const PAY_APP_STATUSES = ["draft", "submitted", "approved", "paid", "void"] as const;
export type PayAppStatus = (typeof PAY_APP_STATUSES)[number];

export const PAY_APP_STATUS_LABELS: Record<PayAppStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  paid: "Paid",
  void: "Void",
};

/** A G702 application header. */
export interface PayApplication {
  id: string;
  created_at?: string;
  updated_at?: string;
  project_id: string;
  application_number: number;
  period_from?: string | null;
  period_to?: string | null;
  status: PayAppStatus;
  retainage_percent?: number | null;
  original_contract_sum?: number | null;
  net_change_orders?: number | null;
  total_completed_stored?: number | null;
  total_retainage?: number | null;
  less_previous_certificates?: number | null;
  current_payment_due?: number | null;
  submitted_date?: string | null;
  certified_date?: string | null;
  paid_date?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  created_by?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

/** A G703 continuation-sheet line (per SOV item per application). */
export interface PayApplicationLine {
  id?: string;
  created_at?: string;
  pay_application_id?: string;
  project_id?: string;
  sov_item_id?: string | null;
  line_item_number?: string | null;
  description?: string | null;
  scheduled_value: number;
  /** Column D — work completed in PRIOR applications (cumulative, excl. stored). */
  work_completed_previous: number;
  /** Column E — work completed THIS period. */
  work_completed_this_period: number;
  /** Column F — materials presently stored. */
  materials_stored: number;
  /** User-entered TOTAL % complete of the work (excl. stored). */
  percent_complete: number;
  /** Column I — retainage withheld on this line. */
  retainage: number;
  sort_order?: number;
  metadata?: Record<string, unknown> | null;
}

/** The contract context needed to compute the G702 (from the project + COs). */
export interface ContractContext {
  originalContractSum: number;
  /** Net of APPROVED change orders. */
  netChangeOrders: number;
  retainagePercent: number;
}
