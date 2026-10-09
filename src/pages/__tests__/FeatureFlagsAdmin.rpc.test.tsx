// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn(), rpc: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ entities: { FeatureFlag: { list: mocks.list } } }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/components/shared/AdminRoute', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shared/LoadingSkeleton', () => ({ default: () => null }));
vi.mock('@/components/design-system', () => ({
  CommandBar: ({ children }: { children: ReactNode }) => children,
  KpiTile: () => null,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: mocks.success } }));
import FeatureFlagsAdmin from '../FeatureFlagsAdmin';

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(createElement(QueryClientProvider, { client }, createElement(FeatureFlagsAdmin)));
  await screen.findByText('viewer_3d');
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([{ id: 'flag-one', flag_key: 'viewer_3d', enabled: false, description: 'Existing description', user_overrides: { 'crew@example.test': true } }]);
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
});
afterEach(cleanup);

it('creates and toggles flags through the guarded RPC', async () => {
  await setup();
  fireEvent.change(screen.getByPlaceholderText('flag_key (e.g. new_dashboard)'), { target: { value: 'new_dashboard' } });
  fireEvent.change(screen.getByPlaceholderText('Description (optional)'), { target: { value: 'New preview' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add flag' }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('set_feature_flag', { p_flag_key: 'new_dashboard', p_enabled: false, p_description: 'New preview' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Off' }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('set_feature_flag', { p_flag_key: 'viewer_3d', p_enabled: true, p_description: 'Existing description' }));
  expect(screen.queryByTitle('Delete flag')).toBeNull();
});

it('allows clearing the description through the guarded RPC', async () => {
  await setup();
  fireEvent.blur(screen.getByDisplayValue('Existing description'), { target: { value: '' } });
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('set_feature_flag', { p_flag_key: 'viewer_3d', p_enabled: false, p_description: '' }));
});

it('adds and removes one override without replacing other users overrides', async () => {
  const client = await setup();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  fireEvent.change(screen.getByPlaceholderText('user@example.com'), { target: { value: ' New@Example.test ' } });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('set_feature_flag_override', { p_flag_key: 'viewer_3d', p_email: 'new@example.test', p_value: true }));
  await waitFor(() => expect(screen.getByTitle('Remove override')).not.toBeDisabled());
  fireEvent.click(screen.getByTitle('Remove override'));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('set_feature_flag_override', { p_flag_key: 'viewer_3d', p_email: 'crew@example.test', p_value: null }));
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feature_flags'] }));
});

it('reports a rejected administrator write and retains the draft', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Only a system administrator can change feature flags' } });
  await setup();
  fireEvent.change(screen.getByPlaceholderText('flag_key (e.g. new_dashboard)'), { target: { value: 'new_dashboard' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add flag' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Only a system administrator can change feature flags'));
  expect(screen.getByDisplayValue('new_dashboard')).toBeTruthy();
  expect(mocks.success).not.toHaveBeenCalled();
});

it('blocks invalid keys before an administrator mutation', async () => {
  await setup();
  fireEvent.change(screen.getByPlaceholderText('flag_key (e.g. new_dashboard)'), { target: { value: '1_invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add flag' }));
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalled();
});
