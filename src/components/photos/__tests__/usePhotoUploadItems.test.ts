// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePhotoUploadItems } from "../usePhotoUploadItems";

const { extractPhotoExifDate, toast } = vi.hoisted(() => ({
  extractPhotoExifDate: vi.fn(),
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("../PhotoUploadMedia", () => ({ extractPhotoExifDate }));
vi.mock("sonner", () => ({ toast }));

describe("usePhotoUploadItems", () => {
  const createObjectURL = vi.fn<(file: File) => string>();
  const revokeObjectURL = vi.fn<(url: string) => void>();

  beforeEach(() => {
    extractPhotoExifDate.mockReset();
    extractPhotoExifDate.mockResolvedValue(null);
    toast.error.mockReset();
    toast.warning.mockReset();
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
    createObjectURL.mockImplementation((file) => `blob:${file.name}`);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
  });

  it("owns each preview until removal or unmount without revoking it on metadata updates", async () => {
    const first = new File(["first"], "first.jpg", { type: "image/jpeg" });
    const second = new File(["second"], "second.png", { type: "image/png" });
    const { result, unmount } = renderHook(() => usePhotoUploadItems());

    await act(() =>
      result.current.addFiles([first, second], {
        category: "Progress",
        location: "Grid A",
        takenDate: "2026-09-12",
      }),
    );
    expect(result.current.items.map(({ preview }) => preview)).toEqual([
      "blob:first.jpg",
      "blob:second.png",
    ]);

    act(() => result.current.updateItem(result.current.items[0].id, { title: "Updated" }));
    expect(revokeObjectURL).not.toHaveBeenCalled();

    act(() => result.current.removeItem(result.current.items[0].id));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first.jpg");

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second.png");
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("keeps the existing unsupported-file and capacity warnings", async () => {
    const { result } = renderHook(() => usePhotoUploadItems());
    const defaults = {
      category: "Progress" as const,
      location: "",
      takenDate: "2026-09-12",
    };

    await act(() =>
      result.current.addFiles([new File(["x"], "notes.txt", { type: "text/plain" })], defaults),
    );
    expect(toast.error).toHaveBeenCalledWith("Only image files are supported");

    await act(() =>
      result.current.addFiles(
        Array.from(
          { length: 26 },
          (_, index) => new File(["x"], `${index}.jpg`, { type: "image/jpeg" }),
        ),
        defaults,
      ),
    );
    expect(toast.warning).toHaveBeenCalledWith("Only 25 more photos can be added");
    expect(result.current.items).toHaveLength(25);
  });
});
