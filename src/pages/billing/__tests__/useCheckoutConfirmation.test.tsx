// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveOrgId } from '@/lib/activeOrg';
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/billing/billingService', () => ({ getCheckoutStatus: mocks.read }));
import { useCheckoutConfirmation } from '../useCheckoutConfirmation';

beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); setActiveOrgId('org-a');
  window.history.replaceState({}, '', '/Billing?status=success&session_id=cs_test_example123&checkout_org=org-a');
});
afterEach(() => { cleanup(); vi.useRealTimers(); setActiveOrgId(null); });
function mount() {
  const refresh = vi.fn().mockResolvedValue({});
  const props = { orgId: 'org-a', canManage: true, native: false, refetchOrgs: refresh };
  return { ...renderHook(options => useCheckoutConfirmation(options), { initialProps: props }), props, refresh };
}
describe('bounded checkout confirmation', () => {
  it('waits through delayed webhooks before confirming and refreshing the workspace', async () => {
    mocks.read.mockResolvedValueOnce({ state: 'pending' }).mockResolvedValue({ state: 'confirmed', plan: 'pro' });
    const view = mount();
    await act(async () => {});
    expect(view.result.current.state).toBe('checking');
    expect(view.refresh).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(view.result.current.state).toBe('confirmed');
    expect(view.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.read).toHaveBeenCalledWith('org-a', 'cs_test_example123');
    expect(window.location.search).toBe('');
  });
  it('bounds a hung request, permits read-only retry, and ignores the late reply', async () => {
    let resolve!: (value: { state: string; plan: string }) => void;
    mocks.read.mockReturnValueOnce(new Promise(yes => { resolve = yes; })).mockResolvedValue({ state: 'confirmed', plan: 'pro' });
    const view = mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(view.result.current.state).toBe('pending');
    await act(async () => { resolve({ state: 'confirmed', plan: 'pro' }); });
    expect(view.result.current.state).toBe('pending'); expect(view.refresh).not.toHaveBeenCalled();
    await act(async () => { view.result.current.retry(); });
    expect(view.result.current.state).toBe('confirmed');
  });
  it('never accepts a late reply across an A to B to A workspace visit', async () => {
    let resolve!: (value: { state: string; plan: string }) => void;
    mocks.read.mockReturnValue(new Promise(yes => { resolve = yes; }));
    const view = mount();
    act(() => { setActiveOrgId('org-b'); setActiveOrgId('org-a'); });
    await act(async () => { resolve({ state: 'confirmed', plan: 'pro' }); });
    expect(view.result.current.state).not.toBe('confirmed'); expect(view.refresh).not.toHaveBeenCalled();
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it('does not poll a different workspace, a member, or the native app', async () => {
    window.history.replaceState({}, '', '/Billing?session_id=cs_test_example123&checkout_org=org-b');
    const view = mount(); await act(async () => {});
    expect(view.result.current.state).toBe('wrong_workspace'); expect(mocks.read).not.toHaveBeenCalled();
    view.unmount();
    window.history.replaceState({}, '', '/Billing?session_id=cs_test_example123&checkout_org=org-a');
    for (const patch of [{ canManage: false }, { native: true }]) {
      const next = renderHook(() => useCheckoutConfirmation({ ...view.props, ...patch }));
      await act(async () => {}); expect(mocks.read).not.toHaveBeenCalled(); next.unmount();
    }
  });
  it('keeps lookup failures visible without claiming payment success', async () => {
    mocks.read.mockRejectedValue(new Error('Cannot verify billing'));
    const view = mount(); await act(async () => {});
    expect(view.result.current.state).toBe('error'); expect(view.refresh).not.toHaveBeenCalled();
  });
  it('does not claim the workspace refreshed when TanStack refetch resolves with an error result', async () => {
    mocks.read.mockResolvedValue({ state: 'confirmed', plan: 'pro' });
    const refresh = vi.fn().mockResolvedValue({ isError: true, error: new Error('membership read failed') });
    const view = renderHook(() => useCheckoutConfirmation({ orgId: 'org-a', canManage: true, native: false, refetchOrgs: refresh }));
    await act(async () => {});
    expect(view.result.current.state).toBe('error');
    expect(window.location.search).toContain('session_id');
  });
  it('does nothing for a success query without an exact session', async () => {
    window.history.replaceState({}, '', '/Billing?status=success');
    const view = mount(); await act(async () => {});
    expect(view.result.current.state).toBe('idle'); expect(mocks.read).not.toHaveBeenCalled();
  });
  it('stops repeated pending reads at the deadline without refreshing entitlements', async () => {
    mocks.read.mockResolvedValue({ state: 'pending' });
    const view = mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(40000); });
    expect(view.result.current.state).toBe('pending');
    expect(mocks.read).toHaveBeenCalledTimes(15); expect(view.refresh).not.toHaveBeenCalled();
  });
  it('stops polling an expired session and preserves unrelated URL parameters', async () => {
    window.history.replaceState({}, '', '/Billing?session_id=cs_test_example123&checkout_org=org-a&tab=usage#plans');
    mocks.read.mockResolvedValue({ state: 'expired' });
    const view = mount(); await act(async () => {});
    expect(view.result.current.state).toBe('expired');
    expect(window.location.search + window.location.hash).toBe('?tab=usage#plans');
    await act(async () => { await vi.advanceTimersByTimeAsync(40000); });
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it('ignores provider success after permission loss or unmount', async () => {
    let resolve!: (value: { state: string; plan: string }) => void;
    mocks.read.mockReturnValue(new Promise(yes => { resolve = yes; }));
    const view = mount(); view.rerender({ ...view.props, canManage: false });
    await act(async () => { resolve({ state: 'confirmed', plan: 'pro' }); });
    expect(view.result.current.state).toBe('idle'); expect(view.refresh).not.toHaveBeenCalled();
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(40000); });
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
});
