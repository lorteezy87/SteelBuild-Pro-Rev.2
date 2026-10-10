// @vitest-environment jsdom
import React from "react";
import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectId: "project-a" as string | null,
  orgId: "org-a" as string | null, loadingOrg: false, projects: vi.fn(),
  items: vi.fn(), workPackages: vi.fn(), rfis: vi.fn(), submittals: vi.fn(), deliveries: vi.fn(),
  scheduleTasks: vi.fn(), drawings: vi.fn(), inspections: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  error: vi.fn(), success: vi.fn(),
  save: null as null | ((draft: Record<string, unknown>) => void),
  quickUpdate: null as null | ((id: string, patch: Record<string, unknown>) => void),
}));
vi.mock("@/api/supabaseClient", () => {
  const reader = (read: typeof mocks.items) => ({ filter: vi.fn(() => { throw new Error("Capped reads cannot prove complete evidence"); }), filterAll: read, list: read });
  return { entities: {
    ActionItem: { ...reader(mocks.items), create: mocks.create, update: mocks.update, delete: mocks.remove },
    WorkPackage: reader(mocks.workPackages), RFI: reader(mocks.rfis), Submittal: reader(mocks.submittals),
    Delivery: reader(mocks.deliveries), ScheduleTask: reader(mocks.scheduleTasks), Drawing: reader(mocks.drawings), Inspection: reader(mocks.inspections),
    Project: { filterAll: mocks.projects },
  } };
});
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => mocks.projectId }));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => ({ currentOrg: mocks.orgId ? { id: mocks.orgId } : null, isLoadingOrgs: mocks.loadingOrg }) }));
vi.mock("@/components/shared/ProjectContext", () => ({ useProjectContext: () => ({ activeProject: { id: mocks.projectId, name: "Steel job" } }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
// Capture queued callbacks while retaining the actual form, list and engine.
vi.mock("../ConstraintFormModal", async importOriginal => {
  const actual = await importOriginal<typeof import("../ConstraintFormModal")>();
  return { default: (props: ComponentProps<typeof actual.default>) => { mocks.save = props.onSave; return <actual.default {...props} />; } };
});
vi.mock("../ListView", async importOriginal => {
  const actual = await importOriginal<typeof import("../ListView")>();
  return { default: (props: ComponentProps<typeof actual.default>) => { mocks.quickUpdate = props.onQuickUpdate; return <actual.default {...props} />; } };
});

import Constraints from "@/pages/Constraints";

const sources = ["items", "workPackages", "rfis", "submittals", "deliveries", "scheduleTasks", "drawings", "inspections"] as const;
type Source = typeof sources[number];
const manual = { id: "constraint-a", project_id: "project-a", category: "CONSTRAINT", title: "Access restriction", status: "Open", priority: "High", constraint_type: "Other" };
const rfi = { id: "rfi-a", project_id: "project-a", rfi_number: "014", title: "Anchor bolt embed issue", status: "Open" };
const wp = { id: "wp-a", project_id: "project-a", wp_number: "WP-001", phase: "Fabrication", status: "In Progress", percent_complete: 10, crew: "Shop A", released_date: "2026-01-01", linked_drawing_ids: "drawing-a" };
const drawing = { id: "drawing-a", project_id: "project-a", stage: "IFC" };
const fixtures: Record<Source, Record<string, unknown>[]> = { items: [], workPackages: [wp], rfis: [rfi], submittals: [], deliveries: [], scheduleTasks: [], drawings: [drawing], inspections: [] };
const titleInput = "Brief description of what is blocking progress";
const evidenceKey = (project = "project-a", org = "org-a") => ["constraints", project, "evidence", org];
let client: QueryClient;
function LocationState() { return <output aria-label="Current query">{useLocation().search}</output>; }
function mount(route = "/Constraints") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><Constraints /><LocationState /></MemoryRouter></QueryClientProvider>;
  return { ...render(tree()), tree };
}
async function loaded() { await screen.findByText(/Engineering Hold: RFI 014/); }
async function openCreate() {
  fireEvent.click(screen.getByRole("button", { name: "Log Constraint" }));
  fireEvent.change(screen.getByPlaceholderText(titleInput), { target: { value: "Reviewed site access issue" } });
}
function saveCreate() { fireEvent.click(screen.getAllByRole("button", { name: "Log Constraint" }).at(-1)!); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.projectId = "project-a"; mocks.save = null; mocks.quickUpdate = null;
  mocks.orgId = "org-a"; mocks.loadingOrg = false;
  mocks.projects.mockReset().mockImplementation(async (filter: { id: string; org_id: string }) => [{ ...filter, name: "Steel job", is_deleted: false }]);
  sources.forEach(source => mocks[source].mockReset().mockResolvedValue(fixtures[source]));
  mocks.create.mockReset().mockImplementation(async (draft: Record<string, unknown>) => ({ ...draft, id: "created-a" }));
  mocks.update.mockReset().mockImplementation(async (id: string, patch: Record<string, unknown>) => ({ ...manual, ...patch, id }));
  mocks.remove.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); client?.clear(); onlineManager.setOnline(true); });

describe("Constraints complete project evidence", () => {
  it("labels a deep-linked project's evidence with its verified name rather than header context", async () => {
    mocks.projects.mockResolvedValue([{ id: "project-a", org_id: "org-a", name: "Verified erection job" }]);
    mount(); await loaded();
    expect(screen.getByText("Verified erection job")).toBeInTheDocument();
    expect(screen.queryByText("Steel job")).not.toBeInTheDocument();
  });
  it("proves project workspace ownership before reading any constraint source", async () => {
    let finish!: (rows: object[]) => void;
    mocks.projects.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mount();
    expect(screen.getByRole("status", { name: "Constraint evidence" })).toBeInTheDocument();
    sources.forEach(source => expect(mocks[source]).not.toHaveBeenCalled());
    expect(mocks.projects).toHaveBeenCalledWith({ id: "project-a", org_id: "org-a" }, "id");
    await act(async () => { finish([{ id: "project-a", org_id: "org-a" }]); });
    await loaded();
  });

  it.each([
    { proof: [] },
    { proof: [{ id: "project-a", org_id: "org-b" }] },
    { proof: [{ id: "project-b", org_id: "org-a" }] },
    { proof: [{ id: "project-a", org_id: "org-a", is_deleted: true }] },
  ])("rejects missing, foreign or archived workspace proof before child reads (%j)", async ({ proof }) => {
    mocks.projects.mockResolvedValue(proof); mount();
    expect(await screen.findByRole("alert", { name: "Constraint evidence" })).toHaveTextContent(/not available in this workspace/i);
    sources.forEach(source => expect(mocks[source]).not.toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Log Constraint" })).not.toBeInTheDocument();
  });

  it.each([false, true])("does not read project evidence while workspace is unavailable (loading=%s)", loading => {
    mocks.loadingOrg = loading; mocks.orgId = loading ? "org-a" : null; mount();
    expect(screen.getByRole("status", { name: "Constraint evidence" })).toBeInTheDocument();
    expect(mocks.projects).not.toHaveBeenCalled();
    sources.forEach(source => expect(mocks[source]).not.toHaveBeenCalled());
  });

  it("does not keep a prior workspace's project editable after the workspace switches", async () => {
    const page = mount(); await loaded(); await openCreate(); const oldSave = mocks.save!;
    mocks.orgId = "org-b"; mocks.projects.mockResolvedValue([]); page.rerender(page.tree());
    await screen.findByRole("alert", { name: "Constraint evidence" });
    expect(screen.queryByPlaceholderText(titleInput)).not.toBeInTheDocument();
    expect(screen.queryByText(/Engineering Hold: RFI 014/)).not.toBeInTheDocument();
    await act(async () => { oldSave({ title: "Old workspace draft" }); });
    expect(mocks.create).not.toHaveBeenCalled();
    sources.forEach(source => expect(mocks[source]).toHaveBeenCalledTimes(1));
  });

  it("rejects old callbacks after returning to the same workspace and cached project", async () => {
    mocks.items.mockResolvedValue([manual]);
    const page = mount(); await loaded(); await openCreate();
    const oldSave = mocks.save!; const oldUpdate = mocks.quickUpdate!;
    mocks.orgId = "org-b"; mocks.projects.mockResolvedValue([]); page.rerender(page.tree());
    await screen.findByRole("alert", { name: "Constraint evidence" });
    mocks.orgId = "org-a"; page.rerender(page.tree()); await loaded(); await openCreate();
    await act(async () => { oldSave({ title: "Obsolete draft" }); oldUpdate(manual.id, { status: "Resolved" }); });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(titleInput)).toHaveValue("Reviewed site access issue");
  });

  it.each(sources)("waits for %s before showing blockers or a healthy empty register", async source => {
    let finish!: (rows: Record<string, unknown>[]) => void;
    mocks[source].mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mount();
    await waitFor(() => expect(mocks[source]).toHaveBeenCalled());
    expect(screen.getByRole("status", { name: "Constraint evidence" })).toBeInTheDocument();
    expect(screen.queryByText(/Engineering Hold: RFI 014/)).not.toBeInTheDocument();
    expect(screen.queryByText(/All constraints are resolved/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log Constraint" })).not.toBeInTheDocument();
    await act(async () => { finish(fixtures[source]); });
    await loaded();
    expect(screen.queryByText(/IFC Hold:/)).not.toBeInTheDocument();
  });

  it.each(sources)("reports %s failure and recovers through Retry without losing or inventing blockers", async source => {
    mocks[source].mockRejectedValue(new Error("Fixture source unavailable"));
    mount();
    expect(await screen.findByRole("alert", { name: "Constraint evidence" })).toBeInTheDocument();
    expect(screen.queryByText(/All constraints are resolved/)).not.toBeInTheDocument();
    expect(screen.queryByText(/IFC Hold:/)).not.toBeInTheDocument();
    mocks[source].mockResolvedValue(fixtures[source]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await loaded();
  });

  it("shows genuine empty evidence only after all sources return empty", async () => {
    sources.forEach(source => mocks[source].mockResolvedValue([]));
    mount();
    expect(await screen.findByText("No Open Constraints")).toBeInTheDocument();
    sources.forEach(source => expect(mocks[source]).toHaveBeenCalled());
  });

  it("pages every required source in stable order within the selected project", async () => {
    mount(); await loaded();
    sources.forEach(source => expect(mocks[source]).toHaveBeenCalledWith(
      source === "items" ? { project_id: "project-a", category: "CONSTRAINT" } : { project_id: "project-a" }, "id",
    ));
  });

  it.each(sources)("rejects foreign project records returned by %s", async source => {
    mocks[source].mockResolvedValue([{ id: "foreign-row", project_id: "project-b" }]);
    mount();
    const alert = await screen.findByRole("alert", { name: "Constraint evidence" });
    expect(alert).toHaveTextContent(/outside the selected project/i);
    expect(screen.queryByText(/Engineering Hold: RFI 014/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log Constraint" })).not.toBeInTheDocument();
  });

  it("identifies the failed source without silently removing its blockers", async () => {
    mocks.drawings.mockRejectedValue(new Error("Read limit reached"));
    mount();
    expect(await screen.findByRole("alert", { name: "Constraint evidence" })).toHaveTextContent("Drawings: Read limit reached");
  });

  it("preserves non-retryable read-limit metadata when naming a failed source", async () => {
    mocks.drawings.mockRejectedValue(Object.assign(new Error("Read limit reached"), { status: 400, code: "READ_LIMIT_REACHED" }));
    mount(); await screen.findByRole("alert", { name: "Constraint evidence" });
    expect(client.getQueryState(evidenceKey())?.error).toMatchObject({ status: 400, code: "READ_LIMIT_REACHED" });
  });

  it("does not read project registers without a project", () => {
    mocks.projectId = null; mount();
    expect(screen.getByText("Select a Project")).toBeInTheDocument();
    sources.forEach(source => expect(mocks[source]).not.toHaveBeenCalled());
  });

  it("keeps an initial offline read unknown", () => {
    onlineManager.setOnline(false); mount();
    expect(screen.getByRole("status", { name: "Constraint evidence" })).toBeInTheDocument();
    expect(screen.queryByText(/All constraints are resolved/)).not.toBeInTheDocument();
  });

  it("preserves its last complete display and draft during refresh and rejects queued writes", async () => {
    mocks.items.mockResolvedValue([manual]);
    mount(); await loaded(); await openCreate();
    const queuedSave = mocks.save!;
    const queuedUpdate = mocks.quickUpdate!;
    let finish!: (rows: Record<string, unknown>[]) => void;
    mocks.drawings.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mocks.rfis.mockResolvedValue([]);
    await act(async () => {
      void client.invalidateQueries({ queryKey: ["constraints", "project-a"] });
      queuedSave({ title: "Queued draft", project_id: "project-a" });
      queuedUpdate(manual.id, { status: "Resolved" });
    });
    expect(await screen.findByText(/Showing the last complete/)).toBeInTheDocument();
    expect(screen.getByText(/Engineering Hold: RFI 014/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(titleInput)).toHaveValue("Reviewed site access issue");
    expect(screen.getAllByRole("button", { name: "Log Constraint" }).at(-1)).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
    await act(async () => { finish([drawing]); });
    await waitFor(() => expect(screen.queryByText(/Engineering Hold: RFI 014/)).not.toBeInTheDocument());
    expect(screen.getByPlaceholderText(titleInput)).toHaveValue("Reviewed site access issue");
  });

  it("retains completed data on a failed refresh and keeps writes paused until Retry succeeds", async () => {
    mount(); await loaded(); await openCreate();
    mocks.inspections.mockRejectedValue(new Error("Inspection read unavailable"));
    await act(async () => { await client.invalidateQueries({ queryKey: ["constraints", "project-a"] }); });
    expect(await screen.findByRole("alert", { name: "Constraint evidence" })).toBeInTheDocument();
    expect(screen.getByText(/Engineering Hold: RFI 014/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(titleInput)).toHaveValue("Reviewed site access issue");
    expect(screen.getAllByRole("button", { name: "Log Constraint" }).at(-1)).toBeDisabled();
    mocks.inspections.mockResolvedValue([]); fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert", { name: "Constraint evidence" })).not.toBeInTheDocument());
  });

  it("keeps fromRfi during missing evidence, then opens the matching current-project prefill once", async () => {
    let finish!: (rows: Record<string, unknown>[]) => void;
    mocks.inspections.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mount("/Constraints?fromRfi=rfi-a");
    await waitFor(() => expect(mocks.inspections).toHaveBeenCalled());
    expect(screen.getByLabelText("Current query")).toHaveTextContent("fromRfi=rfi-a");
    expect(screen.queryByPlaceholderText(titleInput)).not.toBeInTheDocument();
    await act(async () => { finish([]); });
    expect(await screen.findByPlaceholderText(titleInput)).toHaveValue("RFI 014: Anchor bolt embed issue");
    await waitFor(() => expect(screen.getByLabelText("Current query")).toBeEmptyDOMElement());
  });

  it("retains an RFI handoff through failure and retries into a single complete draft", async () => {
    mocks.deliveries.mockRejectedValue(new Error("Delivery evidence unavailable"));
    mount("/Constraints?fromRfi=rfi-a");
    await screen.findByRole("alert", { name: "Constraint evidence" });
    expect(screen.getByLabelText("Current query")).toHaveTextContent("fromRfi=rfi-a");
    expect(screen.queryByPlaceholderText(titleInput)).not.toBeInTheDocument();
    mocks.deliveries.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByPlaceholderText(titleInput)).toHaveValue("RFI 014: Anchor bolt embed issue");
    await waitFor(() => expect(screen.getByLabelText("Current query")).toBeEmptyDOMElement());
  });

  it("rejects a closed dialog callback when a different draft is open on the same project", async () => {
    mount(); await loaded(); await openCreate(); const oldSave = mocks.save!;
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await openCreate();
    await act(async () => { oldSave({ title: "Closed draft", project_id: "project-a" }); });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(titleInput)).toHaveValue("Reviewed site access issue");
  });

  it("keeps a newer same-project form when a closed draft finishes saving", async () => {
    let finish!: (row: Record<string, unknown>) => void;
    mocks.create.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    mount(); await loaded(); await openCreate(); saveCreate();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await openCreate();
    fireEvent.change(screen.getByPlaceholderText(titleInput), { target: { value: "Second reviewed draft" } });
    await act(async () => { finish({ id: "created-a", project_id: "project-a" }); });
    expect(screen.getByPlaceholderText(titleInput)).toHaveValue("Second reviewed draft");
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("pins a reviewed create to its project and rejects a foreign work-package reference", async () => {
    mount(); await loaded(); await openCreate();
    await act(async () => { mocks.save!({ title: "Reviewed", project_id: "project-b", work_package_id: "foreign-wp" }); });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(/work package.*project/i));
    await act(async () => { mocks.save!({ title: "Reviewed", project_id: "project-b", work_package_id: "wp-a" }); });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ project_id: "project-a", work_package_id: "wp-a", category: "CONSTRAINT" }));
  });

  it("cannot use a queued quick action to resolve a generated blocker", async () => {
    mount(); await loaded();
    await act(async () => { mocks.quickUpdate!("generated:rfi:rfi-a", { status: "Resolved" }); });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(/Only a manual constraint/i));
  });

  it("keeps a failed deletion open and retries the same project record", async () => {
    mocks.items.mockResolvedValue([manual]); mocks.remove.mockRejectedValueOnce(new Error("Delete unavailable"));
    mount(); await loaded();
    fireEvent.click(screen.getByRole("button", { name: "×" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Delete unavailable"));
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.remove).toHaveBeenNthCalledWith(1, "constraint-a");
    expect(mocks.remove).toHaveBeenNthCalledWith(2, "constraint-a");
  });

  it("rejects delete after evidence invalidation and leaves Cancel usable", async () => {
    mocks.items.mockResolvedValue([manual]); mount(); await loaded();
    fireEvent.click(screen.getByRole("button", { name: "×" }));
    const dialog = await screen.findByRole("alertdialog");
    mocks.drawings.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      void client.invalidateQueries({ queryKey: evidenceKey() });
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    });
    expect(mocks.remove).not.toHaveBeenCalled();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(cancel).toBeEnabled(); fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("reports a settled missing handoff without keeping an unusable URL forever", async () => {
    mocks.rfis.mockResolvedValue([]); mount("/Constraints?fromRfi=missing");
    await screen.findByText("No Open Constraints");
    expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(/RFI.*not found.*project/i));
    await waitFor(() => expect(screen.getByLabelText("Current query")).toBeEmptyDOMElement());
    expect(screen.queryByPlaceholderText(titleInput)).not.toBeInTheDocument();
  });

  it("rejects an old-project create callback after a new project is ready", async () => {
    const page = mount(); await loaded(); await openCreate(); const oldSave = mocks.save!;
    mocks.projectId = "project-b"; sources.forEach(source => mocks[source].mockResolvedValue([]));
    page.rerender(page.tree()); await screen.findByText("No Open Constraints");
    expect(screen.queryByPlaceholderText(titleInput)).not.toBeInTheDocument();
    await openCreate();
    await act(async () => { oldSave({ title: "Project A draft", project_id: "project-a" }); });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(titleInput)).toHaveValue("Reviewed site access issue");
  });

  it("rejects callbacks from an unmounted page", async () => {
    const page = mount(); await loaded(); await openCreate(); const oldSave = mocks.save!;
    page.unmount();
    await act(async () => { oldSave({ title: "Abandoned page draft", project_id: "project-a" }); });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each(["create", "update"] as const)("keeps a new project's draft/cache when an old %s finishes", async operation => {
    mocks.items.mockResolvedValue([manual]);
    let finish!: (row: Record<string, unknown>) => void;
    mocks[operation].mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const page = mount(); await loaded();
    if (operation === "create") { await openCreate(); saveCreate(); }
    else { fireEvent.click(screen.getByRole("button", { name: "EDIT" })); fireEvent.click(screen.getByRole("button", { name: "Save Changes" })); }
    await waitFor(() => expect(mocks[operation]).toHaveBeenCalledTimes(1));
    mocks.projectId = "project-b"; sources.forEach(source => mocks[source].mockResolvedValue([]));
    page.rerender(page.tree()); await screen.findByText("No Open Constraints"); await openCreate();
    await act(async () => { finish({ ...manual, id: operation === "create" ? "created-a" : manual.id }); });
    expect(screen.getByPlaceholderText(titleInput)).toHaveValue("Reviewed site access issue");
    expect(client.getQueryState(evidenceKey("project-b"))?.isInvalidated).toBe(false);
    expect(client.getQueryState(evidenceKey())?.isInvalidated).toBe(true);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("keeps generated blockers read-only in both list and board views", async () => {
    mount(); await loaded();
    expect(screen.queryByRole("button", { name: "EDIT" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    expect(screen.queryByRole("button", { name: /^(?:✓ Resolve|↺ Reopen|EDIT)$/i })).not.toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
});
