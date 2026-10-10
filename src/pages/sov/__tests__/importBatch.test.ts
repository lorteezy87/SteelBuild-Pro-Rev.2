import { beforeEach, describe, expect, it, vi } from "vitest";
import { commitSovImport, prepareSovImport, validateSovValues } from "../importBatch";
import { buildSovStaged, type SovStagedRow } from "@/lib/importSovSpreadsheet";
import { setActiveOrgId } from "@/lib/activeOrg";

const stage = (description: string, line = 12): SovStagedRow => ({ valid: true, reason: null, autoMapped: false, record: {
  project_id: "project-a", project_name: "Steel erection", sov_id: "SOURCE-12", line_item_number: line,
  description, scheduled_value: 1000, cost_code: null, cost_code_name: null, application_number: 1,
  period_from: null, period_to: null, previous_percent_complete: 0, current_percent_complete: 10,
  retainage_percent: 10, status: "Draft",
} });

describe("SOV sequential import", () => {
  beforeEach(() => { setActiveOrgId(null); setActiveOrgId("org-a"); });
  it("retains failed row identities and never retries already saved rows", async () => {
    const rows = prepareSovImport([stage("Shop fabrication"), stage("Field erection", 13), stage("Crane mobilization", 14)]);
    const create = vi.fn().mockResolvedValueOnce({ id: "first", project_id: "project-a", sov_id: "SOV-101" })
      .mockRejectedValueOnce(Object.assign(new Error("Response lost; outcome unknown"), { outcomeUnknown: true }))
      .mockResolvedValueOnce({ id: "third", project_id: "project-a", sov_id: "SOV-103" })
      .mockResolvedValueOnce({ id: "second", project_id: "project-a", sov_id: "SOV-102" });
    const assertScope = vi.fn();
    const first = await commitSovImport({ rows, projectId: "project-a", create, assertScope });
    expect(first.succeeded.map(entry => entry.record.id)).toEqual(["first", "third"]);
    expect(first.failed).toHaveLength(1); expect(first.failed[0].clientOperationId).toBe(rows[1].clientOperationId);
    const retry = await commitSovImport({ rows: first.failed, projectId: "project-a", create, assertScope });
    expect(retry.failed).toEqual([]); expect(create).toHaveBeenCalledTimes(4);
    expect(create.mock.calls[3][0].description).toBe("Field erection");
    expect(create.mock.calls[3][1]).toEqual(create.mock.calls[1][1]);
    for (const [payload] of create.mock.calls) {
      expect(payload).not.toHaveProperty("line_item_number"); expect(payload).not.toHaveProperty("sov_id");
      expect(payload).not.toHaveProperty("project_name"); expect(payload).not.toHaveProperty("clientOperationId");
    }
  });
  it("stops queue writes after a scope change during the first commit", async () => {
    let current = true;
    const create = vi.fn(async () => { current = false; return { id: "saved-before-switch", project_id: "project-a" }; });
    const result = await commitSovImport({ rows: prepareSovImport([stage("Shop"), stage("Field", 13)]), projectId: "project-a", create,
      assertScope: () => { if (!current) throw new Error("Import closed or project changed"); } });
    expect(create).toHaveBeenCalledTimes(1); expect(result.succeeded).toHaveLength(1); expect(result.failed).toHaveLength(1);
  });
  it("refuses foreign rows before calling the backend", async () => {
    const rows = prepareSovImport([stage("Shop")]); rows[0].record.project_id = "project-b";
    const create = vi.fn(); const result = await commitSovImport({ rows, projectId: "project-a", create, assertScope: () => undefined });
    expect(create).not.toHaveBeenCalled(); expect(result.failed[0].importError).toMatch(/another project/);
  });
  it("retains an unverifiable save for retry with the same operation ID", async () => {
    const rows = prepareSovImport([stage("Shop")]); const create = vi.fn().mockResolvedValue({ id: "foreign", project_id: "project-b" });
    const result = await commitSovImport({ rows, projectId: "project-a", create, assertScope: () => undefined });
    expect(result.succeeded).toEqual([]); expect(result.failed[0].clientOperationId).toBe(rows[0].clientOperationId);
    expect(result.failed[0].importError).toMatch(/outcome could not be verified/);
  });
  it("reprepares a partial import with its confirmed receipts and original unknown identity", async () => {
    const source = [stage("Shop"), stage("Field", 13)];
    const firstRows = prepareSovImport(source);
    const create = vi.fn().mockResolvedValueOnce({ id: "saved", project_id: "project-a", sov_id: "SOV-201" })
      .mockRejectedValueOnce({ outcomeUnknown: true }).mockResolvedValueOnce({ id: "recovered", project_id: "project-a" });
    await commitSovImport({ rows: firstRows, projectId: "project-a", create, assertScope: () => undefined });
    const reopened = prepareSovImport(source);
    expect(reopened[0].valid).toBe(false);
    expect(reopened[0].reason).toMatch(/already saved.*SOV-201/i);
    expect(reopened[1].clientOperationId).toBe(firstRows[1].clientOperationId);
    await commitSovImport({ rows: reopened, projectId: "project-a", create, assertScope: () => undefined });
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[2]).toEqual(create.mock.calls[1]);
  });
  it("blocks changed content and duplicate source references without replacing the uncertain operation", async () => {
    const rows = prepareSovImport([stage("Shop")]);
    const create = vi.fn().mockRejectedValue({ outcomeUnknown: true });
    await commitSovImport({ rows, projectId: "project-a", create, assertScope: () => undefined });
    const changed = prepareSovImport([stage("Changed amount/scope")]);
    expect(changed[0].valid).toBe(false); expect(changed[0].reason).toMatch(/source.*changed/i);
    const original = prepareSovImport([stage("Shop")]);
    expect(original[0].clientOperationId).toBe(rows[0].clientOperationId);
    const duplicates = prepareSovImport([stage("Another line", 20), stage("Other content", 20)]);
    expect(duplicates.every(row => !row.valid && /duplicate source/i.test(row.reason || ""))).toBe(true);
  });
  it("isolates session receipts across workspace generations", async () => {
    const rows = prepareSovImport([stage("Shop")]);
    await commitSovImport({ rows, projectId: "project-a", create: vi.fn().mockRejectedValue({ outcomeUnknown: true }), assertScope: () => undefined });
    setActiveOrgId(null); setActiveOrgId("org-a");
    const reopened = prepareSovImport([stage("Shop")]);
    expect(reopened[0].clientOperationId).not.toBe(rows[0].clientOperationId);
    const create = vi.fn();
    const stale = await commitSovImport({ rows, projectId: "project-a", create, assertScope: () => undefined });
    expect(create).not.toHaveBeenCalled(); expect(stale.failed[0].importError).toMatch(/workspace/i);
  });
  it("reuses an in-flight receipt and stable file-row identity when register counts change", async () => {
    const source = [{ description: "Shop", scheduled_value: "1000", application_number: "1" }];
    const firstRows = prepareSovImport(buildSovStaged(source, { project: { id: "project-a" }, existingCount: 10 }), "billing.csv");
    let resolve!: (record: { id: string; project_id: string }) => void;
    const create = vi.fn().mockImplementationOnce(() => new Promise<{ id: string; project_id: string }>(done => { resolve = done; }))
      .mockResolvedValue({ id: "saved", project_id: "project-a" });
    const original = commitSovImport({ rows: firstRows, projectId: "project-a", create, assertScope: () => undefined });
    const reopened = prepareSovImport(buildSovStaged(source, { project: { id: "project-a" }, existingCount: 11 }), "billing.csv");
    expect(reopened[0].clientOperationId).toBe(firstRows[0].clientOperationId);
    expect(reopened[0].importError).toMatch(/unconfirmed/i);
    await commitSovImport({ rows: reopened, projectId: "project-a", create, assertScope: () => undefined });
    expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
    resolve({ id: "saved", project_id: "project-a" }); await original;
    expect(prepareSovImport(buildSovStaged(source, { project: { id: "project-a" } }), "billing.csv")[0].valid).toBe(false);
  });
  it("does not let an older rejection release the source row while a remounted retry is pending", async () => {
    let reject!: (error: { outcomeUnknown: boolean }) => void;
    let resolve!: (record: { id: string; project_id: string }) => void;
    const create = vi.fn().mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; }))
      .mockImplementationOnce(() => new Promise<{ id: string; project_id: string }>(done => { resolve = done; }));
    const firstRows = prepareSovImport([stage("Shop")]);
    const first = commitSovImport({ rows: firstRows, projectId: "project-a", create, assertScope: () => undefined });
    const retryRows = prepareSovImport([stage("Shop")]);
    const retry = commitSovImport({ rows: retryRows, projectId: "project-a", create, assertScope: () => undefined });
    reject({ outcomeUnknown: false }); await first;
    const changed = prepareSovImport([stage("Changed source")]);
    expect(changed[0].valid).toBe(false); expect(changed[0].reason).toMatch(/source.*changed/i);
    resolve({ id: "saved", project_id: "project-a" }); await retry;
    expect(prepareSovImport([stage("Shop")])[0].reason).toMatch(/already saved/i);
  });
  it.each([
    { scheduled_value: Number.NaN }, { retainage_percent: 110 }, { current_percent_complete: -1 },
    { previous_percent_complete: 60, current_percent_complete: 30 }, { application_number: 1.5 },
    { period_from: "2026-10-10", period_to: "2026-10-09" }, { period_from: "2026-02-30" },
    { submitted_date: "2026-10-10", payment_received_date: "2026-10-09" },
  ])("blocks invalid financial inputs %j before save", patch => {
    const row = stage("Shop"); Object.assign(row.record, patch);
    expect(() => validateSovValues({ ...row.record })).toThrow();
    expect(prepareSovImport([row])[0].valid).toBe(false);
  });
});
