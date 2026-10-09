import { beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { parseChangeOrderCsv } from "@/lib/importChangeOrderCsv";
import { commitChangeOrderImport, prepareChangeOrderImport, sourceReferenceFromNotes, matchImportProject } from "../importBatch";

const mocks = { read: vi.fn(), create: vi.fn(), guard: vi.fn() };
const parsed = () => parseChangeOrderCsv("CO Number,Title,Amount,Status\n17,Added embeds,1200,Draft\n18,Added braces,2400,Submitted").cos;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto); vi.clearAllMocks(); mocks.guard.mockReset();
  mocks.read.mockResolvedValue([]); mocks.create.mockImplementation(async (payload: object) => ({ id: "created", co_number: "CO-101", ...payload }));
});
async function run(rows = parsed()) {
  return commitChangeOrderImport({ rows: await prepareChangeOrderImport(rows, "project-a"), projectId: "project-a", readExisting: mocks.read, create: mocks.create, assertScope: mocks.guard });
}
it("uses only unique project matches from the caller's owned project register", () => {
  const projects = [{ id: "a", project_number: "A-24463" }];
  expect(matchImportProject("24463", projects)).toEqual(projects[0]);
  expect(matchImportProject("446", projects)).toBeNull();
  expect(matchImportProject("24463", [...projects, { id: "b", project_number: "24463" }])).toBeNull();
});
it("preserves the source reference while leaving official numbers and approval stamps to the server", async () => {
  const result = await run();
  expect(result.succeeded).toHaveLength(2);
  const [payload, options] = mocks.create.mock.calls[0];
  expect(payload).toMatchObject({ project_id: "project-a", status: "Draft", co_amount: 1200 });
  expect(payload).not.toHaveProperty("co_number"); expect(payload).not.toHaveProperty("approved_date");
  expect(sourceReferenceFromNotes(payload.notes)).toBe("17");
  expect(payload.notes).not.toContain("SHA-256");
  expect(payload.metadata.csv_import).toMatchObject({ source_reference: "17", content_fingerprint: expect.stringMatching(/^[a-f\d]{64}$/) });
  expect(options.clientOperationId).toMatch(/^[a-f\d-]{36}$/);
});
it("reuses each row's operation ID across retries and repeat imports, but separates projects", async () => {
  const first = await prepareChangeOrderImport(parsed(), "project-a");
  const again = await prepareChangeOrderImport(parsed(), "project-a");
  const other = await prepareChangeOrderImport(parsed(), "project-b");
  expect(first.map(row => row.clientOperationId)).toEqual(again.map(row => row.clientOperationId));
  expect(first[0].clientOperationId).not.toBe(other[0].clientOperationId);
  expect(first[0].clientOperationId).not.toBe(first[1].clientOperationId);
});
it("skips repeat source references instead of comparing them with newly allocated official numbers", async () => {
  const prepared = await prepareChangeOrderImport(parsed(), "project-a");
  mocks.read.mockResolvedValue([{ id: "existing", project_id: "project-a", co_number: "CO-987", notes: prepared[0].payload?.notes, metadata: prepared[0].payload?.metadata }]);
  const result = await run();
  expect(result.skipped).toHaveLength(1); expect(result.skipped[0].record.co_number).toBe("CO-987");
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
it("requires review when a repeated source reference carries changed commercial content", async () => {
  const prepared = await prepareChangeOrderImport(parsed(), "project-a");
  mocks.read.mockResolvedValue([{ id: "existing", project_id: "project-a", co_number: "CO-987", notes: prepared[0].payload?.notes, metadata: prepared[0].payload?.metadata }]);
  const revised = parsed().slice(0, 1); revised[0].co_amount = 1500;
  const result = await run(revised);
  expect(result.failed).toHaveLength(1); expect(result.failed[0].error).toMatch(/changed.*CO-987/i);
  expect(result.skipped).toHaveLength(0); expect(mocks.create).not.toHaveBeenCalled();
});
it("requires review if existing rows disagree on a source reference", async () => {
  const prepared = await prepareChangeOrderImport(parsed(), "project-a");
  mocks.read.mockResolvedValue(["first", "second"].map(id => ({ id, project_id: "project-a", co_number: id, notes: prepared[0].payload?.notes, metadata: prepared[0].payload?.metadata })));
  const result = await run(parsed().slice(0, 1));
  expect(result.failed).toHaveLength(1); expect(result.failed[0].error).toMatch(/multiple/i);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("does not downgrade approvals or import terminal workflow states", async () => {
  const rows = parseChangeOrderCsv("CO Number,Title,Amount,Status\n17,Approved change,1000,Approved\n18,Voided change,1000,Void").cos;
  const result = await run(rows);
  expect(result.failed).toHaveLength(2); expect(mocks.create).not.toHaveBeenCalled();
  expect(result.failed.every(row => /Draft or Submitted/.test(row.error))).toBe(true);
});
it("preserves row failures and retries only the failed rows with the same operation IDs", async () => {
  const prepared = await prepareChangeOrderImport(parsed(), "project-a");
  mocks.create.mockRejectedValueOnce(new Error("Network lost")).mockResolvedValueOnce({ id: "ok", co_number: "CO-102" });
  const first = await commitChangeOrderImport({ rows: prepared, projectId: "project-a", readExisting: mocks.read, create: mocks.create, assertScope: mocks.guard });
  expect(first.succeeded).toHaveLength(1); expect(first.failed).toHaveLength(1);
  mocks.create.mockResolvedValue({ id: "recovered", co_number: "CO-101" });
  await commitChangeOrderImport({ rows: first.failed.map(result => result.row), projectId: "project-a", readExisting: mocks.read, create: mocks.create, assertScope: mocks.guard });
  expect(mocks.create).toHaveBeenCalledTimes(3);
  expect(mocks.create.mock.calls[0][1]).toEqual(mocks.create.mock.calls[2][1]);
});
it("rejects incomplete or foreign-project existing evidence before any create", async () => {
  mocks.read.mockRejectedValueOnce(new Error("Incomplete read"));
  await expect(run()).rejects.toThrow("Incomplete read");
  mocks.read.mockResolvedValue([{ id: "b", project_id: "other-project", notes: "" }]);
  await expect(run()).rejects.toThrow(/outside/);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("stops subsequent queued writes after a workspace change while reporting an already committed row", async () => {
  mocks.create.mockImplementationOnce(async () => {
    mocks.guard.mockImplementation(() => { throw new Error("Workspace changed"); });
    return { id: "ok", co_number: "CO-101" };
  });
  const result = await run();
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(result.succeeded).toHaveLength(1); expect(result.failed).toHaveLength(1);
});
it("does not guess between duplicate selected source references", async () => {
  const rows = parsed(); rows[1].co_number = rows[0].co_number;
  const result = await run(rows);
  expect(result.failed).toHaveLength(2); expect(mocks.create).not.toHaveBeenCalled();
});
