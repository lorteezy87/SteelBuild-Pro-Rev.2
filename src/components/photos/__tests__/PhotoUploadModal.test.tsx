// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PhotoUploadModal from "../PhotoUploadModal";

const { projectList, photoCreate, uploadFile, toast } = vi.hoisted(() => ({
  projectList: vi.fn(),
  photoCreate: vi.fn(),
  uploadFile: vi.fn(),
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Project: { list: projectList },
    Photo: { create: photoCreate },
  },
  integrations: {
    Core: { UploadFile: uploadFile },
  },
}));
vi.mock("sonner", () => ({ toast }));

describe("PhotoUploadModal", () => {
  const createObjectURL = vi.fn<(file: File) => string>();
  const revokeObjectURL = vi.fn<(url: string) => void>();

  beforeEach(() => {
    projectList.mockReset();
    projectList.mockResolvedValue([
      { id: "project-1", name: "Arena" },
      { id: "project-2", name: "Warehouse" },
    ]);
    photoCreate.mockReset();
    photoCreate.mockResolvedValue({ id: "photo-1" });
    uploadFile.mockReset();
    uploadFile.mockResolvedValue({
      file_url: "org-id/uploads/photo.png",
      file_name: "photo.png",
      path: "org-id/uploads/photo.png",
    });
    toast.success.mockReset();
    toast.warning.mockReset();
    toast.error.mockReset();
    createObjectURL.mockReset();
    createObjectURL.mockReturnValue("blob:photo");
    revokeObjectURL.mockReset();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
  });

  it("preserves defaults, item editing, project scoping, upload feedback, and close behavior", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["projects"], [
      { id: "project-1", name: "Arena" },
      { id: "project-2", name: "Warehouse" },
    ]);
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const onClose = vi.fn();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <PhotoUploadModal projectId="project-1" onClose={onClose} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("→ Arena")).toBeInTheDocument();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).toHaveAttribute("multiple");
    expect(input).not.toHaveAttribute("capture");

    const file = new File(["photo"], "north-grid.png", { type: "image/png" });
    fireEvent.change(input!, { target: { files: [file] } });
    expect(await screen.findByDisplayValue("north-grid")).toBeInTheDocument();

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "Safety" } });
    expect(screen.getAllByRole("combobox")[2]).toHaveValue("Safety");

    const locationInputs = screen.getAllByPlaceholderText("Location");
    const defaultLocation = screen.getByPlaceholderText("e.g. North wing");
    fireEvent.change(defaultLocation, { target: { value: "Grid B" } });
    expect(locationInputs[0]).toHaveValue("");
    fireEvent.blur(defaultLocation);
    expect(locationInputs[0]).toHaveValue("Grid B");

    fireEvent.click(screen.getByRole("button", { name: "Upload 1 Photo" }));

    await waitFor(() => expect(photoCreate).toHaveBeenCalledOnce());
    expect(uploadFile).toHaveBeenCalledWith({ file, workflow: "photo" });
    expect(photoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "project-1",
        category: "Safety",
        title: "north-grid",
        location: "Grid B",
        file_url: "org-id/uploads/photo.png",
        file_name: "north-grid.png",
      }),
    );
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["photos"] });
      expect(toast.success).toHaveBeenCalledWith("1 photo uploaded");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("keeps the modal open and item error visible after a failed upload", async () => {
    uploadFile.mockRejectedValue(new Error("Storage unavailable"));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const onClose = vi.fn();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <PhotoUploadModal projectId="project-1" onClose={onClose} />
      </QueryClientProvider>,
    );

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(input!, {
      target: { files: [new File(["photo"], "failed.png", { type: "image/png" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Upload 1 Photo" }));

    expect(await screen.findByText("Storage unavailable")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("All uploads failed: Storage unavailable");
    expect(onClose).not.toHaveBeenCalled();
  });
});
