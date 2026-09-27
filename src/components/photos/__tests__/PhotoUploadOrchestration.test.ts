// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { Insert, RowWithAliases } from "@/api/client/supabaseTypes";
import {
  createPhotoUploadItem,
  type PhotoUploadItemPatch,
  type PhotoUploadProgress,
} from "../PhotoUploadDerive";
import { uploadPhotoItems } from "../usePhotoUploadOrchestration";

function uploadItem(id: string, status: "pending" | "done" = "pending") {
  return {
    ...createPhotoUploadItem(
      new File([id], `${id}.png`, { type: "image/png" }),
      { category: "Progress", location: "Grid A", takenDate: "2026-09-12" },
      `blob:${id}`,
      null,
      id,
    ),
    status,
  };
}

function photoRow(record: Insert<"photos">): RowWithAliases<"photos"> {
  return {
    category: record.category ?? null,
    client_op_id: null,
    created_at: null,
    created_by: null,
    daily_log_id: null,
    deleted_at: null,
    description: record.description ?? null,
    file_name: record.file_name ?? null,
    file_url: record.file_url ?? null,
    id: "photo-row",
    inspection_id: null,
    is_deleted: false,
    location: record.location ?? null,
    metadata: null,
    project_id: record.project_id,
    project_name: null,
    punchlist_item_id: null,
    taken_date: record.taken_date ?? null,
    title: record.title ?? null,
    updated_at: null,
    work_package_id: null,
  };
}

describe("PhotoUpload orchestration", () => {
  it("compresses, uploads through the photo workflow, persists the project payload, and reports progress", async () => {
    const item = uploadItem("north");
    const compressed = new File(["compressed"], "north.jpg", { type: "image/jpeg" });
    const compress = vi.fn().mockResolvedValue(compressed);
    const uploadFile = vi.fn().mockResolvedValue({
      file_url: "org-id/uploads/north.jpg",
      file_name: "north.jpg",
      path: "org-id/uploads/north.jpg",
    });
    const createPhoto = vi.fn(async (record: Insert<"photos">) => photoRow(record));
    const updateItem = vi.fn<(id: string, patch: PhotoUploadItemPatch) => void>();
    const setProgress = vi.fn<(progress: PhotoUploadProgress) => void>();

    await expect(
      uploadPhotoItems({
        items: [item],
        projectId: "project-1",
        updateItem,
        setProgress,
        dependencies: { compress, uploadFile, createPhoto },
      }),
    ).resolves.toEqual({ errors: [] });

    expect(uploadFile).toHaveBeenCalledWith({ file: compressed, workflow: "photo" });
    expect(createPhoto).toHaveBeenCalledWith({
      project_id: "project-1",
      category: "Progress",
      title: "north",
      description: "",
      location: "Grid A",
      taken_date: "2026-09-12",
      file_url: "org-id/uploads/north.jpg",
      file_name: "north.jpg",
    });
    expect(updateItem.mock.calls).toEqual([
      ["north", { status: "uploading", error: null }],
      ["north", { status: "done" }],
    ]);
    expect(setProgress.mock.calls).toEqual([
      [{ done: 0, total: 1 }],
      [{ done: 1, total: 1 }],
    ]);
  });

  it("skips completed retries, retains per-item errors, and only throws when every item fails", async () => {
    const done = uploadItem("done", "done");
    const failed = uploadItem("failed");
    const updateItem = vi.fn<(id: string, patch: PhotoUploadItemPatch) => void>();
    const setProgress = vi.fn<(progress: PhotoUploadProgress) => void>();
    const failure = new Error("storage denied");
    const dependencies = {
      compress: vi.fn().mockImplementation((file: File) => Promise.resolve(file)),
      uploadFile: vi.fn().mockRejectedValue(failure),
      createPhoto: vi.fn(async (record: Insert<"photos">) => photoRow(record)),
    };

    await expect(
      uploadPhotoItems({
        items: [done, failed],
        projectId: "project-1",
        updateItem,
        setProgress,
        dependencies,
      }),
    ).resolves.toEqual({
      errors: [{ name: "failed.png", error: "storage denied" }],
    });
    expect(dependencies.compress).toHaveBeenCalledOnce();
    expect(updateItem).toHaveBeenLastCalledWith("failed", {
      status: "error",
      error: "storage denied",
    });

    await expect(
      uploadPhotoItems({
        items: [failed],
        projectId: "project-1",
        updateItem,
        setProgress,
        dependencies,
      }),
    ).rejects.toThrow("All uploads failed: storage denied");
  });

  it("fails before storage work when the selection or project is missing", async () => {
    const dependencies = {
      compress: vi.fn(),
      uploadFile: vi.fn(),
      createPhoto: vi.fn(),
    };
    const updateItem = vi.fn();
    const setProgress = vi.fn();

    await expect(
      uploadPhotoItems({
        items: [],
        projectId: "project-1",
        updateItem,
        setProgress,
        dependencies,
      }),
    ).rejects.toThrow("No photos selected");
    await expect(
      uploadPhotoItems({
        items: [uploadItem("north")],
        projectId: "",
        updateItem,
        setProgress,
        dependencies,
      }),
    ).rejects.toThrow("Select a project");
    expect(dependencies.uploadFile).not.toHaveBeenCalled();
  });
});
