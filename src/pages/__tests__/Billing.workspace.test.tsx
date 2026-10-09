// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveOrgId } from '@/lib/activeOrg';

const mocks = vi.hoisted(() => ({
  orgId: 'org-a', role: 'owner', native: false,
  refetch: vi.fn(), checkout: vi.fn(), portal: vi.fn(), count: vi.fn(), members: vi.fn(), invites: vi.fn(), list: vi.fn(),
  success: vi.fn(), message: vi.fn(), error: vi.fn(),
}));
vi.mock('@/components/shared/OrgContext', () => ({ useOrg: () => ({
  currentOrg: { id: mocks.orgId, name: mocks.orgId, stripe_customer_id: 'cus_test' },
  currentRole: mocks.role, refetchOrgs: mocks.refetch,
}) }));
vi.mock('@/hooks/usePlan', () => ({ usePlan: () => ({ plan: { name: 'Free' }, planKey: 'free', status: null as string | null, isActive: false }) }));
vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => mocks.native }));
vi.mock('@/lib/billing/billingService', () => ({ startCheckout: mocks.checkout, openBillingPortal: mocks.portal, getWorkspaceProjectCount: mocks.count, getWorkspaceMemberCount: mocks.members, getWorkspacePendingInvitationCount: mocks.invites }));
vi.mock('@/api/supabaseClient', () => ({ entities: { Project: { list: mocks.list } } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, message: mocks.message, error: mocks.error } }));
vi.mock('../billing/BillingControlCenter', () => ({ default: ({ projectCount, memberCount, pendingCount, children }: { projectCount: number | null; memberCount: number | null; pendingCount: number | null; children: React.ReactNode }) => <><output aria-label="Project count">{projectCount ?? 'unknown'}</output><output aria-label="Member count">{memberCount ?? 'unknown'}</output><output aria-label="Pending count">{pendingCount ?? 'unknown'}</output>{children}</> }));
import Billing from '../Billing';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['projects'], [{ id: 'foreign-project-1' }, { id: 'foreign-project-2' }]);
  const view = render(<QueryClientProvider client={client}><Billing /></QueryClientProvider>);
  return { ...view, client, refresh: () => view.rerender(<QueryClientProvider client={client}><Billing /></QueryClientProvider>) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.orgId = 'org-a'; mocks.role = 'owner'; mocks.native = false;
  mocks.count.mockResolvedValue(3); mocks.list.mockResolvedValue([]); mocks.refetch.mockResolvedValue({});
  mocks.members.mockResolvedValue(2); mocks.invites.mockResolvedValue(1);
  setActiveOrgId('org-a');
  window.history.replaceState({}, '', '/Billing');
});
afterEach(() => { cleanup(); setActiveOrgId(null); vi.useRealTimers(); });

describe('Billing workspace isolation', () => {
  it('keeps both member and invitation usage unknown while loading', () => {
    mocks.members.mockReturnValue(new Promise(() => {})); mocks.invites.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByLabelText('Member count')).toHaveTextContent('unknown');
    expect(screen.getByLabelText('Pending count')).toHaveTextContent('unknown');
  });

  it.each(['members', 'invites'] as const)('keeps failed %s usage unknown instead of zero', async (kind) => {
    mocks[kind].mockRejectedValue(new Error('usage unavailable')); mount();
    await waitFor(() => expect(screen.getByLabelText(kind === 'members' ? 'Pending count' : 'Member count')).toHaveTextContent(kind === 'members' ? '1' : '2'));
    expect(screen.getByLabelText(kind === 'members' ? 'Member count' : 'Pending count')).toHaveTextContent('unknown');
  });

  it('does not query admin-only invitations or reuse the owner invite count for a member', async () => {
    const view = mount(); await waitFor(() => expect(screen.getByLabelText('Pending count')).toHaveTextContent('1'));
    mocks.invites.mockClear(); mocks.role = 'member'; view.refresh();
    await waitFor(() => expect(screen.getByLabelText('Member count')).toHaveTextContent('2'));
    expect(screen.getByLabelText('Pending count')).toHaveTextContent('unknown');
    expect(mocks.invites).not.toHaveBeenCalled();
  });

  it('never announces an active subscription from a success query parameter', async () => {
    window.history.replaceState({}, '', '/Billing?status=success&keep=1#plan');
    mount();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.message).toHaveBeenCalledWith(expect.stringMatching(/confirmation/i));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.hash).toBe('#plan');
  });

  it('counts only the requested workspace and never consumes the shared project-list cache', async () => {
    const view = mount();
    await waitFor(() => expect(screen.getByLabelText('Project count')).toHaveTextContent('3'));
    expect(mocks.count).toHaveBeenCalledWith('org-a');
    expect(mocks.list).not.toHaveBeenCalled();
    expect(view.client.getQueryData(['billing-project-count', 'org-a', 'owner'])).toBe(3);
    mocks.count.mockResolvedValue(8);
    act(() => { mocks.orgId = 'org-b'; setActiveOrgId('org-b'); }); view.refresh();
    await waitFor(() => expect(screen.getByLabelText('Project count')).toHaveTextContent('8'));
    expect(mocks.count).toHaveBeenCalledWith('org-b');
    expect(view.client.getQueryData(['billing-project-count', 'org-a', 'owner'])).toBe(3);
  });

  it('shows unknown project usage when the count read fails', async () => {
    mocks.count.mockRejectedValue(new Error('unavailable'));
    mount();
    await waitFor(() => expect(mocks.count).toHaveBeenCalled());
    expect(screen.getByLabelText('Project count')).toHaveTextContent('unknown');
  });

  it.each(['checkout', 'portal'] as const)('silences an obsolete %s failure after A to B to A', async (kind) => {
    const pending = deferred<string>(); mocks[kind].mockReturnValueOnce(pending.promise);
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: kind === 'checkout' ? 'Choose Pro' : /Manage billing/ }));
    act(() => { setActiveOrgId('org-b'); setActiveOrgId('org-a'); });
    view.refresh();
    await act(async () => pending.reject(new Error('old workspace error')));
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('an old failure cannot clear the new workspace operation busy state', async () => {
    const old = deferred<string>(); const current = deferred<string>();
    mocks.checkout.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro' }));
    act(() => { mocks.orgId = 'org-b'; setActiveOrgId('org-b'); }); view.refresh();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Business' }));
    await act(async () => old.reject(new Error('old error')));
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled();
    expect(mocks.error).not.toHaveBeenCalled();
    await act(async () => current.reject(new Error('current error')));
    expect(mocks.error).toHaveBeenCalledWith('current error');
  });

  it('disables every billing action while one request is in flight', () => {
    mocks.checkout.mockReturnValueOnce(new Promise(() => {})); mount();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro' }));
    expect(screen.getByRole('button', { name: 'Choose Business' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Manage billing/ })).toBeDisabled();
  });

  it('does not report a billing failure after the page unmounts', async () => {
    const pending = deferred<string>(); mocks.portal.mockReturnValueOnce(pending.promise);
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: /Manage billing/ }));
    view.unmount(); await act(async () => pending.reject(new Error('late failure')));
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
