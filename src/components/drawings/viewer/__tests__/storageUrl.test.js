import { describe, it, expect } from "vitest";
import { extractStoragePathFromSignedUrl } from "../storageUrl";

describe("extractStoragePathFromSignedUrl", () => {
  it("extracts the path from a Supabase signed URL", () => {
    const url =
      "https://abc.supabase.co/storage/v1/object/sign/drawings/projects/123/sheet-S-100.pdf?token=eyJh";
    expect(extractStoragePathFromSignedUrl(url)).toBe(
      "projects/123/sheet-S-100.pdf",
    );
  });

  it("extracts the path from a Supabase public URL", () => {
    const url =
      "https://abc.supabase.co/storage/v1/object/public/drawings/projects/123/file.pdf";
    expect(extractStoragePathFromSignedUrl(url)).toBe(
      "projects/123/file.pdf",
    );
  });

  it("decodes percent-encoded characters in the path", () => {
    const url =
      "https://abc.supabase.co/storage/v1/object/sign/drawings/projects/Capstone%20Building/S-100.pdf?token=x";
    expect(extractStoragePathFromSignedUrl(url)).toBe(
      "projects/Capstone Building/S-100.pdf",
    );
  });

  it("returns null when the URL doesn't match the Supabase shape", () => {
    expect(extractStoragePathFromSignedUrl("https://example.com/file.pdf")).toBe(null);
    expect(extractStoragePathFromSignedUrl("projects/123/raw-path.pdf")).toBe(null);
  });

  it("returns null on null/undefined/non-string input without throwing", () => {
    expect(extractStoragePathFromSignedUrl(null)).toBe(null);
    expect(extractStoragePathFromSignedUrl(undefined)).toBe(null);
  });
});
