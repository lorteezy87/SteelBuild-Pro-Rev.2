// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SOV from "../../SOV";
import { setActiveOrgId } from '@/lib/activeOrg';

type DraftProps = { open: boolean; onSave: (payload: object) => Promise<unknown>; onRecover?: () => Promise<unknown>; requiresRecovery?: boolean; onClose: () => void; onDelete?: () => void; sov?: { id: string }; projects: object[] };
type ReviewProps = { open: boolean; onClose: () => void; onConfirm: (records: object[]) => Promise<void>; staged: Array<{ record: object; valid: boolean; importError?: string }>; receipts: object[]; importing: boolean; writesDisabled: boolean };
const mocks = vi.hoisted(() => ({
  orgId: "org-a" as string | null, projectId: "a" as string | null, loadingOrg: false,
  projects: vi.fn(), lines: vi.fn(), codes: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  forms: [] as DraftProps[], reviews: [] as ReviewProps[],
}));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => ({ currentOrg: mocks.orgId ? { id: mocks.orgId } : null, isLoadingOrgs: mocks.loadingOrg }) }));
vi.mock("@/components/shared/ProjectContext", () => ({ useProjectContext: (): { activeProject: { id: string; name: string } | null } => ({ activeProject: mocks.projectId ? { id: mocks.projectId, name: "Unproven context name" } : null }) }));
vi.mock("@/api/supabaseClient", () => ({ entities: {
  Project: { filterAll: mocks.projects, list: mocks.projects },
  SOVItem: { filterAll: mocks.lines, filter: mocks.lines, create: mocks.create, update: mocks.update, delete: mocks.remove },
  CostCode: { filterAll: mocks.codes, filter: mocks.codes },
} }));
vi.mock("@/services/permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: (): void => undefined }));
vi.mock("@/lib/textDecoding", () => ({ readFileText: async () => ({ text: "description,scheduled_value\nShop fabrication,1000\nField erection,2000" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/design-system", () => ({ BulkActionBar: (): null => null, Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button> }));
vi.mock("@/components/sov/SOVFormModal", () => ({ default: (props: DraftProps) => {
  if (!props.open) return null;
  mocks.forms.push(props);
  return <section aria-label="SOV draft"><pre>{JSON.stringify(props.projects)}</pre>
    <button onClick={() => { void (props.requiresRecovery ? props.onRecover!() : props.onSave({ project_id: mocks.projectId, description: "Erect steel", scheduled_value: 100 })).catch(() => {}); }}>Save line</button>
    <button onClick={props.onClose}>Close draft</button>
    {props.onDelete && <button onClick={props.onDelete}>Delete line</button>}
  </section>;
} }));
vi.mock("@/components/sov/SovImportReviewModal", () => ({ default: (props: ReviewProps) => {
  if (!props.open) return null; mocks.reviews.push(props);
  return <section aria-label="Import review"><pre>{JSON.stringify({ staged: props.staged, receipts: props.receipts })}</pre>
    <button disabled={props.importing || props.writesDisabled} onClick={() => { void props.onConfirm(props.staged.filter(row => row.valid).map(row => row.record)); }}>Commit import</button>
    <button onClick={props.onClose}>Close import</button>
  </section>;
} }));
vi.mock("../SovControlCenter", () => ({ default: ({ projectName, lines, onCreate, onOpenLine, onImport }: { projectName: string; lines: Array<{ id: string }>; onCreate?: () => void; onOpenLine: (line: object) => void; onImport?: () => void }) => <>
  <pre data-testid="summary">{JSON.stringify({ projectName, lines })}</pre>
  <button disabled={!onCreate} onClick={onCreate}>Create line</button>
  <button disabled={!onImport} onClick={onImport}>Import lines</button>
  {lines.map(line => <button key={line.id} onClick={() => onOpenLine(line)}>Edit {line.id}</button>)}
</> }));

const clients: QueryClient[] = [];
beforeEach(() => {
  setActiveOrgId(null); setActiveOrgId('org-a');
  vi.clearAllMocks(); mocks.orgId = "org-a"; mocks.projectId = "a"; mocks.loadingOrg = false; mocks.forms.length = 0; mocks.reviews.length = 0;
  mocks.projects.mockImplementation(async ({ id, org_id }: { id: string; org_id: string } = { id: "a", org_id: "org-a" }) => [{ id, org_id, name: `Proven ${id}` }]);
  mocks.lines.mockImplementation(async ({ project_id }: { project_id: string }) => [{ id: `${project_id}-line`, project_id, description: "Fabricate", scheduled_value: 200, status: "Draft", updated_at: "2026-10-07T10:00:00Z" }]);
  mocks.codes.mockResolvedValue([]);
  mocks.create.mockImplementation(async (payload: object) => ({ id: "created", ...payload }));
  mocks.update.mockResolvedValue({}); mocks.remove.mockResolvedValue({});
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
function mount(entry = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><SOV /></MemoryRouter></QueryClientProvider>;
  const view = render(tree()); return { ...view, client, refresh: () => view.rerender(tree()) };
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
const lastForm = () => mocks.forms[mocks.forms.length - 1];

describe("SOV financial workspace and draft boundary", () => {
  it("proves the URL project inside the active organization before reading complete financial sources", async () => {
    mount("/?projectId=url-project");
    const summary = await screen.findByTestId("summary");
    expect(mocks.projects).toHaveBeenCalledWith({ id: "url-project", org_id: "org-a" }, "id");
    expect(mocks.lines).toHaveBeenCalledWith({ project_id: "url-project" }, "id");
    expect(mocks.codes).toHaveBeenCalledWith({ project_id: "url-project" }, "id");
    expect(summary.textContent).toContain("Proven url-project");
    expect(summary.textContent).not.toContain("Unproven context");
  });
  it("starts no reads without a settled workspace", async () => {
    mocks.orgId = null; const view = mount();
    expect(mocks.projects).not.toHaveBeenCalled(); expect(mocks.lines).not.toHaveBeenCalled();
    mocks.orgId = "org-a"; mocks.loadingOrg = true; view.refresh();
    expect(mocks.projects).not.toHaveBeenCalled();
  });
  it("refuses a foreign project before reading financial rows", async () => {
    mocks.projects.mockResolvedValue([{ id: "a", org_id: "org-b" }]); mount();
    await screen.findByRole("alert"); expect(mocks.lines).not.toHaveBeenCalled(); expect(mocks.codes).not.toHaveBeenCalled();
  });
  it("does not publish empty or partial totals when cost-code evidence fails", async () => {
    mocks.codes.mockRejectedValue(new Error("Cost code access failed")); mount();
    expect((await screen.findByRole("alert")).textContent).toContain("Cost code access failed");
    expect(screen.queryByTestId("summary")).toBeNull();
  });
  it("retains the same operation identity after an ambiguous save and gives a new draft a new identity", async () => {
    mocks.create.mockRejectedValueOnce(Object.assign(new Error("Response lost"), { outcomeUnknown: true })); mount();
    fireEvent.click(await screen.findByRole("button", { name: "Create line" }));
    fireEvent.click(screen.getByRole("button", { name: "Save line" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const first = mocks.create.mock.calls[0][1].clientOperationId;
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    fireEvent.click(screen.getByRole("button", { name: "Save line" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1][1].clientOperationId).toBe(first);
    await waitFor(() => expect(screen.queryByRole("region", { name: "SOV draft" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Create line" })); fireEvent.click(screen.getByRole("button", { name: "Save line" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(3));
    expect(mocks.create.mock.calls[2][1].clientOperationId).not.toBe(first);
  });
  it.each(['close', 'remount'])("recovers the exact uncertain line after %s", async boundary => {
    mocks.create.mockRejectedValueOnce(Object.assign(new Error('Response lost'), { outcomeUnknown: true }));
    const view = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Create line' }));
    const original = lastForm();
    await act(async () => { await expect(original.onSave({ project_id: 'a', description: 'Original steel', scheduled_value: 800 })).rejects.toThrow('Response lost'); });
    if (boundary === 'remount') { view.unmount(); mount(); }
    else fireEvent.click(screen.getByRole('button', { name: 'Close draft' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create line' }));
    expect(lastForm().requiresRecovery).toBe(true);
    await act(async () => { await lastForm().onRecover!(); });
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  });
  it('recovers an in-flight line after navigating away before its reply', async () => {
    const request = deferred<object>(); mocks.create.mockReturnValueOnce(request.promise);
    const view = mount(); fireEvent.click(await screen.findByRole('button', { name: 'Create line' }));
    let pending!: Promise<unknown>;
    await act(async () => { pending = lastForm().onSave({ project_id: 'a', description: 'Pending steel', scheduled_value: 800 }); });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    view.unmount(); mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Create line' }));
    expect(lastForm().requiresRecovery).toBe(true);
    await act(async () => { await lastForm().onRecover!(); });
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
    await act(async () => { request.resolve({ id: 'one-line' }); await expect(pending).rejects.toThrow(/recover/i); });
  });
  it("refuses a retained draft after a two-workspace switch and after close/reopen", async () => {
    const view = mount(); fireEvent.click(await screen.findByRole("button", { name: "Create line" })); const old = lastForm();
    mocks.orgId = "org-b"; mocks.projectId = "b"; view.refresh(); await screen.findByText(/Proven b/);
    mocks.orgId = "org-a"; mocks.projectId = "a"; view.refresh(); await screen.findByText(/Proven a/);
    await waitFor(() => expect(screen.getByRole("button", { name: "Create line" })).not.toBeDisabled());
    await act(async () => { await expect(old.onSave({ project_id: "a" })).rejects.toThrow(/previous|changed|reopen/i); });
    fireEvent.click(screen.getByRole("button", { name: "Create line" })); const closed = lastForm(); fireEvent.click(screen.getByRole("button", { name: "Close draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Create line" }));
    await act(async () => { await expect(closed.onSave({ project_id: "a" })).rejects.toThrow(/previous|changed|reopen/i); });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects foreign payload projects and writes while evidence is invalidated before repaint", async () => {
    const view = mount(); fireEvent.click(await screen.findByRole("button", { name: "Create line" })); const draft = lastForm();
    await act(async () => { await expect(draft.onSave({ project_id: "b" })).rejects.toThrow(/project/i); });
    await act(async () => { void view.client.invalidateQueries({ queryKey: ["sov-items"], refetchType: "none" }); await expect(draft.onSave({ project_id: "a" })).rejects.toThrow(/evidence|refresh/i); });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps a newly opened editor when an earlier save finishes", async () => {
    const save = deferred<object>(); mocks.create.mockReturnValue(save.promise); mount();
    fireEvent.click(await screen.findByRole("button", { name: "Create line" })); fireEvent.click(screen.getByRole("button", { name: "Save line" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Close draft" })); fireEvent.click(screen.getByRole("button", { name: "Create line" }));
    await act(async () => { save.resolve({ id: "saved", project_id: "a" }); });
    expect(screen.getByRole("region", { name: "SOV draft" })).toBeTruthy();
  });
  it("keeps the real delete dialog pending and open on failure, then closes on successful retry", async () => {
    const remove = deferred<object>(); mocks.remove.mockReturnValueOnce(remove.promise); mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit a-line" })); fireEvent.click(screen.getByRole("button", { name: "Delete line" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("button", { name: "Deleting..." })).toBeDisabled();
    await act(async () => { remove.reject(new Error("Denied")); });
    expect(screen.getByRole("alertdialog")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
  it("updates only the owned row without moving or renumbering it", async () => {
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Edit a-line" }));
    const draft = lastForm();
    await act(async () => { await draft.onSave({ project_id: "a", description: "Fabricate revised steel", scheduled_value: 300, sov_id: "fake", line_item_number: 999 }); });
    expect(mocks.update).toHaveBeenCalledWith("a-line", { description: "Fabricate revised steel", scheduled_value: 300 }, { sovItemReview: { updatedAt: "2026-10-07T10:00:00Z" } });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps the displayed revision when a CO adjustment refreshes the open editor's evidence", async () => {
    const view = mount(); fireEvent.click(await screen.findByRole("button", { name: "Edit a-line" }));
    const originalDraft = lastForm();
    await act(async () => {
      view.client.setQueryData(["sov-items", "a", "evidence", "org-a"], {
        projectId: "a", orgId: "org-a", project: { id: "a", org_id: "org-a", name: "Proven a" }, costCodes: [],
        lines: [{ id: "a-line", project_id: "a", scheduled_value: 600, description: "Fabricate", updated_at: "2026-10-07T11:00:00Z" }],
      });
    });
    await act(async () => { await originalDraft.onSave({ project_id: "a", description: "Description edit", scheduled_value: 200 }); });
    expect(mocks.update).toHaveBeenCalledWith("a-line", expect.objectContaining({ scheduled_value: 200 }), {
      sovItemReview: { updatedAt: "2026-10-07T10:00:00Z" },
    });
  });
  it("recovers the exact attempted payload after an ambiguous create, even if a retained callback supplies edited values", async () => {
    mocks.create.mockRejectedValueOnce(Object.assign(new Error("Reply lost"), { outcomeUnknown: true })); mount();
    fireEvent.click(await screen.findByRole("button", { name: "Create line" }));
    const draft = lastForm();
    await act(async () => { await expect(draft.onSave({ project_id: "a", description: "Original erection", scheduled_value: 1000 })).rejects.toThrow("Reply lost"); });
    const recovery = lastForm(); expect(recovery.requiresRecovery).toBe(true);
    await act(async () => { await expect(draft.onSave({ project_id: "a", description: "Edited after lost reply", scheduled_value: 9999 })).rejects.toThrow(/recover/i); });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => { await recovery.onRecover!(); });
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  });
  it("keeps partial import failures and retries only those rows with the original identity", async () => {
    mocks.create.mockResolvedValueOnce({ id: "shop", project_id: "a", sov_id: "SOV-101" }).mockRejectedValueOnce(new Error("Response lost"))
      .mockResolvedValueOnce({ id: "field", project_id: "a", sov_id: "SOV-102" });
    const view = mount(); await screen.findByTestId("summary");
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["unused"], "sov.csv", { type: "text/csv" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.reviews[mocks.reviews.length - 1].staged).toHaveLength(1));
    const failedReview = mocks.reviews[mocks.reviews.length - 1]; expect(failedReview.receipts).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole("button", { name: "Commit import" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(3));
    expect(mocks.create.mock.calls[2][1]).toEqual(mocks.create.mock.calls[1][1]);
    expect(mocks.create.mock.calls[2][0].description).toBe("Field erection");
    expect(screen.getByRole("region", { name: "Import review" })).toBeTruthy();
  });
  it("recognizes saved and uncertain source rows when a partial file is uploaded again after navigation", async () => {
    mocks.create.mockResolvedValueOnce({ id: "shop", project_id: "a", sov_id: "SOV-101" })
      .mockRejectedValueOnce(Object.assign(new Error("Response lost"), { outcomeUnknown: true }))
      .mockResolvedValueOnce({ id: "field", project_id: "a", sov_id: "SOV-102" });
    const first = mount(); await screen.findByTestId("summary");
    fireEvent.change(first.container.querySelector('input[type="file"]')!, { target: { files: [new File(["unused"], "sov.csv")] } });
    fireEvent.click(await screen.findByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(mocks.reviews[mocks.reviews.length - 1].staged).toHaveLength(1));
    first.unmount();
    const reopened = mount(); await screen.findByTestId("summary");
    fireEvent.change(reopened.container.querySelector('input[type="file"]')!, { target: { files: [new File(["unused"], "sov.csv")] } });
    await screen.findByRole("button", { name: "Commit import" });
    const review = mocks.reviews[mocks.reviews.length - 1];
    expect(review.receipts).toEqual([expect.objectContaining({ id: "shop", sov_id: "SOV-101" })]);
    expect(review.staged.filter(row => row.valid)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(3));
    expect(mocks.create.mock.calls[2]).toEqual(mocks.create.mock.calls[1]);
  });
  it("stops the import queue after close even when the first write finishes later", async () => {
    const save = deferred<object>(); mocks.create.mockReturnValue(save.promise);
    const view = mount(); await screen.findByTestId("summary");
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["unused"], "sov.csv")] } });
    fireEvent.click(await screen.findByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Close import" }));
    await act(async () => { save.resolve({ id: "first", project_id: "a" }); });
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(screen.queryByRole("region", { name: "Import review" })).toBeNull();
  });
});
