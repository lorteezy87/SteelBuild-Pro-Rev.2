import { expect, it, vi } from "vitest";
import { createWithReceipt } from "../createWithReceipt";
const draft = { project_id: "a", client_op_id: "capture", activities: "Weld inspection" };
const conflict = { code: "23505" };
const create = async (): Promise<typeof draft> => { throw conflict; };
it("recovers the original create after a committed insert lost its response", async () => {
  const receipt = { ...draft, id: "saved" };
  await expect(createWithReceipt(draft, create, async () => [receipt])).resolves.toEqual(receipt);
});
it("compares the persisted shape for blank fields and ignored create metadata", async () => {
  const submitted = { ...draft, location: "", notes: "", target_completion_date: "", created_at: "old", created_date: "alias", _local: true };
  const receipt = { ...draft, location: null, notes: null, target_completion_date: null, created_at: "server", id: "saved" };
  await expect(createWithReceipt(submitted, create, async () => [receipt])).resolves.toEqual(receipt);
});
it("does not swallow an unrelated uniqueness conflict or another project's receipt", async () => {
  await expect(createWithReceipt(draft, create, async () => [{ ...draft, project_id: "b" }])).rejects.toBe(conflict);
});
it("does not silently discard edits made after an ambiguous save", async () => {
  await expect(createWithReceipt({ ...draft, activities: "New edits" }, create, async () => [draft])).rejects.toThrow(/current draft differs/);
});
it("does not run receipt recovery for network or permission failures", async () => {
  const find = vi.fn();
  const failure = new Error("Failed to fetch");
  await expect(createWithReceipt(draft, async () => { throw failure; }, find)).rejects.toBe(failure);
  expect(find).not.toHaveBeenCalled();
});
