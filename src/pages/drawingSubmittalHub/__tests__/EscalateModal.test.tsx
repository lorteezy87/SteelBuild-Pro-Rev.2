// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setActiveOrgId } from '@/lib/activeOrg';
import EscalateModal from '../EscalateModal';
const mocks = vi.hoisted(() => ({ create: vi.fn(), number: vi.fn(), success: vi.fn(), error: vi.fn(), close: vi.fn(), can: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ entities: { ChangeOrder: { create: mocks.create } } }));
vi.mock('@/components/shared/numberSequencing', () => ({ getNextFormattedNumber: mocks.number }));
vi.mock('@/services/permissions', () => ({ usePermissions: () => ({ can: mocks.can }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('../../submittals/uiCompat', () => ({ Dialog: ({ children }: { children: ReactNode }) => <section>{children}</section>, DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>, DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>, DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2> }));
const clients: QueryClient[] = [];
beforeEach(() => { vi.resetAllMocks(); setActiveOrgId(null); setActiveOrgId('org-a'); mocks.can.mockReturnValue(true); mocks.number.mockResolvedValue('CO #old'); mocks.create.mockResolvedValue({ id: 'co', co_number: 'CO #042', project_id: 'project-a' }); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
function mount() {
  const client = new QueryClient(); clients.push(client);
  const tree = (id = 'set-a', projectId = 'project-a') => <QueryClientProvider client={client}><EscalateModal item={{ id, title: 'Connection detail', kind: 'Drawing Set', _drawingSetId: id }} projectId={projectId} projectName="Steel project" initialKind="pco" onClose={mocks.close} /></QueryClientProvider>;
  const view = render(tree()); return { ...view, changeScope: (id: string, project: string) => view.rerender(tree(id, project)) };
}
const save = () => fireEvent.click(screen.getByRole('button', { name: /Create draft PCO|Recover saved PCO/ }));
it('uses the returned official CO number without preallocating and preserves an unknown estimate', async () => {
  mount(); save(); await waitFor(() => expect(mocks.close).toHaveBeenCalled());
  expect(mocks.number).not.toHaveBeenCalled();
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'project-a', co_amount: null, status: 'Draft' }), { clientOperationId: expect.stringMatching(/^[a-f0-9-]{36}$/i) });
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('co_number');
  expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('CO #042'));
});
it('retains the original PCO draft and identity after a lost reply', async () => {
  mocks.create.mockRejectedValueOnce(Object.assign(new Error('Reply lost'), { outcomeUnknown: true })); mount();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1000' } }); save();
  await screen.findByRole('button', { name: 'Recover saved PCO' });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '9999' } }); save();
  await waitFor(() => expect(mocks.close).toHaveBeenCalled());
  expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
});
it('recovers the same PCO operation after the escalation modal is remounted', async () => {
  mocks.create.mockRejectedValueOnce(Object.assign(new Error('Reply lost'), { outcomeUnknown: true }));
  const view = mount(); fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '750' } }); save();
  await screen.findByRole('button', { name: 'Recover saved PCO' }); view.unmount();
  mount(); expect(screen.getByRole('status').textContent).toMatch(/original/i);
  expect(screen.getByRole('spinbutton')).toHaveValue(750); save();
  await waitFor(() => expect(mocks.close).toHaveBeenCalled());
  expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
});
it('does not close a replacement escalation when the original create finishes', async () => {
  let resolve!: (value: object) => void; mocks.create.mockReturnValue(new Promise(done => { resolve = done; }));
  const view = mount(); save(); await waitFor(() => expect(mocks.create).toHaveBeenCalled());
  view.changeScope('set-b', 'project-a');
  await act(async () => { resolve({ id: 'origin-co', co_number: 'CO #042' }); });
  expect(mocks.close).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
});
