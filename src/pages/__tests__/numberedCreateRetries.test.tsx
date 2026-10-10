// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveOrgId } from '@/lib/activeOrg';

const mocks = vi.hoisted(() => ({ projectId: 'p1', backcharge: vi.fn(), request: vi.fn(), delivery: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/useProjectId', () => ({ useProjectId: () => mocks.projectId }));
vi.mock('@/components/shared/ProjectContext', () => ({ useProjectContext: () => ({ activeProject: { id: mocks.projectId, name: 'Steel A' } }) }));
vi.mock('@/hooks/useAutoOpenCreate', () => ({ useAutoOpenCreate: (): void => {} }));
vi.mock('@/hooks/useFocusTrap', () => ({ useFocusTrap: (): { current: HTMLElement | null } => ({ current: null }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => mocks.error(...args), warning: vi.fn() } }));
vi.mock('@/api/supabaseClient', () => ({ entities: {
  Project: { list: async () => [{ id: 'p1', name: 'Steel A' }, { id: 'p2', name: 'Steel B' }] },
  ChangeRequest: { create: (...args: unknown[]) => mocks.request(...args), filter: async (): Promise<Record<string, unknown>[]> => [], list: async (): Promise<Record<string, unknown>[]> => [] },
  Delivery: { create: (...args: unknown[]) => mocks.delivery(...args), filter: async (): Promise<Record<string, unknown>[]> => [] },
  ChangeOrder: { filter: async (): Promise<Record<string, unknown>[]> => [] }, RFI: { filter: async (): Promise<Record<string, unknown>[]> => [] },
  WorkPackage: { filter: async (): Promise<Record<string, unknown>[]> => [] }, Vendor: { list: async (): Promise<Record<string, unknown>[]> => [] },
} }));
vi.mock('@/lib/backcharge/repository', () => ({
  createBackcharge: (...args: unknown[]) => mocks.backcharge(...args),
  listBackcharges: async (): Promise<Record<string, unknown>[]> => [], listEvents: async (): Promise<Record<string, unknown>[]> => [], listTmTickets: async (): Promise<Record<string, unknown>[]> => [],
  addTmTicket: vi.fn(), softDeleteBackcharge: vi.fn(), softDeleteTmTicket: vi.fn(), updateBackcharge: vi.fn(),
}));
vi.mock('@/pages/backcharges/BackchargeControlCenter', () => ({ default: ({ onCreate }: { onCreate: () => void }) => <button onClick={onCreate}>New backcharge</button> }));
vi.mock('@/pages/procurement/ProcurementControlCenter', () => ({ default: ({ onCreate }: { onCreate: () => void }) => <button onClick={onCreate}>New procurement</button> }));
vi.mock('@/components/changerequest/ChangeRequestList', () => ({ default: (): null => null }));
vi.mock('@/components/shared/DeleteDialog', () => ({ default: (): null => null }));
vi.mock('@/lib/native/fileExport', () => ({ presentGeneratedFiles: vi.fn() }));
vi.mock('@/lib/backcharge/defensePdf', () => ({ buildDefensePdf: vi.fn() }));

import Backcharges from '../Backcharges';
import ChangeRequests from '../ChangeRequests';
import Procurement from '../Procurement';

const pages = [
  { name: 'Backcharges', Page: Backcharges, open: /New backcharge/i, save: /^Create$/, title: /Cleanup of debris/i, write: mocks.backcharge },
  { name: 'Change requests', Page: ChangeRequests, open: /^New Request$/i, save: /^Submit Request$/, title: /^Change request title$/, write: mocks.request },
  { name: 'Procurement', Page: Procurement, open: /New procurement/i, save: /^Add Item$/, title: /W-Shape Mill Order/i, write: mocks.delivery },
];
beforeEach(() => {
  mocks.projectId = 'p1'; setActiveOrgId(null); setActiveOrgId('org-a');
  for (const write of [mocks.backcharge, mocks.request, mocks.delivery]) write.mockReset().mockResolvedValue({ id: 'saved' });
  mocks.error.mockReset();
});
function mount(Page: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><MemoryRouter><Page /></MemoryRouter></QueryClientProvider>;
  return { ...render(tree()), tree };
}

describe.each(pages)('$name numbered create recovery', ({ Page, open, save, title, write }) => {
  async function fill() {
    fireEvent.click(await screen.findByRole('button', { name: open }));
    fireEvent.change(screen.getByPlaceholderText(title), { target: { value: 'Original steel scope' } });
    const description = screen.queryByPlaceholderText('Detailed description of the change');
    if (description) fireEvent.change(description, { target: { value: 'Original supporting details' } });
  }
  it('reuses exact payload and operation after an ambiguous committed reply', async () => {
    write.mockRejectedValueOnce(Object.assign(new Error('Reply lost'), { outcomeUnknown: true }));
    mount(Page); await fill();
    fireEvent.click(screen.getByRole('button', { name: save }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    await screen.findByText(/Retry to recover the original details/);
    expect(screen.getByPlaceholderText(title)).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(title), { target: { value: 'Later edited scope' } });
    fireEvent.click(screen.getByRole('button', { name: /^Recover saved /i }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write.mock.calls[0][1]?.clientOperationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
    if (write === mocks.delivery) expect(write.mock.calls[0][0].delivery_title).toBe('Original steel scope');
  });
  it('reopens an uncertain create as a locked recovery rather than a new operation', async () => {
    write.mockRejectedValueOnce(Object.assign(new Error('Reply lost'), { outcomeUnknown: true }));
    mount(Page); await fill();
    fireEvent.click(screen.getByRole('button', { name: save }));
    await screen.findByRole('button', { name: /^Recover saved /i });
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    fireEvent.click(await screen.findByRole('button', { name: open }));
    expect(screen.getByPlaceholderText(title)).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Recover saved /i }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
  });
  it('refuses to save a draft from the previously selected project', async () => {
    const mounted = mount(Page); await fill();
    mocks.projectId = 'p2'; mounted.rerender(mounted.tree());
    await screen.findByRole('button', { name: save });
    fireEvent.change(screen.getByPlaceholderText(title), { target: { value: 'Changed project draft' } });
    const description = screen.queryByPlaceholderText('Detailed description of the change');
    if (description) fireEvent.change(description, { target: { value: 'Changed project details' } });
    fireEvent.click(screen.getByRole('button', { name: save }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(write).not.toHaveBeenCalled();
  });
});
