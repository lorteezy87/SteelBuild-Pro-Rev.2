// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RfiLogImportModal from "../RfiLogImportModal";

const mocks = vi.hoisted(() => ({ csv: vi.fn(), commit: vi.fn(), guard: vi.fn(), close: vi.fn(), created: vi.fn(), upload: vi.fn(), extract: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/api/supabaseClient", () => ({ integrations: {} }));
vi.mock("@/lib/importRfiLog", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/importRfiLog")>(),
  commitRfiLog: mocks.commit, uploadRfiLog: mocks.upload, extractRfiLog: mocks.extract,
}));
vi.mock("@/lib/importRfiCsv", () => ({ readRfiCsvFile: mocks.csv }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
const projects = [{ id: "a", org_id: "org-a", name: "Alpha", project_number: "24463" }];
const parsed = { header: { job_number: "24463" }, rfis: [{ rfi_number: "1", title: "Connection query" }] };
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.clearAllMocks(); mocks.guard.mockReset(); mocks.csv.mockResolvedValue(parsed);
  mocks.commit.mockResolvedValue({ created: 1, skipped: 0 });
  mocks.upload.mockResolvedValue({ file_url: "fixture.pdf", storage_path: "fixture.pdf" });
  mocks.extract.mockResolvedValue(parsed);
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const tree = (open = true) => <QueryClientProvider client={client}><RfiLogImportModal open={open} projectId="a" projectName="Alpha" projects={projects} onClose={mocks.close} onCreated={mocks.created} assertCanImport={mocks.guard} /></QueryClientProvider>;
  const view = render(tree());
  return { ...view, setOpen: (open: boolean) => view.rerender(tree(open)), client };
}
async function extract(view: ReturnType<typeof mount>, file = new File(["fixture"], "rfis.csv", { type: "text/csv" })) {
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "EXTRACT" }));
  await screen.findByRole("button", { name: "IMPORT 1" });
}
it("matches a parsed job only against supplied workspace projects and passes a write guard to commit", async () => {
  const view = mount(); await extract(view);
  expect(screen.getByText("PROJECT MATCHED")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "IMPORT 1" }));
  await waitFor(() => expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ projectId: "a", assertCanImport: expect.any(Function) })));
});
it("does not commit a preview after its workspace evidence becomes invalid", async () => {
  const view = mount(); await extract(view);
  mocks.guard.mockImplementation(() => { throw new Error("Workspace changed"); });
  fireEvent.click(screen.getByRole("button", { name: "IMPORT 1" }));
  await screen.findByText("Workspace changed");
  expect(mocks.commit).not.toHaveBeenCalled();
});
it("does not accept a local PDF extraction after its workspace changes", async () => {
  let finish!: (value: typeof parsed) => void;
  mocks.extract.mockReturnValue(new Promise(done => { finish = done; }));
  const view = mount();
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["pdf"], "rfis.pdf", { type: "application/pdf" })] } });
  fireEvent.click(screen.getByRole("button", { name: "EXTRACT" }));
  await waitFor(() => expect(mocks.extract).toHaveBeenCalledWith(expect.objectContaining({ file: expect.any(File), project_id: "a" })));
  mocks.guard.mockImplementation(() => { throw new Error("Workspace changed"); });
  await act(async () => { finish(parsed); });
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "IMPORT 1" })).toBeNull();
  expect(mocks.commit).not.toHaveBeenCalled();
});
it("does not let a closed and reopened importer accept an old extraction", async () => {
  let finish!: (value: typeof parsed) => void;
  mocks.csv.mockReturnValue(new Promise(done => { finish = done; }));
  const view = mount();
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["fixture"], "rfis.csv", { type: "text/csv" })] } });
  fireEvent.click(screen.getByRole("button", { name: "EXTRACT" }));
  view.setOpen(false); view.setOpen(true);
  await act(async () => { finish(parsed); });
  expect(screen.queryByRole("button", { name: "IMPORT 1" })).toBeNull();
});
it("does not close or overwrite a reopened importer when an earlier insert finishes", async () => {
  let finish!: (value: { created: number; skipped: number }) => void;
  mocks.commit.mockReturnValue(new Promise(done => { finish = done; }));
  const view = mount(); await extract(view);
  fireEvent.click(screen.getByRole("button", { name: "IMPORT 1" }));
  view.setOpen(false); view.setOpen(true);
  await act(async () => { finish({ created: 1, skipped: 0 }); });
  expect(screen.queryByText("IMPORT COMPLETE")).toBeNull();
  expect(mocks.created).not.toHaveBeenCalled();
});
