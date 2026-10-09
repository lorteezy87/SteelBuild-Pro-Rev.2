// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ChangeOrderImportModal from "../ChangeOrderImportModal";
import { parseChangeOrderCsv } from "@/lib/importChangeOrderCsv";

const mocks = vi.hoisted(() => ({ read: vi.fn(), create: vi.fn(), parse: vi.fn(), guard: vi.fn(), close: vi.fn(), created: vi.fn(), raw: vi.fn() }));
vi.mock("@/api/supabaseClient", () => ({ entities: { ChangeOrder: { filterAll: mocks.read, create: mocks.create } } }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.raw } }));
vi.mock("@/lib/importChangeOrderCsv", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/importChangeOrderCsv")>(), readChangeOrderCsvFile: mocks.parse }));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntity: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
const parsed = () => parseChangeOrderCsv("CO Number,Title,Amount,Status\n17,Added embeds,1200,Draft\n18,Added braces,2400,Submitted");
const projects = [{ id: "a", org_id: "org-a", name: "Alpha", project_number: "24463" }];
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto); vi.clearAllMocks(); mocks.guard.mockReset();
  mocks.parse.mockResolvedValue(parsed()); mocks.read.mockResolvedValue([]);
  mocks.create.mockImplementation(async () => ({ id: "created", co_number: "CO-101", project_id: "a" }));
  mocks.raw.mockImplementation(() => {
    const chain = { select: () => chain, eq: () => chain, or: () => chain, limit: async (): Promise<{ data: Array<{ id: string; name: string; project_number: string }>; error: { message: string } | null }> => ({ data: [{ id: "foreign", name: "Other workspace", project_number: "24463" }], error: null }), then: (done: (result: object) => unknown) => Promise.resolve(done({ data: [], error: null })) };
    return chain;
  });
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const tree = (open = true) => <QueryClientProvider client={client}><ChangeOrderImportModal open={open} projectId="a" projectName="Alpha" projects={projects} onClose={mocks.close} onCreated={mocks.created} assertMutationScope={mocks.guard} /></QueryClientProvider>;
  const view = render(tree());
  return { ...view, setOpen: (open: boolean) => view.rerender(tree(open)) };
}
async function preview(view: ReturnType<typeof mount>) {
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["fixture"], "changes.csv", { type: "text/csv" })] } });
  fireEvent.click(screen.getByRole("button", { name: "PARSE" }));
  await screen.findByRole("button", { name: "IMPORT 2" });
}
it("uses the owned project match and shows allocated official numbers beside source references", async () => {
  mocks.parse.mockResolvedValue({ ...parsed(), header: { job_number: "24463" } });
  const view = mount(); await preview(view);
  expect(screen.queryByText("Other workspace")).toBeNull(); expect(mocks.raw).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "IMPORT 2" }));
  await screen.findByText("IMPORT COMPLETE");
  expect(screen.getAllByText("CO-101").length).toBeGreaterThan(0);
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("co_number");
  expect(mocks.create.mock.calls[0][1]).toMatchObject({ clientOperationId: expect.any(String) });
});
it("keeps failed rows visible and retries only failures using their original operation IDs", async () => {
  mocks.create.mockRejectedValueOnce(new Error("First row failed")).mockResolvedValueOnce({ id: "second", co_number: "CO-102", project_id: "a" });
  const view = mount(); await preview(view); fireEvent.click(screen.getByRole("button", { name: "IMPORT 2" }));
  await screen.findByText("First row failed");
  expect(screen.queryByText("IMPORT COMPLETE")).toBeNull(); expect(mocks.close).not.toHaveBeenCalled();
  const originalOptions = mocks.create.mock.calls[0][1];
  mocks.create.mockResolvedValue({ id: "first", co_number: "CO-101", project_id: "a" });
  fireEvent.click(screen.getByRole("button", { name: "RETRY 1 FAILED" }));
  await screen.findByText("IMPORT COMPLETE");
  expect(mocks.create).toHaveBeenCalledTimes(3);
  expect(mocks.create.mock.calls[2][1]).toEqual(originalOptions);
});
it("requires individual review for approved source rows without silently downgrading them", async () => {
  const source = parsed(); source.cos[0].status = "Approved"; mocks.parse.mockResolvedValue(source);
  const view = mount(); await preview(view); fireEvent.click(screen.getByRole("button", { name: "IMPORT 2" }));
  await screen.findAllByText(/Import only Draft or Submitted/);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.create.mock.calls[0][0]).toMatchObject({ status: "Submitted" });
  expect(screen.queryByText("IMPORT COMPLETE")).toBeNull();
});
it("does not create changes when complete existing evidence fails", async () => {
  mocks.read.mockRejectedValue(new Error("Complete register unavailable"));
  const view = mount(); await preview(view); fireEvent.click(screen.getByRole("button", { name: "IMPORT 2" }));
  await screen.findByText("Complete register unavailable"); expect(mocks.create).not.toHaveBeenCalled();
});
it("rechecks workspace proof before committing", async () => {
  const view = mount(); await preview(view); mocks.guard.mockImplementation(() => { throw new Error("Workspace changed"); });
  fireEvent.click(screen.getByRole("button", { name: "IMPORT 2" }));
  await screen.findByText("Workspace changed"); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it("refuses a stated CSV job number that does not match the selected project", async () => {
  mocks.parse.mockResolvedValue({ ...parsed(), header: { job_number: "99999" } });
  const view = mount();
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["fixture"], "changes.csv", { type: "text/csv" })] } });
  fireEvent.click(screen.getByRole("button", { name: "PARSE" }));
  await screen.findByText(/does not uniquely match/);
  expect(screen.queryByRole("button", { name: "IMPORT 2" })).toBeNull(); expect(mocks.create).not.toHaveBeenCalled();
});
it("stops queued creates after the importer is closed and does not overwrite a reopened session", async () => {
  let finish!: (record: object) => void; mocks.create.mockReturnValueOnce(new Promise(done => { finish = done; }));
  const view = mount(); await preview(view); fireEvent.click(screen.getByRole("button", { name: "IMPORT 2" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalled());
  view.setOpen(false); view.setOpen(true);
  await act(async () => { finish({ id: "first", co_number: "CO-101", project_id: "a" }); });
  expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.created).not.toHaveBeenCalled();
  expect(screen.queryByText("IMPORT COMPLETE")).toBeNull();
});
