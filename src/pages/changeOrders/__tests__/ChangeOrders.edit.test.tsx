// @vitest-environment jsdom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setActiveOrgId } from '@/lib/activeOrg';
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changeOrderFilter: vi.fn(),
  changeOrderUpdate: vi.fn(),
  changeOrderDelete: vi.fn(),
  changeOrderCreate: vi.fn(),
  projectGet: vi.fn(),
  sovFilter: vi.fn(),
  rfiFilter: vi.fn(),
  projectId: 'project-1',
  orgId: 'org-1',
  save: null as null | ((data: Record<string, unknown>) => Promise<unknown> | undefined),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    ChangeOrder: {
      filter: mocks.changeOrderFilter,
      filterAll: mocks.changeOrderFilter,
      create: mocks.changeOrderCreate,
      update: mocks.changeOrderUpdate,
      delete: mocks.changeOrderDelete,
    },
    Project: {
      get: mocks.projectGet,
      list: vi.fn().mockResolvedValue([
        { id: "project-1", name: "Test Project", original_contract_value: 100000 },
      ]),
    },
    SOVItem: { filter: mocks.sovFilter, filterAll: mocks.sovFilter },
    RFI: { filter: mocks.rfiFilter, filterAll: mocks.rfiFilter },
  },
}));

vi.mock("@/hooks/useProjectId", () => ({
  useProjectId: () => mocks.projectId,
}));
vi.mock('@/components/shared/OrgContext', () => ({ useOrg: () => ({ currentOrg: { id: mocks.orgId }, isLoadingOrgs: false }) }));

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({
    activeProject: { id: "project-1", name: "Test Project" },
  }),
}));

vi.mock("@/hooks/useRealtimeInvalidation", () => ({
  useRealtimeInvalidation: (): undefined => undefined,
}));

vi.mock("@/hooks/useAutoOpenCreate", () => ({
  useAutoOpenCreate: (): undefined => undefined,
}));

vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock("@/components/changeorders/COFormModal", () => ({
  default: ({ open, onSave, onDelete, onClose, co, prefill, isSaving, writesDisabled }: any) => {
    if (open) mocks.save = onSave;
    return (
    open ? (
      <div data-testid="co-form">
        <span>{co?.title}</span>
        <button
          disabled={isSaving || writesDisabled}
          onClick={() => onSave({
            ...co,
            ...(!co ? prefill : {}),
            title: "Updated title",
            co_amount: 25000,
          })}
        >
          {isSaving ? "Saving…" : "Update"}
        </button>
        <button onClick={onClose}>Close editor</button>
        {onDelete ? <button onClick={() => onDelete(co)}>Delete change order</button> : null}
      </div>
    ) : null
  ); },
}));

vi.mock("@/components/changeorders/ChangeOrderImportModal", () => ({
  default: (): null => null,
}));


vi.mock("@/components/shared/LoadingSkeleton", () => ({
  default: (): null => null,
}));

vi.mock("@/components/shared/ListTruncationNotice", () => ({
  default: (): null => null,
}));

vi.mock("@/components/design-system", () => ({
  BulkActionBar: ({ count, actions }: any) => count ? <div>{actions.map((action: any) => <button key={action.label} disabled={action.disabled} onClick={action.onClick}>{action.label}</button>)}</div> : null,
}));

vi.mock("@/pages/changeOrders/CoControlCenter", () => ({
  default: ({ cos, onOpenCo, onDeleteCo, onCreate, onToggleAll }: any) => (
    <>
      <button onClick={() => onOpenCo(cos[0])}>Open change order</button>
      {onCreate && <button onClick={onCreate}>New change order</button>}
      <button onClick={() => onToggleAll(true)}>Select all change orders</button>
      {onDeleteCo ? (
        <button
          aria-label={`Delete ${cos[0]?.co_number || "change order"}`}
          onClick={() => onDeleteCo(cos[0])}
        >
          Delete change order
        </button>
      ) : null}
    </>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

import ChangeOrders from "@/pages/ChangeOrders";

describe("ChangeOrders edit", () => {
  beforeEach(() => {
    setActiveOrgId(null); setActiveOrgId('org-1');
    vi.clearAllMocks();
    mocks.projectId = 'project-1';
    mocks.orgId = 'org-1';
    mocks.save = null;
    mocks.projectGet.mockImplementation(async (id: string) => ({ id, org_id: mocks.orgId, name: 'Test Project', original_contract_value: 100000 }));
    mocks.sovFilter.mockResolvedValue([]);
    mocks.rfiFilter.mockResolvedValue([]);
  });

  it("submits the selected row id and keeps the form open until update succeeds", async () => {
    const user = userEvent.setup();
    const existing = {
      id: "co-1",
      project_id: "project-1",
      co_number: "CO #001",
      title: "Original title",
      status: "Draft",
      co_amount: 10000,
    };
    mocks.changeOrderFilter.mockResolvedValue([existing]);

    let resolveUpdate: (value: unknown) => void;
    mocks.changeOrderUpdate.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChangeOrders />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Open change order" }));
    expect(screen.getByText("Original title")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(mocks.changeOrderUpdate).toHaveBeenCalledWith("co-1", {
      ...existing,
      title: "Updated title",
      co_amount: 25000,
    }, { changeOrderReview: { updatedAt: null, status: 'Draft', amount: 10000 } });
    expect(screen.getByTestId("co-form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();

    resolveUpdate!({
      ...existing,
      title: "Updated title",
      co_amount: 25000,
    });

    await waitFor(() => {
      expect(screen.queryByTestId("co-form")).not.toBeInTheDocument();
    });
  });

  it("opens archive confirmation from the control center and clears it after delete succeeds", async () => {
    const user = userEvent.setup();
    const existing = {
      id: "co-1",
      project_id: "project-1",
      co_number: "CO #001",
      title: "Delete this CO",
      status: "Draft",
      co_amount: 10000,
    };
    mocks.changeOrderFilter.mockResolvedValue([existing]);

    let resolveDelete: (value: unknown) => void;
    mocks.changeOrderDelete.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChangeOrders />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Delete CO #001" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(mocks.changeOrderDelete).toHaveBeenCalledWith("co-1");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled();

    resolveDelete!({ success: true });

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it('keeps the real archive confirmation open when the archive request fails', async () => {
    mocks.changeOrderFilter.mockResolvedValue([{ id: 'co-1', project_id: 'project-1', co_number: 'CO-001', status: 'Draft' }]);
    mocks.changeOrderDelete.mockRejectedValue(new Error('Archive denied'));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete CO-001' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.changeOrderDelete).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('creates directly through the authoritative create operation with the selected project', async () => {
    mocks.changeOrderFilter.mockResolvedValue([]);
    mocks.changeOrderCreate.mockResolvedValue({ id: 'new-co', project_id: 'project-1', status: 'Draft' });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'New change order' }));
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(mocks.changeOrderCreate).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'project-1', title: 'Updated title' }), { clientOperationId: expect.any(String) }));
    expect(mocks.changeOrderCreate.mock.calls[0][0]).not.toHaveProperty('co_number');
  });

  it('returns the failed save to the editor so it can display the error and retain the draft', async () => {
    mocks.changeOrderFilter.mockResolvedValue([]);
    mocks.changeOrderCreate.mockRejectedValue(new Error('Commercial save unavailable'));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'New change order' }));
    await act(async () => {
      await expect(mocks.save!({ project_id: 'project-1', title: 'Connection plates' })).rejects.toThrow('Commercial save unavailable');
    });
    expect(screen.getByTestId('co-form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeEnabled();
  });

  it('recovers the original uncertain create with its unchanged payload and operation identity', async () => {
    mocks.changeOrderFilter.mockResolvedValue([]);
    mocks.changeOrderCreate.mockRejectedValueOnce(Object.assign(new Error('Response lost'), { outcomeUnknown: true }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'New change order' }));
    await act(async () => { await expect(mocks.save!({ project_id: 'project-1', title: 'Original plates', co_amount: 1200 })).rejects.toThrow('Response lost'); });
    mocks.changeOrderCreate.mockResolvedValue({ id: 'original-record', project_id: 'project-1' });
    await act(async () => { await mocks.save!({ project_id: 'project-1', title: 'Changed plates', co_amount: 2400 }); });
    expect(mocks.changeOrderCreate.mock.calls[1]).toEqual(mocks.changeOrderCreate.mock.calls[0]);
    expect(mocks.changeOrderCreate.mock.calls[1][0]).toMatchObject({ title: 'Original plates', co_amount: 1200 });
  });

  it.each(['close', 'remount'])('retains an uncertain create after %s', async boundary => {
    mocks.changeOrderFilter.mockResolvedValue([]);
    mocks.changeOrderCreate.mockRejectedValueOnce(Object.assign(new Error('Response lost'), { outcomeUnknown: true }));
    const user = userEvent.setup();
    const view = renderPage();
    await user.click(await screen.findByRole('button', { name: 'New change order' }));
    await act(async () => { await expect(mocks.save!({ project_id: 'project-1', title: 'Original plates', co_amount: 1200 })).rejects.toThrow('Response lost'); });
    if (boundary === 'remount') { view.unmount(); renderPage(); }
    else await user.click(screen.getByRole('button', { name: 'Close editor' }));
    await user.click(await screen.findByRole('button', { name: 'New change order' }));
    mocks.changeOrderCreate.mockResolvedValue({ id: 'original-record', project_id: 'project-1' });
    await act(async () => { await mocks.save!({ project_id: 'project-1', title: 'Changed plates', co_amount: 2400 }); });
    expect(mocks.changeOrderCreate.mock.calls[1]).toEqual(mocks.changeOrderCreate.mock.calls[0]);
  });

  it('reuses the pending operation after navigating away before its reply', async () => {
    mocks.changeOrderFilter.mockResolvedValue([]);
    let finish!: (value: unknown) => void;
    mocks.changeOrderCreate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup(); const view = renderPage();
    await user.click(await screen.findByRole('button', { name: 'New change order' }));
    let pending!: Promise<unknown>;
    await act(async () => { pending = mocks.save!({ project_id: 'project-1', title: 'Pending plates', co_amount: 1200 })!; });
    await waitFor(() => expect(mocks.changeOrderCreate).toHaveBeenCalledTimes(1));
    view.unmount(); renderPage();
    await user.click(await screen.findByRole('button', { name: 'New change order' }));
    mocks.changeOrderCreate.mockResolvedValue({ id: 'one-record', project_id: 'project-1' });
    await act(async () => { await mocks.save!({ project_id: 'project-1', title: 'Replacement', co_amount: 999 }); });
    expect(mocks.changeOrderCreate.mock.calls[1]).toEqual(mocks.changeOrderCreate.mock.calls[0]);
    await act(async () => { finish({ id: 'one-record', project_id: 'project-1' }); await expect(pending).rejects.toThrow(/recover/i); });
  });

  it('refuses a project from another workspace before any commercial reads', async () => {
    mocks.projectGet.mockResolvedValue({ id: 'project-1', org_id: 'foreign-org' });
    mocks.changeOrderFilter.mockResolvedValue([]);
    renderPage();
    await screen.findByText(/outside.*workspace/i);
    expect(mocks.changeOrderFilter).not.toHaveBeenCalled();
    expect(mocks.sovFilter).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'New change order' })).not.toBeInTheDocument();
  });

  it('does not present a zero contract or writable approval form after an SOV read fails', async () => {
    mocks.changeOrderFilter.mockResolvedValue([]);
    mocks.sovFilter.mockRejectedValue(new Error('SOV unavailable'));
    renderPage();
    await screen.findByText(/SOV unavailable/);
    expect(screen.queryByRole('button', { name: 'New change order' })).not.toBeInTheDocument();
  });

  it('retains a newer editor when an earlier save finishes', async () => {
    const existing = { id: 'co-1', project_id: 'project-1', co_number: 'CO-001', title: 'Old editor', status: 'Draft', co_amount: 100 };
    mocks.changeOrderFilter.mockResolvedValue([existing]);
    let finish!: (value: unknown) => void;
    mocks.changeOrderUpdate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Open change order' }));
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await user.click(screen.getByRole('button', { name: 'Close editor' }));
    await user.click(screen.getByRole('button', { name: 'New change order' }));
    await act(async () => { finish({ ...existing, title: 'Updated title' }); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update' })).toBeEnabled());
    expect(screen.getByTestId('co-form')).toBeInTheDocument();
  });

  it('checks invalidation at the actual write boundary before the page repaints', async () => {
    mocks.changeOrderFilter.mockResolvedValue([{ id: 'co-1', project_id: 'project-1', title: 'Existing', status: 'Draft' }]);
    const user = userEvent.setup();
    const { queryClient } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Open change order' }));
    const save = mocks.save!;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['change-orders', 'project-1'], refetchType: 'none' });
      await expect(save({ project_id: 'project-1', title: 'Must not write' })).rejects.toThrow(/evidence|refresh/i);
    });
    expect(mocks.changeOrderUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId('co-form')).toBeInTheDocument();
  });

  it('retains the last complete financial register and draft while refresh evidence fails', async () => {
    mocks.changeOrderFilter.mockResolvedValue([{ id: 'co-1', project_id: 'project-1', title: 'Existing', status: 'Draft' }]);
    const user = userEvent.setup();
    const { queryClient } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Open change order' }));
    mocks.sovFilter.mockRejectedValue(new Error('SOV refresh failed'));
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['change-orders', 'project-1'] }); });
    await screen.findByText(/Showing the last complete register/);
    expect(screen.getByTestId('co-form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
    expect(mocks.changeOrderUpdate).not.toHaveBeenCalled();
  });

  it('rejects an abandoned callback even after returning to the original project', async () => {
    mocks.changeOrderFilter.mockImplementation(async ({ project_id }: { project_id: string }) => [{ id: 'co-1', project_id, title: 'Existing', status: 'Draft' }]);
    const user = userEvent.setup();
    const { rerenderPage } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Open change order' }));
    const abandonedSave = mocks.save!;
    mocks.projectId = 'project-2'; rerenderPage();
    await screen.findByRole('button', { name: 'Open change order' });
    mocks.projectId = 'project-1'; rerenderPage();
    await user.click(await screen.findByRole('button', { name: 'Open change order' }));
    await act(async () => abandonedSave({ project_id: 'project-1', title: 'Abandoned editor' }));
    expect(mocks.changeOrderUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId('co-form')).toBeInTheDocument();
  });

  it('invalidates the SOV after a lifecycle update so contract lines cannot remain stale', async () => {
    const existing = { id: 'co-1', project_id: 'project-1', title: 'Existing', status: 'Draft' };
    mocks.changeOrderFilter.mockResolvedValue([existing]);
    mocks.changeOrderUpdate.mockResolvedValue({ ...existing, title: 'Updated title' });
    const user = userEvent.setup();
    const { queryClient } = renderPage();
    queryClient.setQueryData(['sov-items', 'project-1'], [{ id: 'sov-1', scheduled_value: 1000 }]);
    await user.click(await screen.findByRole('button', { name: 'Open change order' }));
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(screen.queryByTestId('co-form')).not.toBeInTheDocument());
    expect(queryClient.getQueryState(['sov-items', 'project-1'])?.isInvalidated).toBe(true);
  });

  it('binds bulk approval to the value shown when review opened even after a refresh', async () => {
    const original = { id: 'co-1', project_id: 'project-1', co_number: 'CO-001', status: 'Submitted', co_amount: 1200, updated_at: '2026-10-07T11:00:00Z' };
    mocks.changeOrderFilter.mockResolvedValue([original]);
    mocks.changeOrderUpdate.mockRejectedValue(new Error('Change order changed after your review. Reopen it.'));
    const user = userEvent.setup();
    const { queryClient } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Select all change orders' }));
    await user.click(screen.getByRole('button', { name: 'APPROVE' }));
    await user.type(screen.getByLabelText('Approved By'), 'GC representative');
    await user.selectOptions(screen.getByLabelText('SOV treatment'), 'none');
    mocks.changeOrderFilter.mockResolvedValue([{ ...original, co_amount: 12000, updated_at: '2026-10-07T11:05:00Z' }]);
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['change-orders', 'project-1'] }); });
    expect(screen.getByLabelText('Total approval value')).toHaveTextContent('$1,200.00');
    await user.click(screen.getByRole('button', { name: 'Approve 1 change order' }));
    await waitFor(() => expect(mocks.changeOrderUpdate).toHaveBeenCalledWith('co-1', expect.objectContaining({ status: 'Approved', approved_by: 'GC representative', sov_mode: 'none' }), { changeOrderReview: { amount: 1200, status: 'Submitted', updatedAt: '2026-10-07T11:00:00Z' } }));
    await screen.findByText(/1 change order\(s\) still need attention/);
    expect(screen.getByLabelText('Approved By')).toHaveValue('GC representative');
  });

  it('applies additions before deducts when multiple approvals adjust one SOV line', async () => {
    const deduct = { id: 'deduct', project_id: 'project-1', co_number: 'CO-001', status: 'Submitted', co_amount: -500 };
    const addition = { id: 'addition', project_id: 'project-1', co_number: 'CO-002', status: 'Submitted', co_amount: 1000 };
    mocks.changeOrderFilter.mockResolvedValue([deduct, addition]);
    mocks.sovFilter.mockResolvedValue([{ id: 'sov-1', project_id: 'project-1', line_item_number: 1, description: 'Steel' }]);
    let finish!: (value: unknown) => void;
    mocks.changeOrderUpdate.mockImplementation((id: string) => id === 'addition' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ ...deduct, status: 'Approved' }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Select all change orders' }));
    await user.click(screen.getByRole('button', { name: 'APPROVE' }));
    await user.type(screen.getByLabelText('Approved By'), 'GC');
    await user.selectOptions(screen.getByLabelText('SOV treatment'), 'adjust_line');
    await user.selectOptions(screen.getByLabelText('Existing SOV line'), 'sov-1');
    await user.click(screen.getByRole('button', { name: 'Approve 2 change orders' }));
    expect(mocks.changeOrderUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.changeOrderUpdate.mock.calls[0][0]).toBe('addition');
    await act(async () => { finish({ ...addition, status: 'Approved' }); });
    await waitFor(() => expect(mocks.changeOrderUpdate).toHaveBeenCalledTimes(2));
    expect(mocks.changeOrderUpdate.mock.calls[1][0]).toBe('deduct');
  });
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={queryClient}><MemoryRouter><ChangeOrders /></MemoryRouter></QueryClientProvider>;
  const view = render(tree());
  return { ...view, queryClient, rerenderPage: () => view.rerender(tree()) };
}
