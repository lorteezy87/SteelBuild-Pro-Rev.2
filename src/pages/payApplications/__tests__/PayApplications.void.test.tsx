// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PayApplication, PayAppStatus } from '@/lib/payapp/types';
import type { PayApplicationsControlCenterProps } from '../PayApplicationsControlCenter';
import PayApplications from '@/pages/PayApplications';

const fixture = vi.hoisted(() => ({
  project: { id: 'project-a', name: 'Project A' },
  role: 'pm' as string | null,
  roleLoading: false,
  applications: [] as PayApplication[],
  update: vi.fn(),
}));
vi.mock('@/components/shared/ProjectContext', () => ({ useProjectContext: () => ({ activeProject: fixture.project }) }));
vi.mock('@/hooks/useProjectRole', async importOriginal => ({
  ...await importOriginal<typeof import('@/hooks/useProjectRole')>(),
  useProjectRole: () => ({ role: fixture.role, isLoading: fixture.roleLoading }),
}));
vi.mock('@/services/auditLogger', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/payapp/repository', () => ({
  getPayAppContract: vi.fn(async () => ({ original_contract_value: 100000, retainage_percent: 10 })),
  listPayApplications: vi.fn(async (id: string) => fixture.applications.filter(app => app.project_id === id)),
  listSovItems: vi.fn(async () => []), listPayAppChangeOrders: vi.fn(async () => []), listLines: vi.fn(async () => []),
  createPayApplication: vi.fn(), softDeletePayApplication: vi.fn(), updateLine: vi.fn(), updatePayApplication: fixture.update,
}));
vi.mock('../PayApplicationsControlCenter', () => ({ default: ({ payApps, onOpen }: PayApplicationsControlCenterProps) => <div>
  {payApps.map(app => <button key={app.id} onClick={() => onOpen(app)}>Open application {app.application_number}</button>)}
</div> }));

let client: QueryClient;
beforeEach(() => {
  fixture.project = { id: 'project-a', name: 'Project A' };
  fixture.role = 'pm'; fixture.roleLoading = false;
  fixture.applications = [
    { id: 'app-one', project_id: 'project-a', application_number: 1, status: 'submitted' },
    { id: 'app-two', project_id: 'project-a', application_number: 2, status: 'draft' },
  ];
  fixture.update.mockReset().mockImplementation(async (id: string, patch: Partial<PayApplication>) => {
    const updated = { ...fixture.applications.find(app => app.id === id)!, ...patch };
    fixture.applications = fixture.applications.map(app => app.id === id ? updated : app);
    return updated;
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });
function mount() {
  const tree = () => <QueryClientProvider client={client}><PayApplications /></QueryClientProvider>;
  return { ...render(tree()), tree };
}
async function selectApplication(number = 1) {
  fireEvent.click(await screen.findByRole('button', { name: `Open application ${number}` }));
  return await screen.findByRole('combobox', { name: 'Pay application status' });
}
async function openVoid(number = 1) {
  const select = await selectApplication(number);
  fireEvent.change(select, { target: { value: 'void' } });
  return { select, dialog: await screen.findByRole('dialog', { name: `Void Pay Application #${number}` }) };
}

it('requires a trimmed reason before making a status request and updates only the chosen application', async () => {
  mount();
  const { select, dialog } = await openVoid(2);
  const reason = within(dialog).getByRole('textbox', { name: 'Reason for voiding' });
  const confirm = within(dialog).getByRole('button', { name: 'Void application' });
  expect(select).toHaveValue('draft');
  fireEvent.click(confirm);
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter a reason');
  fireEvent.change(reason, { target: { value: '  \n  ' } }); fireEvent.click(confirm);
  expect(fixture.update).not.toHaveBeenCalled();
  fireEvent.change(reason, { target: { value: '  Replaced by corrected billing period.  ' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(fixture.update).toHaveBeenCalledExactlyOnceWith('app-two', { status: 'void', void_reason: 'Replaced by corrected billing period.' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(select).toHaveValue('void');
  expect(fixture.applications[0].status).toBe('submitted');
});

it.each(['Cancel', 'Escape'])('cancels through %s without changing the status or retaining a cancelled reason', async method => {
  mount(); const { select, dialog } = await openVoid();
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Cancelled draft reason' } });
  if (method === 'Cancel') fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  else fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(select).toHaveValue('submitted'); expect(fixture.update).not.toHaveBeenCalled();
  fireEvent.change(select, { target: { value: 'void' } });
  expect(await screen.findByRole('textbox', { name: 'Reason for voiding' })).toHaveValue('');
});

it('keeps the reason and saved status after failure, then supports an explicit retry', async () => {
  fixture.update.mockRejectedValueOnce(new Error('Connection interrupted'));
  mount(); const { select, dialog } = await openVoid();
  const reason = within(dialog).getByRole('textbox');
  fireEvent.change(reason, { target: { value: 'Duplicate certificate entered.' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Void application' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Connection interrupted');
  expect(reason).toHaveValue('Duplicate certificate entered.'); expect(select).toHaveValue('submitted');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Retry void' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(fixture.update).toHaveBeenCalledTimes(2); expect(select).toHaveValue('void');
});

it.each(['viewer', 'field', null])('does not allow role %s to request a void', async role => {
  fixture.role = role; mount(); const select = await selectApplication();
  expect(select).toBeDisabled();
  fireEvent.change(select, { target: { value: 'void' } });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(fixture.update).not.toHaveBeenCalled();
});
it('waits for authoritative role resolution', async () => {
  fixture.roleLoading = true; mount(); expect(await selectApplication()).toBeDisabled();
});
it.each(['paid', 'void'] as PayAppStatus[])('does not offer a new void for a %s application', async status => {
  fixture.applications[0].status = status; mount(); const select = await selectApplication();
  fireEvent.change(select, { target: { value: 'void' } });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(fixture.update).not.toHaveBeenCalled();
});
it('blocks a stale confirmation after project role is revoked', async () => {
  const app = mount(); const { dialog } = await openVoid();
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'No longer needed.' } });
  fixture.role = 'viewer'; app.rerender(app.tree());
  expect(within(dialog).getByRole('button', { name: 'Void application' })).toBeDisabled();
  expect(fixture.update).not.toHaveBeenCalled();
});
it('pins an in-flight request and its cache update to the original application/project', async () => {
  let resolve!: (value: PayApplication) => void;
  fixture.update.mockImplementationOnce(() => new Promise<PayApplication>(done => { resolve = done; }));
  const app = mount(); const { dialog } = await openVoid();
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Duplicate certificate.' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Void application' }));
  await waitFor(() => expect(fixture.update).toHaveBeenCalledTimes(1));
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fixture.project = { id: 'project-b', name: 'Project B' };
  const other: PayApplication = { id: 'app-other', project_id: 'project-b', application_number: 5, status: 'approved' };
  fixture.applications.push(other); app.rerender(app.tree());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const select = await selectApplication(5);
  await act(async () => {
    const updated: PayApplication = { ...fixture.applications[0], status: 'void', void_reason: 'Duplicate certificate.' };
    fixture.applications[0] = updated; resolve(updated);
  });
  expect(select).toHaveValue('approved');
  expect(client.getQueryData<PayApplication[]>(['pay_applications', 'project-b'])?.[0]).toEqual(other);
});
