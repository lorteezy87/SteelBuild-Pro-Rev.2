// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveOrgId } from '@/lib/activeOrg';
const mocks = vi.hoisted(() => ({ checkout: vi.fn(), portal: vi.fn(), error: vi.fn(), message: vi.fn() }));
vi.mock('@/lib/billing/billingService', () => ({ startCheckout: mocks.checkout, openBillingPortal: mocks.portal }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, message: mocks.message } }));
import { useBillingActions } from '../useBillingActions';

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { resolve, reject, promise };
}
function mount() {
  const navigate = vi.fn(); const refetchOrgs = vi.fn().mockResolvedValue({});
  const props = { orgId: 'org-a' as string | null, canManage: true, native: false };
  const view = renderHook((scope) => useBillingActions({ ...scope, navigate, refetchOrgs }), { initialProps: props });
  return { ...view, navigate, refetchOrgs, props };
}
beforeEach(() => { vi.clearAllMocks(); setActiveOrgId('org-a'); window.history.replaceState({}, '', '/Billing'); });
afterEach(() => { cleanup(); setActiveOrgId(null); vi.useRealTimers(); });

describe('billing action generations', () => {
  it.each(['checkout', 'portal'] as const)('redirects a current authorized %s reply', async (kind) => {
    mocks[kind].mockResolvedValue('https://billing.stripe.com/test-session');
    const view = mount();
    await act(async () => { await (kind === 'checkout' ? view.result.current.upgrade('pro') : view.result.current.manage()); });
    expect(view.navigate).toHaveBeenCalledExactlyOnceWith('https://billing.stripe.com/test-session');
    expect(mocks[kind]).toHaveBeenCalledWith(...(kind === 'checkout' ? ['pro', 'org-a'] : ['org-a']));
  });

  it.each(['checkout', 'portal'] as const)('discards a successful %s URL across A to B to A, even before React renders B', async (kind) => {
    const pending = deferred(); mocks[kind].mockReturnValue(pending.promise); const view = mount();
    act(() => { void (kind === 'checkout' ? view.result.current.upgrade('pro') : view.result.current.manage()); });
    act(() => { setActiveOrgId('org-b'); setActiveOrgId('org-a'); });
    await act(async () => pending.resolve('https://billing.stripe.com/obsolete'));
    expect(view.navigate).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
    expect(view.result.current.busy).toBeNull();
  });

  it.each(['revoke', 'native', 'unmount', 'sign-out'] as const)('discards a payable URL after %s', async (change) => {
    const pending = deferred(); mocks.checkout.mockReturnValue(pending.promise); const view = mount();
    act(() => { void view.result.current.upgrade('pro'); });
    if (change === 'revoke') view.rerender({ ...view.props, canManage: false });
    if (change === 'native') view.rerender({ ...view.props, native: true });
    if (change === 'unmount') view.unmount();
    if (change === 'sign-out') act(() => { setActiveOrgId(null); });
    await act(async () => pending.resolve('https://checkout.stripe.com/obsolete'));
    expect(view.navigate).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
  });

  it('locks synchronously against rapid checkout and portal callbacks', async () => {
    const pending = deferred(); mocks.checkout.mockReturnValue(pending.promise); const view = mount();
    act(() => { void view.result.current.upgrade('pro'); void view.result.current.upgrade('business'); void view.result.current.manage(); });
    expect(mocks.checkout).toHaveBeenCalledTimes(1); expect(mocks.portal).not.toHaveBeenCalled();
    await act(async () => pending.reject(new Error('retry allowed')));
    expect(view.result.current.busy).toBeNull(); expect(mocks.error).toHaveBeenCalledWith('retry allowed');
  });

  it.each([{ canManage: false }, { native: true }, { orgId: null }])('cannot start billing with unavailable authority %j', async (restriction) => {
    const view = mount(); view.rerender({ ...view.props, ...restriction });
    await act(async () => { await view.result.current.upgrade('pro'); await view.result.current.manage(); });
    expect(mocks.checkout).not.toHaveBeenCalled(); expect(mocks.portal).not.toHaveBeenCalled();
  });

  it('handles an empty provider response without navigating', async () => {
    mocks.portal.mockResolvedValue(''); const view = mount();
    await act(async () => { await view.result.current.manage(); });
    expect(view.navigate).not.toHaveBeenCalled(); expect(mocks.error).toHaveBeenCalledWith('No portal URL returned');
    expect(view.result.current.busy).toBeNull();
  });

  it('cancels the delayed confirmation refresh when the workspace generation changes', async () => {
    vi.useFakeTimers(); window.history.replaceState({}, '', '/Billing?status=success');
    const view = mount(); expect(view.refetchOrgs).toHaveBeenCalledTimes(1);
    act(() => { setActiveOrgId('org-b'); setActiveOrgId('org-a'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(view.refetchOrgs).toHaveBeenCalledTimes(1);
  });
});
