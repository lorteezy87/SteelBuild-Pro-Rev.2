// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setActiveOrgId } from '@/lib/activeOrg';
import { CreateRecordModal } from '../modals';

const mocks = vi.hoisted(() => ({ create: vi.fn(), link: vi.fn(), document: vi.fn(), success: vi.fn(), error: vi.fn(), complete: vi.fn(), close: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ entities: { ChangeOrder: { create: mocks.create }, EmailMessage: { update: mocks.link }, Document: { create: mocks.document } } }));
vi.mock('@/services/emailSendService', () => ({ sendEmail: vi.fn(), buildReplyDefaults: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/components/design-system', () => ({ Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <section>{children}{footer}</section> }));
const message = { id: 'email-a', project_id: 'project-a', subject: 'Additional steel', sender_email: 'gc@example.com', body_text: 'Please review added steel', parsed_type: 'change_order', parsed_metadata: { extracted: { due_date: '2026-10-14' } } };
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks(); setActiveOrgId(null); setActiveOrgId('org-a');
  mocks.create.mockResolvedValue({ id: 'co-original', co_number: 'CO #042', project_id: 'project-a' });
  mocks.link.mockResolvedValue({ id: 'email-a' }); mocks.document.mockResolvedValue({ id: 'doc' });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
function mount(attachments: Array<{ id: string; filename: string; storage_path: string }> = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const tree = (id = 'email-a', projectId = 'project-a') => <QueryClientProvider client={client}><CreateRecordModal message={{ ...message, id }} attachments={attachments} projectId={projectId} onSuccess={mocks.complete} onClose={mocks.close} /></QueryClientProvider>;
  const view = render(tree()); return { ...view, changeScope: (id: string, projectId: string) => view.rerender(tree(id, projectId)) };
}
const save = () => fireEvent.click(screen.getByRole('button', { name: /Create Record|Recover saved record|Retry email link/ }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

it('creates an unpriced Draft CO with only supported fields and a stable operation identity', async () => {
  mount(); save(); await waitFor(() => expect(mocks.complete).toHaveBeenCalled());
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'project-a', title: 'Additional steel', status: 'Draft', co_amount: null }), { clientOperationId: expect.stringMatching(/^[a-f0-9-]{36}$/i) });
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('response_due');
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('co_number');
});
it('recovers an uncertain create with its original payload and operation before linking the email', async () => {
  mocks.create.mockRejectedValueOnce(Object.assign(new Error('Reply lost'), { outcomeUnknown: true })); mount(); save();
  await screen.findByRole('button', { name: 'Recover saved record' });
  fireEvent.change(screen.getByPlaceholderText('Record title'), { target: { value: 'Changed after lost reply' } });
  save(); await waitFor(() => expect(mocks.complete).toHaveBeenCalled());
  expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  expect(mocks.link).toHaveBeenCalledTimes(1);
  expect(mocks.link.mock.calls[0][1].linked_entity_id).toBe('co-original');
});
it('retries a failed email link to the confirmed CO without creating another record', async () => {
  mocks.link.mockRejectedValueOnce(new Error('Link failed')); mount(); save();
  await screen.findByRole('button', { name: 'Retry email link' });
  expect(mocks.complete).not.toHaveBeenCalled(); save();
  await waitFor(() => expect(mocks.complete).toHaveBeenCalled());
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.link).toHaveBeenCalledTimes(2);
  expect(mocks.link.mock.calls[1][1].linked_entity_id).toBe('co-original');
});
it('retains the confirmed CO and attachment choice when reopening after a failed link', async () => {
  mocks.link.mockRejectedValueOnce(new Error('Link failed'));
  const attachments = [{ id: 'one', filename: 'one.pdf', storage_path: 'one' }, { id: 'two', filename: 'two.pdf', storage_path: 'two' }];
  const view = mount(attachments); fireEvent.click(screen.getByRole('checkbox', { name: /two.pdf/ })); save();
  await screen.findByRole('button', { name: 'Retry email link' }); view.unmount();
  mount(attachments); save(); await waitFor(() => expect(mocks.complete).toHaveBeenCalled());
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.document).toHaveBeenCalledTimes(1);
  expect(mocks.document.mock.calls[0][0].file_name).toBe('one.pdf');
});
it('recovers the exact CO operation after reopening an uncertain email create', async () => {
  mocks.create.mockRejectedValueOnce(Object.assign(new Error('Reply lost'), { outcomeUnknown: true }));
  const view = mount(); save(); await screen.findByRole('button', { name: 'Recover saved record' }); view.unmount();
  mount(); expect(screen.getByRole('status').textContent).toMatch(/original/i); save();
  await waitFor(() => expect(mocks.complete).toHaveBeenCalled());
  expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
});
it('keeps the original title and attachment choice after a recovery attempt is rejected', async () => {
  mocks.create.mockRejectedValueOnce(Object.assign(new Error('Reply lost'), { outcomeUnknown: true })).mockRejectedValueOnce(new Error('Permission unavailable'));
  const attachments = [{ id: 'one', filename: 'one.pdf', storage_path: 'one' }, { id: 'two', filename: 'two.pdf', storage_path: 'two' }];
  const view = mount(attachments);
  fireEvent.change(screen.getByPlaceholderText('Record title'), { target: { value: 'Reviewed original steel' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /two.pdf/ })); save();
  await screen.findByRole('button', { name: 'Recover saved record' }); save();
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Permission unavailable')); view.unmount();
  mount(attachments);
  expect(screen.getByPlaceholderText('Record title')).toHaveValue('Reviewed original steel');
  expect(screen.getByRole('checkbox', { name: /two.pdf/ })).not.toBeChecked();
  save(); await waitFor(() => expect(mocks.complete).toHaveBeenCalled());
  expect(mocks.create.mock.calls[2]).toEqual(mocks.create.mock.calls[0]);
  expect(mocks.document).toHaveBeenCalledTimes(1);
});
it('reports attachment failures without claiming all selected documents were filed', async () => {
  mocks.document.mockRejectedValueOnce(new Error('Storage denied'));
  mount([{ id: 'one', filename: 'one.pdf', storage_path: 'one' }, { id: 'two', filename: 'two.pdf', storage_path: 'two' }]); save();
  await waitFor(() => expect(mocks.complete).toHaveBeenCalled());
  expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(/1 of 2 attachments filed/i));
  expect(mocks.success).not.toHaveBeenCalledWith(expect.stringMatching(/2 attachments filed/i));
});
it('does not claim an attachment without a stored file was filed', async () => {
  mount([{ id: 'missing', filename: 'missing.pdf', storage_path: '' }]); save();
  await waitFor(() => expect(mocks.complete).toHaveBeenCalled());
  expect(mocks.document).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(/0 of 1 attachments filed/i));
});
it('stops attachment filing if the origin changes while linking the confirmed CO', async () => {
  const pending = deferred<{ id: string }>(); mocks.link.mockReturnValue(pending.promise);
  const view = mount([{ id: 'one', filename: 'one.pdf', storage_path: 'one' }]); save();
  await waitFor(() => expect(mocks.link).toHaveBeenCalled());
  view.changeScope('email-b', 'project-a');
  await act(async () => { pending.resolve({ id: 'email-a' }); });
  expect(mocks.document).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
});
it.each(['message', 'project', 'workspace', 'unmount'])('stops link and attachment side effects after the origin %s changes', async change => {
  const pending = deferred<{ id: string; co_number: string }>(); mocks.create.mockReturnValue(pending.promise);
  const view = mount([{ id: 'one', filename: 'one.pdf', storage_path: 'one' }]); save();
  await waitFor(() => expect(mocks.create).toHaveBeenCalled());
  if (change === 'message') view.changeScope('email-b', 'project-a');
  if (change === 'project') view.changeScope('email-a', 'project-b');
  if (change === 'workspace') act(() => setActiveOrgId('org-b'));
  if (change === 'unmount') view.unmount();
  await act(async () => { pending.resolve({ id: 'origin-co', co_number: 'CO #042' }); });
  expect(mocks.link).not.toHaveBeenCalled(); expect(mocks.document).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  if (change === 'unmount') {
    mount(); save(); await waitFor(() => expect(mocks.complete).toHaveBeenCalled());
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
    expect(mocks.link.mock.calls[0][1].linked_entity_id).toBe('origin-co');
  }
});
