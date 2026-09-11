import { describe, expect, it } from 'vitest';
import { reconcilePayApplication } from '../reconciliation';
import type { PayApplication, PayApplicationLine } from '../types';

const app: PayApplication = { id: 'app', project_id: 'project', application_number: 1, status: 'draft', original_contract_sum: 1000, net_change_orders: 0, retainage_percent: 10, less_previous_certificates: 90, total_completed_stored: 500, total_retainage: 50, current_payment_due: 360 };
const line: PayApplicationLine = { id: 'line', sov_item_id: 'sov', line_item_number: '1', scheduled_value: 1000, work_completed_previous: 100, work_completed_this_period: 350, materials_stored: 50, percent_complete: 45, retainage: 50 };
const live = { sovItems: [{ id: 'sov', scheduled_value: 1000 }], originalContractSum: 1000, netChangeOrders: 0 };
const check = (a = app, lines = [line], context = live) => reconcilePayApplication(a, lines, context);

describe('pay application reconciliation harvested from 2026', () => {
  it('accepts a certificate reconciled to the cent and keeps balance including retainage', () => {
    expect(check()).toMatchObject({ certificateProblems: [], liveProblems: [], recomputed: { currentPaymentDue: 360, balanceToFinish: 550 } });
  });
  it('detects one-cent header drift instead of the donor fifty-cent tolerance', () => {
    expect(check({ ...app, current_payment_due: 360.01 }).certificateProblems.join(' ')).toContain('Payment due');
  });
  it('checks line retainage even when its incorrect header agrees with the lines', () => {
    expect(check({ ...app, total_retainage: 49, current_payment_due: 361 }, [{ ...line, retainage: 49 }]).certificateProblems.join(' ')).toContain('retainage');
  });
  it('does not treat missing or nonfinite monetary evidence as zero', () => {
    expect(check({ ...app, net_change_orders: null }).certificateProblems.join(' ')).toContain('unavailable');
    expect(check(app, [{ ...line, materials_stored: NaN }]).certificateProblems.join(' ')).toContain('unavailable');
  });
  it('reports an empty certificate and a scheduled total differing from its contract', () => {
    expect(check(app, []).certificateProblems.join(' ')).toContain('No G703 lines');
    expect(check(app, [{ ...line, scheduled_value: 999 }]).certificateProblems.join(' ')).toContain('Scheduled values');
  });
  it('keeps later live contract changes separate from a valid historical certificate', () => {
    const result = check({ ...app, status: 'paid' }, [line], { ...live, netChangeOrders: 100, sovItems: [{ id: 'sov', scheduled_value: 1100 }] });
    expect(result.certificateProblems).toEqual([]);
    expect(result.liveProblems?.join(' ')).toContain('Approved change orders');
    expect(result.liveProblems?.join(' ')).toContain('scheduled value');
  });
  it('finds equal-total line reallocations, deleted SOV links and duplicate links', () => {
    const split = [{ ...line, scheduled_value: 500 }, { ...line, id: 'other', sov_item_id: 'other', scheduled_value: 500 }];
    expect(check(app, split, { ...live, sovItems: [{ id: 'sov', scheduled_value: 400 }, { id: 'other', scheduled_value: 600 }] }).liveProblems).toHaveLength(2);
    expect(check(app, [line], { ...live, sovItems: [] }).liveProblems?.join(' ')).toContain('no longer');
    expect(check(app, [line, { ...line, id: 'duplicate' }]).certificateProblems.join(' ')).toContain('more than once');
  });
  it('does not certify agreement when an approved change order amount is missing', () => {
    expect(check(app, [line], { ...live, netChangeOrders: NaN }).liveProblems?.join(' ')).toContain('Approved change order amounts are unavailable');
  });
  it('checks certificate math when current contract evidence is unavailable', () => {
    const result = reconcilePayApplication(app, [line], null);
    expect(result.certificateProblems).toEqual([]);
    expect(result.liveProblems).toBeNull();
  });
  it('does not impose the donor SOV progress authority on Rev 2 manual billing', () => {
    expect(check().certificateProblems).toEqual([]); // Work plus separately stored materials is valid.
  });
});
