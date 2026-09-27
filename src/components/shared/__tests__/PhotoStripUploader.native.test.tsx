// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { captureNativePhoto, nativeImpact, uploadFile } = vi.hoisted(() => ({
  captureNativePhoto: vi.fn(),
  nativeImpact: vi.fn(),
  uploadFile: vi.fn(),
}));

vi.mock("@/lib/native/platform", () => ({ isNativePlatform: () => true }));
vi.mock("@/lib/native/capabilities", () => ({
  captureNativePhoto,
  nativeImpact,
  isNativeActionCancelled: () => false,
}));
vi.mock("@/api/supabaseClient", () => ({
  integrations: { Core: { UploadFile: uploadFile } },
}));
vi.mock("@/utils/compressImage", () => ({ compressImage: (file: File) => Promise.resolve(file) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import PhotoStripUploader from "@/components/shared/PhotoStripUploader";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PhotoStripUploader native capture", () => {
  it("takes a photo and uploads it through the existing field-photo workflow", async () => {
    const photo = new File(["image"], "jobsite.jpg", { type: "image/jpeg" });
    captureNativePhoto.mockResolvedValue(photo);
    uploadFile.mockResolvedValue({ file_url: "https://files.example/jobsite.jpg", path: "photos/jobsite.jpg" });
    const onChange = vi.fn();

    render(<PhotoStripUploader value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));

    await waitFor(() => expect(uploadFile).toHaveBeenCalledWith({ file: photo, workflow: "photo" }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        file_url: "https://files.example/jobsite.jpg",
        path: "photos/jobsite.jpg",
        name: "jobsite.jpg",
      }),
    ]);
    expect(nativeImpact).toHaveBeenCalledWith("medium");
  });

  it("prevents photo removal while an upload is still running", async () => {
    let finishUpload: ((value: { file_url: string }) => void) | undefined;
    uploadFile.mockReturnValue(new Promise((resolve) => { finishUpload = resolve; }));
    const photo = new File(["image"], "jobsite.jpg", { type: "image/jpeg" });
    captureNativePhoto.mockResolvedValue(photo);

    render(
      <PhotoStripUploader
        value={[{ file_url: "https://files.example/existing.jpg", name: "existing.jpg" }]}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));

    await waitFor(() => expect(uploadFile).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeDisabled();
    finishUpload?.({ file_url: "https://files.example/jobsite.jpg" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove photo" })).not.toBeDisabled());
  });
});
