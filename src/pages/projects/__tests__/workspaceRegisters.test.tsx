// @vitest-environment jsdom
import type { ComponentType, ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import Projects from "../../Projects";
import RFIs from "../../RFIs";

const mocks = vi.hoisted(() => ({
  orgId: "org-a" as string | null, loadingOrg: false,
  projects: vi.fn(), rows: vi.fn(), createProject: vi.fn(), createRfi: vi.fn(),
  removeProject: vi.fn(), number: vi.fn(),
  projectSaves: [] as Array<(data: object) => void>,
  rfiSaves: [] as Array<(data: object) => Promise<void>>,
}));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => ({ currentOrg: mocks.orgId ? { id: mocks.orgId } : null, isLoadingOrgs: mocks.loadingOrg }) }));
vi.mock("@/components/shared/ProjectContext", () => ({ useProjectContext: () => ({ activeProject: null as null, removeProject: mocks.removeProject }) }));
vi.mock("../projectQueries", () => ({ fetchProjectRegister: mocks.projects }));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Project: { listAll: mocks.projects, filterAll: mocks.projects, create: mocks.createProject },
    ...Object.fromEntries(["WorkPackage", "RFI", "ChangeOrder", "ScheduleTask", "Alert"].map(name => [name, {
      listAll: (...args: unknown[]) => mocks.rows(name, ...args),
      filter: (...args: unknown[]) => mocks.rows(name, ...args),
      filterAll: (...args: unknown[]) => mocks.rows(name, ...args),
      create: mocks.createRfi,
    }])),
  }, auth: {}, integrations: {},
}));
vi.mock("@/hooks/usePlan", () => ({ usePlan: () => ({ plan: { limits: { projects: 100 } } }) }));
vi.mock("@/hooks/useProjectRole", () => ({ useProjectRole: () => ({ role: "admin", isLoading: false }), roleAtLeast: () => true }));
vi.mock("@/services/permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: (): void => {} }));
vi.mock("@/lib/projectTemplates", () => ({ applyProjectTemplate: vi.fn() }));
vi.mock("@/lib/rfiPieceHolds", () => ({ releaseHoldsForRfiMarks: vi.fn() }));
vi.mock("@/components/shared/numberSequencing", () => ({ getNextFormattedNumber: mocks.number }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn() } }));
vi.mock("@/components/design-system", () => ({ BulkActionBar: (): null => null }));
vi.mock("@/components/shared/SecureDeleteDialog", () => ({ default: (): null => null }));
vi.mock("@/components/shared/DeleteDialog", () => ({ default: (): null => null }));
vi.mock("@/components/projects/ProjectDetailView", () => ({ default: (): null => null }));
vi.mock("../../rfis/RfiDetailModal", () => ({ default: (): null => null }));
vi.mock("../../rfis/NudgeDraftModal", () => ({ default: (): null => null }));
vi.mock("@/components/rfis/RfiLogImportModal", () => ({ default: (): null => null }));
vi.mock("@/components/rfis/RfiBulkEditModal", () => ({ default: (): null => null }));
vi.mock("@/components/rfis/RFIFormModal", () => ({ default: ({ onSave }: { onSave: (data: object) => Promise<void> }) => {
  mocks.rfiSaves.push(onSave);
  return <section aria-label="RFI draft"><button onClick={() => { void onSave({ title: "New query" }); }}>Save RFI</button></section>;
} }));
vi.mock("@/components/projects/ProjectFormModal", () => ({ default: ({ onSave }: { onSave: (data: object) => void }) => {
  mocks.projectSaves.push(onSave);
  return <section aria-label="Project draft"><button onClick={() => onSave({ name: "New job" })}>Save project</button></section>;
} }));
type ProjectControlProps = { projects: object[]; workPackages: object[]; rfis: object[]; changeOrders: object[]; scheduleTasks: object[]; onCreate?: () => void };
vi.mock("../ProjectsControlCenter", () => ({ default: ({ onCreate, ...rows }: ProjectControlProps) => <>
  <pre data-testid="summary">{JSON.stringify(rows)}</pre><button disabled={!onCreate} onClick={onCreate}>Create project</button>
</> }));
type RfiControlProps = { rfis: object[]; projectName: string; portfolioProjectCount: number; percentComplete: number | null; loadError: string | null; modals: ReactNode; onCreate?: () => void };
vi.mock("../../rfis/RfiControlCenter", () => ({ default: ({ rfis, projectName, portfolioProjectCount, percentComplete, loadError, modals, onCreate }: RfiControlProps) => <>
  <pre data-testid="summary">{JSON.stringify({ rfis, projectName, portfolioProjectCount, percentComplete, loadError })}</pre>{modals}
  <button disabled={!onCreate} onClick={onCreate}>Create RFI</button>
</> }));

const fixtures = [
  { id: "a", org_id: "org-a", name: "Alpha", original_contract_value: 100 },
  { id: "hold", org_id: "org-a", name: "Paused", on_hold: true },
  { id: "b", org_id: "org-b", name: "Beta", original_contract_value: 90000 },
];
const rows = [
  { id: "a-row", project_id: "a", title: "Alpha query", status: "Open", submitted_date: "2026-10-07", total_budget: 100 },
  { id: "hold-row", project_id: "hold", title: "Paused query", status: "Open" },
  { id: "b-row", project_id: "b", title: "Beta query", status: "Open", total_budget: 90000 },
];
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.clearAllMocks(); mocks.orgId = "org-a"; mocks.loadingOrg = false;
  mocks.projectSaves.length = 0; mocks.rfiSaves.length = 0;
  mocks.projects.mockResolvedValue(fixtures); mocks.rows.mockResolvedValue(rows);
  mocks.createProject.mockImplementation(async (data: object) => ({ id: "new-a", ...data }));
  mocks.number.mockResolvedValue("RFI #001");
  mocks.createRfi.mockImplementation(async (data: object) => ({ id: "new-rfi-a", ...data }));
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
function mount(Surface: ComponentType, entry = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><Surface /></MemoryRouter></QueryClientProvider>;
  const view = render(tree());
  return { ...view, client, refresh: () => view.rerender(tree()) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe.each([{ name: "Projects", Surface: Projects, ids: ["a", "hold"] }, { name: "RFIs", Surface: RFIs, ids: ["a"] }])("$name active workspace", ({ Surface, name, ids }) => {
  it("restricts complete child reads to proven owned projects and preserves the intended on-hold policy", async () => {
    mount(Surface);
    const summary = await screen.findByTestId("summary");
    expect(mocks.projects).toHaveBeenCalledWith(name === "Projects" ? "org-a" : { org_id: "org-a" });
    for (const [entity, conditions] of mocks.rows.mock.calls) {
      if (entity !== "Alert") expect(conditions).toEqual({ project_id: ids });
    }
    expect(summary.textContent).toContain("a-row");
    expect(summary.textContent).not.toContain("b-row");
    expect(summary.textContent?.includes("hold-row")).toBe(name === "Projects");
  });
  it("starts no child reads until project ownership resolves", async () => {
    mocks.projects.mockReturnValue(new Promise(() => {}));
    mount(Surface);
    await waitFor(() => expect(mocks.projects).toHaveBeenCalled());
    expect(mocks.rows).not.toHaveBeenCalled(); expect(screen.queryByTestId("summary")).toBeNull();
  });
  it("accepts an empty workspace without broadening its child queries", async () => {
    mocks.projects.mockResolvedValue([]);
    mount(Surface);
    await screen.findByTestId("summary");
    expect(mocks.rows).not.toHaveBeenCalled();
    expect(screen.getByTestId("summary").textContent).not.toContain("a-row");
  });
  it("does not start child reads when the project register fails", async () => {
    mocks.projects.mockRejectedValue(new Error("Project ownership unavailable"));
    mount(Surface);
    await screen.findByRole("alert");
    expect(mocks.rows).not.toHaveBeenCalled();
    expect(screen.queryByTestId("summary")).toBeNull();
  });
  it("retries failed child evidence before restoring metrics", async () => {
    mocks.rows.mockRejectedValue(new Error("Read unavailable"));
    mount(Surface);
    await screen.findByRole("alert");
    mocks.rows.mockResolvedValue(rows);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByTestId("summary");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it.each(["no workspace", "workspace cache gate"])("does not read while there is %s", state => {
    if (state === "no workspace") mocks.orgId = null; else mocks.loadingOrg = true;
    mount(Surface);
    expect(mocks.projects).not.toHaveBeenCalled(); expect(mocks.rows).not.toHaveBeenCalled();
    expect(screen.queryByTestId("summary")).toBeNull();
  });
  it("does not let a delayed old-workspace response replace the new workspace", async () => {
    const old = deferred<typeof rows>();
    mocks.rows.mockImplementation((_entity: string, conditions: { project_id: string[] }) => conditions?.project_id?.includes("b") ? Promise.resolve(rows) : old.promise);
    const view = mount(Surface);
    await waitFor(() => expect(mocks.rows).toHaveBeenCalled());
    mocks.orgId = "org-b"; view.refresh();
    await waitFor(() => expect(screen.getByTestId("summary").textContent).toContain("b-row"));
    await act(async () => old.resolve(rows));
    expect(screen.getByTestId("summary").textContent).not.toContain("a-row");
  });
  it.each(name === "Projects" ? ["WorkPackage", "RFI", "ChangeOrder", "ScheduleTask"] : ["WorkPackage", "RFI", "ScheduleTask"])("does not publish zero or partial metrics after %s fails", async failed => {
    mocks.rows.mockImplementation((entity: string) => entity === failed ? Promise.reject(new Error("Unavailable child records")) : Promise.resolve(rows));
    mount(Surface);
    await screen.findByRole("alert");
    expect(screen.queryByTestId("summary")).toBeNull();
  });
});

it("rejects an old project draft after switching away and returning to its workspace", async () => {
  const view = mount(Projects);
  fireEvent.click(await screen.findByRole("button", { name: "Create project" }));
  const save = mocks.projectSaves.at(-1)!;
  mocks.orgId = "org-b"; view.refresh(); await screen.findByTestId("summary");
  mocks.orgId = "org-a"; view.refresh(); await screen.findByTestId("summary");
  await act(async () => { save({ name: "Discarded draft" }); });
  expect(mocks.createProject).not.toHaveBeenCalled();
});
it("rejects a retained project save after leaving the page", async () => {
  const view = mount(Projects);
  fireEvent.click(await screen.findByRole("button", { name: "Create project" }));
  const save = mocks.projectSaves.at(-1)!;
  view.unmount();
  await act(async () => { save({ name: "Abandoned project draft" }); });
  expect(mocks.createProject).not.toHaveBeenCalled();
});

it("rejects an old RFI draft after switching away and returning to its workspace", async () => {
  const view = mount(RFIs, "/RFIs?projectId=a");
  fireEvent.click(await screen.findByRole("button", { name: "Create RFI" }));
  const save = mocks.rfiSaves.at(-1)!;
  mocks.orgId = "org-b"; view.refresh(); await screen.findByRole("alert");
  mocks.orgId = "org-a"; view.refresh(); await screen.findByTestId("summary");
  await act(async () => { await save({ title: "Discarded draft" }); });
  expect(mocks.number).not.toHaveBeenCalled();
  expect(mocks.createRfi).not.toHaveBeenCalled();
});
it("rejects a retained RFI save after leaving the page", async () => {
  const view = mount(RFIs, "/RFIs?projectId=a");
  fireEvent.click(await screen.findByRole("button", { name: "Create RFI" }));
  const save = mocks.rfiSaves.at(-1)!;
  view.unmount();
  await act(async () => { await save({ title: "Abandoned RFI draft" }); });
  expect(mocks.number).not.toHaveBeenCalled(); expect(mocks.createRfi).not.toHaveBeenCalled();
});

it("blocks an RFI save against invalidated evidence before the disabled UI rerenders", async () => {
  const view = mount(RFIs, "/RFIs?projectId=a");
  fireEvent.click(await screen.findByRole("button", { name: "Create RFI" }));
  const save = mocks.rfiSaves.at(-1)!;
  await act(async () => {
    await view.client.invalidateQueries({ queryKey: ["rfis"], refetchType: "none" });
    await save({ title: "Do not use stale evidence" });
  });
  expect(mocks.number).not.toHaveBeenCalled();
  expect(mocks.createRfi).not.toHaveBeenCalled();
});

it("keeps a late RFI create in its original workspace cache", async () => {
  const pending = deferred<object>(); mocks.createRfi.mockReturnValue(pending.promise);
  const view = mount(RFIs, "/RFIs?projectId=a");
  fireEvent.click(await screen.findByRole("button", { name: "Create RFI" }));
  fireEvent.click(screen.getByRole("button", { name: "Save RFI" }));
  await waitFor(() => expect(mocks.createRfi).toHaveBeenCalledWith(expect.objectContaining({ project_id: "a" })));
  mocks.orgId = "org-b"; view.refresh(); await screen.findByRole("alert");
  const otherKey = ["rfis", "b", "org-b", ["b"]];
  view.client.setQueryData(otherKey, [{ id: "b-rfi", project_id: "b" }]);
  await act(async () => { pending.resolve({ id: "created-a", project_id: "a", title: "New query" }); });
  expect(view.client.getQueryData(otherKey)).toEqual([{ id: "b-rfi", project_id: "b" }]);
  expect(view.client.getQueryData(["rfis", "a", "org-a", ["a"]])).toEqual(expect.arrayContaining([expect.objectContaining({ id: "created-a", project_id: "a" })]));
});

it("refuses an RFI URL for another workspace before any child query or create flow", async () => {
  mount(RFIs, "/RFIs?projectId=b&new=1");
  await screen.findByRole("alert");
  expect(mocks.rows).not.toHaveBeenCalled(); expect(screen.queryByTestId("summary")).toBeNull();
});
it("keeps the new workspace draft open when an old project creation completes", async () => {
  const pending = deferred<object>(); mocks.createProject.mockReturnValue(pending.promise);
  const view = mount(Projects);
  fireEvent.click(await screen.findByRole("button", { name: "Create project" }));
  fireEvent.click(screen.getByRole("button", { name: "Save project" }));
  await waitFor(() => expect(mocks.createProject).toHaveBeenCalledWith(expect.objectContaining({ org_id: "org-a" })));
  mocks.orgId = "org-b"; view.refresh();
  await waitFor(() => expect(screen.queryByRole("region", { name: "Project draft" })).toBeNull());
  fireEvent.click(await screen.findByRole("button", { name: "Create project" }));
  await act(async () => pending.resolve({ id: "new-a", org_id: "org-a", name: "New job" }));
  expect(screen.getByRole("region", { name: "Project draft" })).toBeInTheDocument();
});
