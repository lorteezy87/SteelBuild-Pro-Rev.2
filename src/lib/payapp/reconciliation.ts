/** 2026's certificate/SOV reconciliation, adapted to Rev 2's cent-based ledger.
 * Live changes are separate from errors within a historical certificate. This
 * diagnostic never rewrites an issued application or adopts donor billing math.
 */
import { addMoney, formatMoney, moneyEquals, sumMoney } from '@/lib/money';
import { computeG702, lineRetainage } from '@/lib/payapp/g702';
import type { PayApplication, PayApplicationLine } from '@/lib/payapp/types';

export interface ReconciliationSovItem {
  id: string;
  scheduled_value: number | string | null;
  is_deleted?: boolean | null;
}
export interface LiveContractEvidence {
  sovItems: readonly ReconciliationSovItem[];
  originalContractSum: number | null | undefined;
  netChangeOrders: number;
}
const known = (value: unknown): boolean => value != null && value !== '' && Number.isFinite(Number(value));

export function reconcilePayApplication(app: PayApplication, lines: readonly PayApplicationLine[], live: LiveContractEvidence | null) {
  const certificateProblems: string[] = [];
  const compare = (problems: string[], label: string, stored: unknown, expected: number) => {
    if (!known(stored)) problems.push(`${label} is unavailable.`);
    else if (!moneyEquals(Number(stored), expected)) problems.push(`${label}: ${formatMoney(Number(stored))}; expected ${formatMoney(expected)}.`);
  };
  for (const key of ['original_contract_sum', 'net_change_orders', 'less_previous_certificates', 'retainage_percent'] as const) {
    if (!known(app[key])) certificateProblems.push(`${key.replaceAll('_', ' ')} is unavailable.`);
  }
  if (!lines.length) certificateProblems.push('No G703 lines are available for this certificate.');
  const linked = new Set<string>();
  lines.forEach((line, index) => {
    const label = `Line ${line.line_item_number || index + 1}`;
    for (const key of ['scheduled_value', 'work_completed_previous', 'work_completed_this_period', 'materials_stored', 'retainage'] as const) {
      if (!known(line[key])) certificateProblems.push(`${label}: ${key.replaceAll('_', ' ')} is unavailable.`);
    }
    compare(certificateProblems, `${label} retainage`, line.retainage, lineRetainage(line, Number(app.retainage_percent)));
    if (line.sov_item_id && linked.has(line.sov_item_id)) certificateProblems.push(`${label}: SOV item is billed more than once.`);
    if (line.sov_item_id) linked.add(line.sov_item_id);
  });
  const recomputed = computeG702({
    contract: { originalContractSum: Number(app.original_contract_sum), netChangeOrders: Number(app.net_change_orders), retainagePercent: Number(app.retainage_percent) },
    lines: [...lines], lessPreviousCertificates: Number(app.less_previous_certificates),
  });
  compare(certificateProblems, 'Scheduled values', sumMoney(lines.map(l => l.scheduled_value)), recomputed.contractSumToDate);
  compare(certificateProblems, 'Completed and stored total', app.total_completed_stored, recomputed.totalCompletedStored);
  compare(certificateProblems, 'Retainage total', app.total_retainage, recomputed.totalRetainage);
  compare(certificateProblems, 'Payment due', app.current_payment_due, recomputed.currentPaymentDue);

  // null explicitly means not checked; a query error/disabled query is not an empty SOV.
  const liveProblems: string[] | null = live ? [] : null;
  if (live && liveProblems) {
    const sov = live.sovItems.filter(s => !s.is_deleted);
    if (!known(live.originalContractSum)) liveProblems.push('Current original contract sum is unavailable.');
    else compare(liveProblems, 'Original contract sum', app.original_contract_sum, Number(live.originalContractSum));
    if (!known(live.netChangeOrders)) liveProblems.push('Approved change order amounts are unavailable.');
    else compare(liveProblems, 'Approved change orders', app.net_change_orders, live.netChangeOrders);
    if (sov.some(s => !known(s.scheduled_value))) liveProblems.push('A current SOV scheduled value is unavailable.');
    else if (known(live.originalContractSum) && known(live.netChangeOrders)) compare(liveProblems, 'Current SOV total', sumMoney(sov.map(s => s.scheduled_value)), addMoney(live.originalContractSum, live.netChangeOrders));
    const byId = new Map(sov.map(s => [s.id, s]));
    lines.forEach((line, index) => {
      const label = `Line ${line.line_item_number || index + 1}`;
      const source = line.sov_item_id ? byId.get(line.sov_item_id) : undefined;
      if (!source) liveProblems.push(`${label}: ${line.sov_item_id ? 'linked item no longer exists on the current SOV' : 'no SOV link; current allocation cannot be verified'}.`);
      else if (known(source.scheduled_value)) compare(liveProblems, `${label} scheduled value`, line.scheduled_value, Number(source.scheduled_value));
    });
    for (const source of sov) {
      if (!linked.has(source.id)) liveProblems.push('A current SOV item is missing from this certificate.');
    }
  }
  return { certificateProblems, liveProblems, recomputed };
}
export type PayApplicationReconciliation = ReturnType<typeof reconcilePayApplication>;
