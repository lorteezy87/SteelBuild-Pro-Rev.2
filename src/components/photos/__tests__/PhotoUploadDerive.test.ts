// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  createPhotoInsert,
  createPhotoUploadItem,
  defaultPhotoUploadDate,
  photoTitleFromFilename,
  selectPhotoFiles,
  totalPhotoUploadBytes,
} from "../PhotoUploadDerive";

describe("PhotoUpload derivations", () => {
  const defaults = {
    category: "Progress" as const,
    location: "North wing",
    takenDate: "2026-09-12",
  };

  it("keeps image MIME filtering and the 25-photo selection cap", () => {
    const images = Array.from(
      { length: 26 },
      (_, index) => new File(["x"], `photo-${index}.jpg`, { type: "image/jpeg" }),
    );
    const text = new File(["x"], "notes.txt", { type: "text/plain" });

    expect(selectPhotoFiles([text], 0)).toEqual({ kind: "empty" });
    expect(selectPhotoFiles(images, 25)).toEqual({ kind: "full" });

    const selection = selectPhotoFiles([...images, text], 2);
    expect(selection.kind).toBe("accepted");
    if (selection.kind !== "accepted") throw new Error("Expected accepted selection");
    expect(selection.files).toHaveLength(23);
    expect(selection.omittedCount).toBe(3);
    expect(selection.remainingCapacity).toBe(23);
  });

  it("derives the original filename/default metadata with EXIF precedence", () => {
    const file = new File(["photo"], "grid.a.progress.jpeg", {
      type: "image/jpeg",
      lastModified: 1,
    });
    const item = createPhotoUploadItem(
      file,
      defaults,
      "blob:preview",
      "2026-09-10",
      "item-1",
    );

    expect(item).toEqual({
      id: "item-1",
      file,
      preview: "blob:preview",
      title: "grid.a.progress",
      description: "",
      location: "North wing",
      category: "Progress",
      taken_date: "2026-09-10",
      status: "pending",
      error: null,
    });
    expect(photoTitleFromFilename("no-extension")).toBe("no-extension");
    expect(defaultPhotoUploadDate(new Date("2026-09-12T23:30:00-07:00"))).toBe("2026-09-13");
  });

  it("creates the same project-scoped Photo insert payload and byte total", () => {
    const first = createPhotoUploadItem(
      new File(["12"], "first.png", { type: "image/png" }),
      defaults,
      "blob:first",
      null,
      "first",
    );
    const second = createPhotoUploadItem(
      new File(["345"], "second.png", { type: "image/png" }),
      defaults,
      "blob:second",
      null,
      "second",
    );
    const compressed = new File(["compressed"], "first.jpg", { type: "image/jpeg" });

    expect(createPhotoInsert(first, "project-1", compressed, "org/uploads/photo.jpg")).toEqual({
      project_id: "project-1",
      category: "Progress",
      title: "first",
      description: "",
      location: "North wing",
      taken_date: "2026-09-12",
      file_url: "org/uploads/photo.jpg",
      file_name: "first.jpg",
    });
    expect(totalPhotoUploadBytes([first, second])).toBe(5);
  });
});
