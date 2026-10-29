import { afterEach, expect, it, vi } from "vitest";
import { getPendingPhoto } from "../blobStore";
import { replayPhotoCreate } from "../photoSync";
import { flushQueue, makePhotoCreateOp, OP_PHOTO_CREATE } from "../offlineQueue";

afterEach(() => vi.unstubAllGlobals());
it("does not turn unavailable IndexedDB into evidence that a photo was sent", async () => {
  vi.stubGlobal("indexedDB", undefined);
  await expect(getPendingPhoto("capture")).rejects.toThrow(/IndexedDB/);
});
it("keeps an unverified missing photo pending instead of reporting synced", async () => {
  const op = makePhotoCreateOp("capture", { project_id: "project" }, 1);
  const createPhoto = vi.fn();
  const result = await flushQueue([op], {
    [OP_PHOTO_CREATE]: (_payload: unknown, queued: typeof op) => replayPhotoCreate(queued, {
      getBlob: async (): Promise<null> => null, createPhoto, uploadFile: vi.fn(), deleteBlob: vi.fn(), isUniqueViolation: () => false,
    }),
  });
  expect(result.synced).toBe(0);
  expect(result.remaining).toEqual([op]);
  expect(result.error).toBeInstanceOf(Error);
  expect(createPhoto).not.toHaveBeenCalled();
});
