// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { compressPhotoForUpload, extractPhotoExifDate } from "../PhotoUploadMedia";

function jpegWithExifDate(date: string): File {
  const bytes = new Uint8Array(96);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0xffd8);
  view.setUint16(2, 0xffe1);
  view.setUint16(4, 90);
  view.setUint32(6, 0x45786966);
  view.setUint16(12, 0x4949);
  view.setUint16(14, 42, true);
  view.setUint32(16, 8, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 0x8769, true);
  view.setUint32(30, 26, true);
  view.setUint16(38, 1, true);
  view.setUint16(40, 0x9003, true);
  view.setUint32(48, 44, true);
  new TextEncoder().encodeInto(date, bytes.subarray(56, 75));
  return {
    type: "image/jpeg",
    slice: () => ({ arrayBuffer: async () => bytes.buffer }),
  } as unknown as File;
}

describe("PhotoUpload media handling", () => {
  it("extracts DateTimeOriginal as the existing date-only metadata value", async () => {
    await expect(extractPhotoExifDate(jpegWithExifDate("2026:09:12 11:22:33"))).resolves.toBe(
      "2026-09-12",
    );
  });

  it("returns null for non-JPEG files and malformed JPEG metadata", async () => {
    await expect(
      extractPhotoExifDate(new File(["png"], "photo.png", { type: "image/png" })),
    ).resolves.toBeNull();
    await expect(
      extractPhotoExifDate(new File(["bad"], "photo.jpg", { type: "image/jpeg" })),
    ).resolves.toBeNull();
  });

  it("keeps non-images and images below the original 1 MB threshold byte-identical", async () => {
    const text = new File(["text"], "notes.txt", { type: "text/plain" });
    const image = new File(["image"], "photo.jpg", { type: "image/jpeg" });

    await expect(compressPhotoForUpload(text)).resolves.toBe(text);
    await expect(compressPhotoForUpload(image)).resolves.toBe(image);
  });
});
