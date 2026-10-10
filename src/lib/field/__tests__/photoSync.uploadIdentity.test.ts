import { afterEach, expect, it, vi } from "vitest";
import { UploadFile } from "@/api/client/uploads";
import { getActiveOrgGeneration, setActiveOrgId } from "@/lib/activeOrg";
import { replayPhotoCreate } from "../photoSync";
import { isUniqueViolation, makePhotoCreateOp } from "../offlineQueue";

const { upload } = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { storage: { from: () => ({ upload }) } } }));

afterEach(() => { vi.useRealTimers(); setActiveOrgId(null); vi.resetAllMocks(); });

it("does not retry an old photo upload after identity changes during its backoff", async () => {
  vi.useFakeTimers();
  const org = "11111111-1111-4111-8111-111111111111";
  setActiveOrgId(org);
  const generation = getActiveOrgGeneration();
  const assertActive = () => {
    if (getActiveOrgGeneration() !== generation) throw new Error("Outbox replay identity changed");
  };
  upload.mockResolvedValueOnce({ data: null, error: new TypeError("Failed to fetch") })
    .mockResolvedValue({ data: { path: `${org}/uploads/old-photo.jpg` }, error: null });
  const createPhoto = vi.fn();
  const deleteBlob = vi.fn();
  const result = replayPhotoCreate(makePhotoCreateOp("capture-a", { project_id: "shared-project" }, 1), {
    getBlob: async () => ({ blob: new Blob(["photo"], { type: "image/jpeg" }), meta: { name: "photo.jpg" } }),
    uploadFile: UploadFile,
    createPhoto,
    deleteBlob,
    isUniqueViolation,
  }, assertActive).then((): null => null, (error: unknown) => error);

  await vi.advanceTimersByTimeAsync(0);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(1); // the real retry helper is waiting
  setActiveOrgId(null);
  setActiveOrgId(org); // another account can belong to the same workspace
  await vi.advanceTimersByTimeAsync(2000);

  expect(await result).toBeInstanceOf(Error);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(createPhoto).not.toHaveBeenCalled();
  expect(deleteBlob).not.toHaveBeenCalled();
});
