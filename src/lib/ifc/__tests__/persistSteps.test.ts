import { describe, expect, it } from "vitest";
import {
  STORAGE_OBJECT_MAX_BYTES,
  assertStorageObjectSize,
  describePersistFailure,
  describePersistProgress,
  formatMb,
} from "../persistSteps";

describe("assertStorageObjectSize", () => {
  it("accepts anything up to the bucket ceiling", () => {
    expect(() => assertStorageObjectSize(0)).not.toThrow();
    expect(() => assertStorageObjectSize(STORAGE_OBJECT_MAX_BYTES)).not.toThrow();
    expect(() => assertStorageObjectSize(Number.NaN)).not.toThrow();
  });

  it("names the size and the limit when the object cannot fit", () => {
    expect(() => assertStorageObjectSize(STORAGE_OBJECT_MAX_BYTES + 1024 * 1024, "compressed model"))
      .toThrow(/compressed model is 51 MB; storage accepts files up to 50 MB/);
  });
});

describe("describePersistFailure", () => {
  it("labels each step", () => {
    const err = new Error("boom");
    expect(describePersistFailure("extract", err)).toBe("Couldn't read the piece list from the IFC: boom");
    expect(describePersistFailure("compress", err)).toBe("Couldn't compress the IFC for upload: boom");
    expect(describePersistFailure("upload", err)).toBe("Couldn't upload the model to storage: boom");
    // Must NOT promise the previous model is still active — the import rolls
    // back, but a rollback can fail too, and that wording sent operators into a
    // retry loop that stacked extra rosters on the project.
    const register = describePersistFailure("register", err);
    expect(register).toMatch(/^Model uploaded, but the piece roster didn't save: boom\./);
    expect(register).not.toMatch(/previous model is still active/);
    expect(register).toMatch(/check the 3D tab before retrying/);
  });

  it("reads PostgREST-style error objects and plain strings", () => {
    expect(describePersistFailure("register", { code: "23505", message: "duplicate key" })).toContain("duplicate key");
    expect(describePersistFailure("upload", "Workspace is still loading")).toContain("Workspace is still loading");
  });
});

describe("describePersistProgress", () => {
  it("distinguishes the property index pass from the part pass", () => {
    expect(describePersistProgress({ step: "extracting", phase: "index", done: 0, total: 0 }))
      .toBe("Saving to project… indexing properties");
    expect(describePersistProgress({ step: "extracting", phase: "index", done: 1500, total: 130000 }))
      .toBe("Saving to project… indexing properties 1,500 / 130,000");
    expect(describePersistProgress({ step: "extracting", phase: "parts", done: 250, total: 26000 }))
      .toBe("Saving to project… reading pieces 250 / 26,000");
  });

  it("shows the saving stage caption", () => {
    expect(describePersistProgress({ step: "saving", stage: "uploading 8.2 MB" })).toBe("Saving to project… uploading 8.2 MB");
    expect(describePersistProgress({ step: "saving" })).toBe("Saving to project…");
  });

  it("formats megabytes", () => {
    expect(formatMb(50 * 1024 * 1024)).toBe("50 MB");
    expect(formatMb(8.24 * 1024 * 1024)).toBe("8.2 MB");
    expect(formatMb(0)).toBe("0 MB");
  });
});
