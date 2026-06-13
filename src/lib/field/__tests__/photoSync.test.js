import { describe, it, expect, vi } from "vitest";
import { replayPhotoCreate } from "../photoSync";
import { makePhotoCreateOp, isUniqueViolation } from "../offlineQueue";

// A minimal stored-blob stand-in (no real IndexedDB / File needed).
const STORED = { blob: { type: "image/jpeg" }, meta: { name: "shot.jpg", type: "image/jpeg" } };

function deps(overrides = {}) {
  return {
    getBlob: vi.fn().mockResolvedValue(STORED),
    uploadFile: vi.fn().mockResolvedValue({ file_url: "https://cdn/x.jpg" }),
    createPhoto: vi.fn().mockResolvedValue({ id: "photo-1" }),
    deleteBlob: vi.fn().mockResolvedValue(undefined),
    isUniqueViolation,
    ...overrides,
  };
}

const op = makePhotoCreateOp("cid-1", { project_id: "p1", file_name: "shot.jpg" }, 1);

describe("replayPhotoCreate", () => {
  it("uploads, creates the Photo with the client_op_id, then deletes the blob", async () => {
    const d = deps();
    await replayPhotoCreate(op, d);

    expect(d.uploadFile).toHaveBeenCalledTimes(1);
    expect(d.createPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "p1", file_url: "https://cdn/x.jpg", client_op_id: "cid-1" }),
    );
    expect(d.deleteBlob).toHaveBeenCalledWith("cid-1");
  });

  it("treats a unique-violation on create as already-applied and still drops the blob", async () => {
    const d = deps({ createPhoto: vi.fn().mockRejectedValue({ code: "23505" }) });
    await expect(replayPhotoCreate(op, d)).resolves.toBeUndefined();
    expect(d.deleteBlob).toHaveBeenCalledWith("cid-1"); // dedup -> cleanup, no throw
  });

  it("rethrows a non-dedup create error and keeps the blob (stays queued)", async () => {
    const d = deps({ createPhoto: vi.fn().mockRejectedValue({ code: "23503" }) });
    await expect(replayPhotoCreate(op, d)).rejects.toBeTruthy();
    expect(d.deleteBlob).not.toHaveBeenCalled();
  });

  it("rethrows an upload failure (still offline) before any create/delete", async () => {
    const d = deps({ uploadFile: vi.fn().mockRejectedValue(new Error("Failed to fetch")) });
    await expect(replayPhotoCreate(op, d)).rejects.toThrow(/fetch/i);
    expect(d.createPhoto).not.toHaveBeenCalled();
    expect(d.deleteBlob).not.toHaveBeenCalled();
  });

  it("is a no-op when the blob is already gone (uploaded on a prior attempt)", async () => {
    const d = deps({ getBlob: vi.fn().mockResolvedValue(null) });
    await replayPhotoCreate(op, d);
    expect(d.uploadFile).not.toHaveBeenCalled();
    expect(d.createPhoto).not.toHaveBeenCalled();
  });
});
