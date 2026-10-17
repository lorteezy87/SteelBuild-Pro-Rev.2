// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveOrgId } from '@/lib/activeOrg';
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/billing/billingService', () => ({ getCheckoutStatus: mocks.read }));
import { CheckoutConfirmation } from '../CheckoutConfirmation';
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); setActiveOrgId('org-a');
  window.history.replaceState({}, '', '/Billing?session_id=cs_test_example123&checkout_org=org-a');
});
afterEach(() => { cleanup(); vi.useRealTimers(); setActiveOrgId(null); });
describe('customer checkout confirmation messages', () => {
  it('exposes a live status and a read-only retry after a delayed webhook', async () => {
    mocks.read.mockResolvedValue({ state: 'pending' });
    const refresh = vi.fn().mockResolvedValue({});
    render(<CheckoutConfirmation orgId="org-a" canManage native={false} refetchOrgs={refresh} />);
    expect(screen.getByRole('status')).toHaveTextContent('Confirming your subscription');
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(screen.getByRole('status')).toHaveTextContent('do not start another checkout');
    mocks.read.mockResolvedValue({ state: 'confirmed', plan: 'pro' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check again' })); });
    expect(screen.getByRole('status')).toHaveTextContent('Your subscription is confirmed');
    expect(screen.queryByRole('button')).toBeNull(); expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('provides recovery after a lookup error without making a payment claim', async () => {
    mocks.read.mockRejectedValue(new Error('provider unavailable'));
    render(<CheckoutConfirmation orgId="org-a" canManage native={false} refetchOrgs={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('could not verify this checkout');
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  });
});
