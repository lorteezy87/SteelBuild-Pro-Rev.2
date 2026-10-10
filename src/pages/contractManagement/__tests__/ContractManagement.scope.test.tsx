// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContractManagement from '../../ContractManagement';

type FormProps = { open: boolean; onSave: (payload: Record<string, unknown>) => Promise<unknown>; onClose: () => void; onRecover?: () => Promise<unknown>; requiresRecovery?: boolean; isSaving?: boolean; writesDisabled?: boolean; sov?: { id?: string; updated_at?: string } | null; projects: object[] };
const mocks = vi.hoisted(() => ({
  projectId: 'a' as string | null, orgId: 'org-a' as string | null, loading: false, generation: 0,
  can: vi.fn(), projects: vi.fn(), legacyProjects: vi.fn(), cos: vi.fn(), lines: vi.fn(), expenses: vi.fn(),
  legacyCos: vi.fn(), legacyLines: vi.fn(), legacyExpenses: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), projectUpdate: vi.fn(),
  forms: [] as FormProps[],
}));
vi.mock('@/api/supabaseClient', () => ({ entities: {
  Project: { filterAll: mocks.projects, list: mocks.legacyProjects, update: mocks.projectUpdate },
  ChangeOrder: { filterAll: mocks.cos, filter: mocks.legacyCos },
  SOVItem: { filterAll: mocks.lines, filter: mocks.legacyLines, create: mocks.create, update: mocks.update, delete: mocks.remove },
  Expense: { filterAll: mocks.expenses, filter: mocks.legacyExpenses },
} }));
vi.mock('@/components/shared/OrgContext', () => ({ useOrg: () => ({ currentOrg: mocks.orgId ? { id: mocks.orgId } : null, isLoadingOrgs: mocks.loading }) }));
vi.mock('@/components/shared/ProjectContext', () => ({ useProjectContext: () => ({ activeProject: mocks.projectId ? { id: mocks.projectId, name: 'Unproven project' } : null }) }));
vi.mock('@/lib/activeOrg', () => ({ getActiveOrgGeneration: () => mocks.generation, subscribeActiveOrgChange: () => () => {} }));
vi.mock('@/services/permissions', () => ({ usePermissions: () => ({ can: mocks.can }) }));
vi.mock('@/hooks/useRealtimeInvalidation', () => ({ useRealtimeInvalidation: (): undefined => undefined }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/design-system', () => ({
  CommandBar: ({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) => <header><h1>{title}</h1><span>{eyebrow}</span>{children}</header>,
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock('@/components/sov/SOVFormModal', () => ({ default: (props: FormProps): ReactNode => {
  if (!props.open) return null;
  mocks.forms.push(props);
  return <section aria-label="SOV draft"><pre>{JSON.stringify(props.projects)}</pre>
    <button disabled={props.isSaving || props.writesDisabled} onClick={() => { void props.onSave({ description: 'Steel scope', project_id: mocks.projectId, scheduled_value: 100 }).catch(() => {}); }}>Save line</button>
    {props.requiresRecovery && <button disabled={props.isSaving} onClick={() => { void props.onRecover!().catch(() => {}); }}>Recover original save</button>}
    <button onClick={props.onClose}>Close draft</button>
  </section>;
} }));

const clients: QueryClient[] = [];
const line = (projectId = 'a') => ({ id: `${projectId}-line`, project_id: projectId, line_item_number: 1, description: 'Fabrication steel', scheduled_value: 200, status: 'Draft', updated_at: '2026-10-07T10:00:00.123456Z' });
beforeEach(() => {
  vi.clearAllMocks(); mocks.projectId = 'a'; mocks.orgId = 'org-a'; mocks.loading = false; mocks.generation++; mocks.forms.length = 0;
  mocks.can.mockReturnValue(true);
  mocks.projects.mockImplementation(async ({ id, org_id }: { id: string; org_id: string }) => [{ id, org_id, name: `Proven ${id}`, original_contract_value: 200 }]);
  mocks.legacyProjects.mockImplementation(async () => [{ id: mocks.projectId, org_id: mocks.orgId, name: `Proven ${mocks.projectId}`, original_contract_value: 200 }]);
  mocks.cos.mockResolvedValue([]); mocks.legacyCos.mockResolvedValue([]);
  mocks.lines.mockImplementation(async ({ project_id }: { project_id: string }) => [line(project_id)]);
  mocks.legacyLines.mockImplementation(async ({ project_id }: { project_id: string }) => [line(project_id)]);
  mocks.expenses.mockResolvedValue([]); mocks.legacyExpenses.mockResolvedValue([]);
  mocks.create.mockImplementation(async (payload: object) => ({ id: 'saved', ...payload }));
  mocks.update.mockImplementation(async (id: string, payload: object) => ({ id, ...payload }));
  mocks.remove.mockResolvedValue({ success: true }); mocks.projectUpdate.mockResolvedValue({ id: 'a' });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  const tree = () => <QueryClientProvider client={client}><ContractManagement /></QueryClientProvider>;
  const view = render(tree()); return { ...view, client, refresh: () => view.rerender(tree()) };
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
async function billing() { await screen.findByText('Proven a'); fireEvent.click(screen.getByRole('button', { name: 'BILLING & SOV' })); }
async function createDraft() { await billing(); fireEvent.click(screen.getByRole('button', { name: /Add Line Item/ })); return lastForm(); }
const lastForm = () => mocks.forms[mocks.forms.length - 1];

describe('contract commercial evidence and origin-bound writes', () => {
  it('proves workspace ownership before loading all financial rows', async () => {
    const projectRead = deferred<object[]>(); mocks.projects.mockReturnValue(projectRead.promise); mount();
    expect(mocks.legacyProjects).not.toHaveBeenCalled(); expect(mocks.lines).not.toHaveBeenCalled();
    await act(async () => { projectRead.resolve([{ id: 'a', org_id: 'org-a', name: 'Proven a' }]); });
    await screen.findByText('Proven a');
    expect(mocks.projects).toHaveBeenCalledWith({ id: 'a', org_id: 'org-a' }, 'id');
    for (const source of [mocks.cos, mocks.lines, mocks.expenses]) expect(source).toHaveBeenCalledWith({ project_id: 'a' }, 'id');
    expect(mocks.legacyLines).not.toHaveBeenCalled();
  });
  it('starts no financial reads without a settled workspace', () => {
    mocks.orgId = null; const view = mount(); expect(mocks.legacyProjects).not.toHaveBeenCalled(); expect(mocks.projects).not.toHaveBeenCalled();
    mocks.orgId = 'org-a'; mocks.loading = true; view.refresh(); expect(mocks.projects).not.toHaveBeenCalled(); expect(mocks.lines).not.toHaveBeenCalled();
  });
  it('rejects a foreign project before querying its financial sources', async () => {
    mocks.projects.mockResolvedValue([{ id: 'a', org_id: 'org-b' }]); mount();
    await screen.findByRole('alert'); expect(mocks.lines).not.toHaveBeenCalled(); expect(screen.queryByText('Original Contract')).toBeNull();
  });
  it.each(['cos', 'lines', 'expenses'] as const)('does not publish financial totals when %s fails', async source => {
    mocks[source].mockRejectedValue(new Error(`${source} failed`)); mount();
    expect((await screen.findByRole('alert')).textContent).toContain(`${source} failed`);
    expect(screen.queryByText('Original Contract')).toBeNull();
  });
  it('rejects a foreign source row instead of mixing it into the project total', async () => {
    mocks.lines.mockResolvedValue([line('b')]); mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/outside|project/i);
  });
  it('passes the version displayed when opening the editor even after a background refresh', async () => {
    const view = mount(); await billing(); fireEvent.click(screen.getByTitle('Edit line item')); const draft = lastForm();
    mocks.lines.mockResolvedValue([{ ...line(), scheduled_value: 900, updated_at: '2026-10-07T11:00:00Z' }]);
    await act(async () => { await view.client.invalidateQueries(); });
    await act(async () => { await draft.onSave({ project_id: 'a', scheduled_value: 350 }); });
    expect(mocks.update).toHaveBeenCalledWith('a-line', expect.objectContaining({ scheduled_value: 350 }), { sovItemReview: { updatedAt: '2026-10-07T10:00:00.123456Z' } });
  });
  it('rejects an old save after A→B→A and after closing and reopening the draft', async () => {
    const view = mount(); const old = await createDraft();
    mocks.projectId = 'b'; mocks.orgId = 'org-b'; view.refresh(); await screen.findByText('Proven b');
    mocks.projectId = 'a'; mocks.orgId = 'org-a'; view.refresh(); await screen.findByText('Proven a');
    await act(async () => { await expect(old.onSave({ project_id: 'a' })).rejects.toThrow(/previous|changed|reopen/i); });
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Line Item/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Add Line Item/ })); const closed = lastForm(); fireEvent.click(screen.getByRole('button', { name: 'Close draft' }));
    fireEvent.click(screen.getByRole('button', { name: /Add Line Item/ }));
    await act(async () => { await expect(closed.onSave({ project_id: 'a' })).rejects.toThrow(/previous|changed|reopen/i); });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('checks current permissions and invalidation at the write boundary before React repaints', async () => {
    const view = mount(); const draft = await createDraft();
    mocks.can.mockReturnValue(false);
    await act(async () => { await expect(draft.onSave({ project_id: 'a' })).rejects.toThrow(/permission/i); });
    mocks.can.mockReturnValue(true);
    await act(async () => { void view.client.invalidateQueries({ refetchType: 'none' }); await expect(draft.onSave({ project_id: 'a' })).rejects.toThrow(/incomplete|refresh/i); });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects a foreign payload and an immediate workspace generation change', async () => {
    mount(); const draft = await createDraft();
    await act(async () => { await expect(draft.onSave({ project_id: 'b' })).rejects.toThrow(/project/i); });
    mocks.generation++;
    await act(async () => { await expect(draft.onSave({ project_id: 'a' })).rejects.toThrow(/changed|reopen/i); });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('recovers an uncertain create with the exact original payload and operation UUID', async () => {
    mocks.create.mockRejectedValueOnce(Object.assign(new Error('Response lost'), { outcomeUnknown: true })); mount();
    const draft = await createDraft();
    await act(async () => { await expect(draft.onSave({ project_id: 'a', description: 'Original steel', scheduled_value: 250 })).rejects.toThrow('Response lost'); });
    const operation = mocks.create.mock.calls[0][1].clientOperationId;
    expect(operation).toMatch(/^[a-f0-9-]{36}$/i); expect(lastForm().requiresRecovery).toBe(true);
    await act(async () => { await expect(draft.onSave({ project_id: 'a', description: 'Changed steel', scheduled_value: 900 })).rejects.toThrow(/recover/i); });
    fireEvent.click(screen.getByRole('button', { name: 'Recover original save' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  });
  it('recovers the original create after closing and remounting Contract Management', async () => {
    mocks.create.mockRejectedValueOnce(Object.assign(new Error('Reply lost'), { outcomeUnknown: true }));
    const view = mount(); const original = await createDraft();
    await act(async () => { await expect(original.onSave({ project_id: 'a', description: 'Original steel', scheduled_value: 250 })).rejects.toThrow('Reply lost'); });
    fireEvent.click(screen.getByRole('button', { name: 'Close draft' })); view.unmount();
    mount(); await createDraft();
    expect(lastForm().requiresRecovery).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Recover original save' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'SOV draft' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Line Item/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Add Line Item/ }));
    expect(lastForm().requiresRecovery).toBe(false);
  });
  it('reserves a pending create identity so remounting cannot start a duplicate', async () => {
    const pending = deferred<object>(); mocks.create.mockReturnValueOnce(pending.promise);
    const view = mount(); const original = await createDraft();
    let first!: Promise<unknown>;
    act(() => { first = original.onSave({ project_id: 'a', description: 'Pending original steel', scheduled_value: 250 }); });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1)); view.unmount();
    mount(); await createDraft();
    expect(lastForm().requiresRecovery).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Recover original save' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
    await act(async () => { pending.resolve({ id: 'original', project_id: 'a' }); await first; });
  });
  it('retains a successful late create until a remounted editor confirms its original operation', async () => {
    const pending = deferred<object>(); mocks.create.mockReturnValueOnce(pending.promise);
    const view = mount(); const original = await createDraft();
    let first!: Promise<unknown>;
    act(() => { first = original.onSave({ project_id: 'a', description: 'Late steel', scheduled_value: 250 }); });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1)); view.unmount();
    await act(async () => { pending.resolve({ id: 'original', project_id: 'a' }); await first; });
    mount(); await createDraft();
    expect(lastForm().requiresRecovery).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Recover original save' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  });
  it('does not release a reopened pending recovery when the original request is rejected', async () => {
    const originalReply = deferred<object>(); const recoveryReply = deferred<object>();
    mocks.create.mockReturnValueOnce(originalReply.promise).mockReturnValueOnce(recoveryReply.promise);
    const firstView = mount(); const original = await createDraft();
    let first!: Promise<unknown>;
    act(() => { first = original.onSave({ project_id: 'a', description: 'Reserved steel', scheduled_value: 250 }); });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1)); firstView.unmount();
    const secondView = mount(); await createDraft();
    let second!: Promise<unknown>;
    act(() => { second = lastForm().onRecover!(); });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    await act(async () => { originalReply.reject(new Error('Original permission denied')); await expect(first).rejects.toThrow('Original permission denied'); });
    secondView.unmount(); mount(); await createDraft();
    expect(lastForm().requiresRecovery).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Recover original save' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(3));
    expect(mocks.create.mock.calls[2]).toEqual(mocks.create.mock.calls[0]);
    await act(async () => { recoveryReply.resolve({ id: 'original', project_id: 'a' }); await second; });
  });
  it('does not close a replacement editor when an older pending save completes', async () => {
    const pending = deferred<object>(); mocks.create.mockReturnValueOnce(pending.promise); mount(); const old = await createDraft();
    let save!: Promise<unknown>; act(() => { save = old.onSave({ project_id: 'a', scheduled_value: 200 }); });
    await waitFor(() => expect(mocks.create).toHaveBeenCalled()); act(() => old.onClose());
    fireEvent.click(screen.getByRole('button', { name: /Add Line Item/ })); const replacement = lastForm();
    await act(async () => { pending.resolve({ id: 'old-save', project_id: 'a' }); await save; });
    expect(screen.getByRole('region', { name: 'SOV draft' })).toBeTruthy(); expect(lastForm().onSave).toBe(replacement.onSave);
  });
  it('keeps the real delete dialog open on failure and awaits successful retry', async () => {
    const pending = deferred<object>(); mocks.remove.mockReturnValueOnce(pending.promise); mount(); await billing();
    fireEvent.click(screen.getByTitle('Delete line item')); fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('button', { name: 'Deleting...' })).toBeDisabled();
    await act(async () => { pending.reject(new Error('Permission changed')); });
    expect(screen.getByRole('alertdialog')).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
  it('retains the last verified snapshot and draft when a refresh fails, and disables writes', async () => {
    const view = mount(); await createDraft(); mocks.expenses.mockRejectedValue(new Error('Expenses unavailable'));
    await act(async () => { await view.client.invalidateQueries(); });
    expect((await screen.findByRole('alert')).textContent).toContain('Expenses unavailable');
    expect(screen.getByRole('region', { name: 'SOV draft' })).toBeTruthy(); expect(lastForm().writesDisabled).toBe(true);
  });
  it('keeps a contract draft but disables its save while financial evidence is unavailable', async () => {
    const view = mount(); await screen.findByText('Proven a');
    fireEvent.click(screen.getByTitle('Edit contract details'));
    mocks.expenses.mockRejectedValue(new Error('Expense refresh failed'));
    await act(async () => { await view.client.invalidateQueries(); });
    await screen.findByRole('alert');
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    expect(mocks.projectUpdate).not.toHaveBeenCalled();
  });
});
