import { beforeEach, expect, it, vi } from "vitest";
import { commitRfiLog, resolveProjectForRfiLog } from "../importRfiLog";

const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/api/supabaseClient", () => ({ integrations: {} }));

const projects = [{ id: "a", project_number: "STEEL-24463", name: "Alpha" }];
beforeEach(() => {
  vi.clearAllMocks(); mocks.guard.mockReset(); mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation(() => {
    const chain = { select: () => chain, or: () => chain, eq: () => chain, limit: async (): Promise<{ data: Array<{ id: string; project_number: string }>; error: { message: string } | null }> => ({ data: [{ id: "foreign", project_number: "24463" }], error: null }) };
    return chain;
  });
});
function serve(total: number, failAt = Infinity, onRead = () => {}) {
  const rows = Array.from({ length: total }, (_, index) => ({ id: String(index), rfi_number: `RFI #${index + 1}` }));
  const calls: Array<{ projectId?: string; order?: string; range?: number[] }> = [];
  mocks.from.mockImplementation(() => {
    const call: typeof calls[number] = {}; calls.push(call);
    const read = (start: number, end: number): { data: typeof rows | null; error: { message: string } | null } => {
      onRead();
      return start >= failAt ? { data: null, error: { message: "Dedup unavailable" } } : { data: rows.slice(start, end + 1), error: null };
    };
    const chain = {
      select: () => chain, eq: (key: string, value: string) => { if (key === "project_id") call.projectId = value; return chain; },
      order: (value: string) => { call.order = value; return chain; },
      range: async (start: number, end: number) => { call.range = [start, end]; return read(start, end); },
      then: (resolve: (value: ReturnType<typeof read>) => unknown) => Promise.resolve(resolve(read(0, 999))),
      insert: mocks.insert,
    };
    return chain;
  });
  return calls;
}
const record = { rfi_number: "1001", title: "Connection query" };
const commit = () => commitRfiLog({ header: {}, rfis: [record], projectId: "a", projectName: "Alpha", assertCanImport: mocks.guard });

it("matches only a unique job number in the supplied workspace project register without a broad query", async () => {
  expect(await resolveProjectForRfiLog("24463", projects)).toEqual(projects[0]);
  expect(mocks.from).not.toHaveBeenCalled();
});
it("refuses missing scope, ambiguous numbers, and substring job matches", async () => {
  expect(await resolveProjectForRfiLog("24463")).toBeNull();
  expect(await resolveProjectForRfiLog("24463", [...projects, { id: "b", project_number: "24463", name: "Beta" }])).toBeNull();
  expect(await resolveProjectForRfiLog("446", projects)).toBeNull();
  expect(mocks.from).not.toHaveBeenCalled();
});
it("deduplicates against every page before inserting an RFI log", async () => {
  const calls = serve(1001);
  expect(await commit()).toEqual({ created: 0, skipped: 1 });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(calls.map(call => call.range)).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  expect(calls.every(call => call.projectId === "a" && call.order === "id")).toBe(true);
});
it.each([0, 500])("does not insert when dedup evidence fails at row %s", async offset => {
  serve(1001, offset);
  await expect(commit()).rejects.toThrow("Dedup unavailable");
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("checks the caller's workspace before reading import evidence", async () => {
  serve(0); mocks.guard.mockImplementation(() => { throw new Error("Workspace changed"); });
  await expect(commit()).rejects.toThrow("Workspace changed");
  expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
});
it("rechecks the caller's workspace after dedup reads before the actual insert", async () => {
  serve(0, Infinity, () => { mocks.guard.mockImplementation(() => { throw new Error("Workspace changed"); }); });
  await expect(commit()).rejects.toThrow("Workspace changed");
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("inserts a new RFI in the reviewed project after proving complete dedup evidence", async () => {
  serve(0);
  expect(await commit()).toEqual({ created: 1, skipped: 0 });
  expect(mocks.insert).toHaveBeenCalledWith([expect.objectContaining({ project_id: "a", rfi_number: "RFI #1001" })]);
});
