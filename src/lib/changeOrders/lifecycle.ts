export const CHANGE_ORDER_STATUSES = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Void'] as const;
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number];
export type SovTreatment = 'new_line' | 'adjust_line' | 'none';

export function isChangeOrderDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Mirrors change_order_transition_allowed; the database remains authoritative. */
export function canMoveChangeOrder(from: string, to: string): boolean {
  if (!CHANGE_ORDER_STATUSES.includes(to as ChangeOrderStatus)) return false;
  if (from === to) return true;
  if (to === 'Void') return from !== 'Void';
  if (from === 'Draft') return ['Submitted', 'Approved'].includes(to);
  if (from === 'Submitted') return ['Under Review', 'Approved', 'Rejected'].includes(to);
  if (from === 'Under Review') return ['Approved', 'Rejected'].includes(to);
  if (from === 'Rejected') return ['Under Review', 'Submitted'].includes(to);
  return false;
}

export function changeOrderStatusOptions(current?: string | null): readonly string[] {
  return current ? CHANGE_ORDER_STATUSES.filter(status => canMoveChangeOrder(current, status)) : ['Draft', 'Submitted'];
}

export function validateChangeOrderDecision(current: string, patch: Record<string, unknown>): void {
  const target = String(patch.status ?? current);
  if (!canMoveChangeOrder(current, target)) throw new Error(`Change order cannot move from ${current} to ${target}.`);
  if (target === current) return;
  if (target === 'Void' || target === 'Rejected') {
    const reason = target === 'Void' ? patch.void_reason : patch.decision_notes;
    if (typeof reason !== 'string' || !reason.trim()) throw new Error(`${target} needs a written reason.`);
  }
  if (target === 'Approved') {
    if (typeof patch.approved_by !== 'string' || !patch.approved_by.trim()) throw new Error('Enter the person who approved this change order.');
    if (!['new_line', 'adjust_line', 'none'].includes(String(patch.sov_mode))) throw new Error('Choose an explicit SOV treatment before approval.');
    if (patch.sov_mode === 'adjust_line' && !patch.sov_line_item_id) throw new Error('Choose the existing SOV line to adjust.');
    if (patch.sov_mode === 'new_line' && Number(patch.co_amount) < 0) throw new Error('A deduct cannot create a new SOV line. Adjust an existing line or leave SOV unchanged.');
  }
}
