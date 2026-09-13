// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PayApplications from '@/pages/PayApplications';
const fixture = vi.hoisted(() => ({ project: { id: 'project-a', name: 'A' }, contract: vi.fn(), create: vi.fn() }));
vi.mock('@/components/shared/ProjectContext', () => ({ useProjectContext: () => ({ activeProject: fixture.project }) }));
vi.mock('@/services/auditLogger', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/payapp/repository', () => ({
  getPayAppContract: fixture.contract, createPayApplication: fixture.create,
  listPayApplications: vi.fn(async () => []), listSovItems: vi.fn(async () => [{ id: 'sov-1' }]),
  listPayAppChangeOrders: vi.fn(async () => []), listLines: vi.fn(async () => []),
  softDeletePayApplication: vi.fn(), updateLine: vi.fn(), updatePayApplication: vi.fn(),
}));
vi.mock('../PayApplicationsControlCenter', () => ({ default: ({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) =>
  <button disabled={!canCreate} onClick={onCreate}>New Application</button>,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); fixture.project = { id: 'project-a', name: 'A' }; });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const tree = () => <QueryClientProvider client={client}><PayApplications /></QueryClientProvider>;
  return { ...render(tree()), tree };
}
it('initializes retainage after the delayed contract read and resets a cancelled draft', async () => {
  let resolveContract!: (value: { original_contract_value: number; retainage_percent: number }) => void;
  fixture.contract.mockImplementationOnce(() => new Promise(resolve => { resolveContract = resolve; }));
  mount();
  expect(await screen.findByRole('button', { name: 'New Application' })).toBeDisabled();
  await act(async () => resolveContract({ original_contract_value: 100000, retainage_percent: 10 }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Application' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'New Application' }));
  expect(screen.getByRole('spinbutton')).toHaveValue(10);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'New Application' }));
  expect(screen.getByRole('spinbutton')).toHaveValue(10);
});
it('closes the previous project draft before the next project can create', async () => {
  fixture.contract.mockImplementation(async (id: string) => ({ original_contract_value: 100000, retainage_percent: id === 'project-a' ? 10 : 5 }));
  const app = mount();
  await screen.findByRole('button', { name: 'New Application' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Application' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'New Application' }));
  expect(await screen.findByRole('dialog')).toBeVisible();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } });
  fixture.project = { id: 'project-b', name: 'B' };
  app.rerender(app.tree());
  await screen.findByRole('button', { name: 'New Application' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Application' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'New Application' }));
  expect(screen.getByRole('spinbutton')).toHaveValue(5);
  expect(fixture.create).not.toHaveBeenCalled();
});
