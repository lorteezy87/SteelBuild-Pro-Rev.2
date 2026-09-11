// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PayAppReconciliationPanel from '../PayAppReconciliationPanel';
import { reconcilePayApplication } from '@/lib/payapp/reconciliation';
afterEach(cleanup);
it('does not claim agreement while lines are loading; retry is usable after a failure', () => {
  const retry = vi.fn();
  const { rerender } = render(<PayAppReconciliationPanel result={null} linesError={false} liveState="loading" historical={false} onRefresh={retry} busy />);
  expect(screen.getByText(/Checking certificate/)).toBeTruthy();
  expect(screen.queryByText(/Certificate totals agree/)).toBeNull();
  rerender(<PayAppReconciliationPanel result={null} linesError liveState="error" historical={false} onRefresh={retry} busy={false} />);
  expect(screen.getByText(/Could not load certificate lines/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh checks' }));
  expect(retry).toHaveBeenCalledOnce();
});
it('distinguishes certificate discrepancies from a historical comparison', () => {
  const result = reconcilePayApplication({ id: 'a', project_id: 'p', application_number: 1, status: 'paid', original_contract_sum: 100, net_change_orders: 0, retainage_percent: 0, total_completed_stored: 0, total_retainage: 0, current_payment_due: 0, less_previous_certificates: 0 }, [], { sovItems: [], originalContractSum: 200, netChangeOrders: 0 });
  render(<PayAppReconciliationPanel result={result} linesError={false} liveState="ready" historical onRefresh={() => {}} busy={false} />);
  expect(screen.getByText('Certificate needs review')).toBeTruthy();
  expect(screen.getByText(/Later SOV or contract changes do not invalidate/)).toBeTruthy();
  expect(screen.getByText(/No G703 lines/)).toBeTruthy();
});
