import { describe, expect, it } from "vitest";
import {
  validateUpload,
  assertUploadAllowed,
  sanitizeFilename,
  fileExtension,
  getUploadProfile,
  effectiveMaxBytes,
  STORAGE_BUCKET_MAX_BYTES,
  DANGEROUS_EXTENSIONS,
} from "../uploadValidation";

const MB = 1024 * 1024;

/** Minimal stand-in for a File — validateUpload only reads name + size. */
function f(name: string, size = 1024): { name: string; size: number } {
  return { name, size };
}

describe("fileExtension", () => {
  it("lowercases and strips the dot", () => {
    expect(fileExtension("Drawing.PDF")).toBe("pdf");
    expect(fileExtension("a.b.TGZ")).toBe("tgz");
  });
  it("handles no extension and dotfiles", () => {
    expect(fileExtension("README")).toBe("");
    expect(fileExtension(".gitignore")).toBe("");
    expect(fileExtension("")).toBe("");
    expect(fileExtension(null)).toBe("");
  });
  it("ignores directory components", () => {
    expect(fileExtension("folder/sub/file.csv")).toBe("csv");
    expect(fileExtension("C:\\path\\to\\file.XLSX")).toBe("xlsx");
  });
});

describe("validateUpload — per-workflow allowlist", () => {
  it("accepts a PDF for the drawings workflow", () => {
    expect(validateUpload(f("S-101.pdf"), "drawings").ok).toBe(true);
  });

  it("rejects a non-PDF for the drawings workflow", () => {
    const r = validateUpload(f("S-101.docx"), "drawings");
    expect(r.ok).toBe(false);
    expect(r.error).toContain(".pdf");
  });

  it("accepts images for the photo workflow and rejects PDFs", () => {
    expect(validateUpload(f("site.jpg"), "photo").ok).toBe(true);
    expect(validateUpload(f("site.HEIC"), "photo").ok).toBe(true);
    expect(validateUpload(f("plan.pdf"), "photo").ok).toBe(false);
  });

  it("OCR accepts both images and PDFs", () => {
    expect(validateUpload(f("ticket.pdf"), "ocr").ok).toBe(true);
    expect(validateUpload(f("ticket.png"), "ocr").ok).toBe(true);
    expect(validateUpload(f("ticket.dwg"), "ocr").ok).toBe(false);
  });

  it("attachment accepts the common office + image + pdf mix", () => {
    for (const name of ["a.pdf", "a.jpg", "a.png", "a.docx", "a.xlsx", "a.csv"]) {
      expect(validateUpload(f(name), "attachment").ok).toBe(true);
    }
    expect(validateUpload(f("a.dwg"), "attachment").ok).toBe(false);
  });

  it("rejects a file with no extension under an allowlisted workflow", () => {
    expect(validateUpload(f("noext"), "drawings").ok).toBe(false);
  });
});

describe("validateUpload — size caps", () => {
  it("rejects a file over the workflow cap", () => {
    const r = validateUpload(f("big.jpg", 80 * MB), "photo"); // photo cap = 50 MB
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too large/i);
  });

  it("accepts a file at/under the enforced cap", () => {
    // Was 100 MB against the drawings profile's 150 MB cap. That never
    // actually worked: the app-files bucket stops at 50 MB, so a 100 MB PDF
    // passed here and then died mid-POST with an unreadable network error.
    // The enforced cap is now min(workflow, bucket) — see "the Storage bucket
    // ceiling" below.
    expect(validateUpload(f("ok.pdf", 40 * MB), "drawings").ok).toBe(true);
  });

  it("applies the absolute ceiling on the default backstop", () => {
    expect(validateUpload(f("blob.dat", 700 * MB), "default").ok).toBe(false);
    expect(validateUpload(f("blob.dat", 40 * MB), "default").ok).toBe(true);
  });
});

describe("validateUpload — default backstop", () => {
  it("allows arbitrary non-dangerous extensions", () => {
    expect(validateUpload(f("data.msg"), "default").ok).toBe(true);
    expect(validateUpload(f("notes.eml"), "default").ok).toBe(true);
    expect(validateUpload(f("model.ifc.gz"), "default").ok).toBe(true);
  });

  it("defaults to the backstop when no workflow is given", () => {
    expect(validateUpload(f("data.bin.unknown")).ok).toBe(true);
  });
});

describe("validateUpload — dangerous extensions blocked everywhere", () => {
  it("blocks executables/scripts on the default backstop", () => {
    for (const ext of ["exe", "bat", "sh", "js", "html", "php", "dll", "ps1"]) {
      const r = validateUpload(f(`payload.${ext}`), "default");
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/security/i);
    }
  });

  it("blocks the TS module + wasm variants that bypass the js/mjs/cjs entries", () => {
    for (const ext of ["mts", "cts", "wasm"]) {
      const r = validateUpload(f(`payload.${ext}`), "default");
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/security/i);
    }
  });

  it("blocks dangerous extensions even inside a broad workflow", () => {
    expect(validateUpload(f("payload.exe"), "documents").ok).toBe(false);
    expect(validateUpload(f("payload.js"), "attachment").ok).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(validateUpload(f("PAYLOAD.EXE"), "default").ok).toBe(false);
  });

  it("the dangerous set covers the obvious offenders", () => {
    ["exe", "bat", "sh", "js", "vbs", "ps1", "jar", "php", "html", "mts", "cts", "wasm"].forEach((e) =>
      expect(DANGEROUS_EXTENSIONS.has(e)).toBe(true),
    );
  });
});

describe("validateUpload — guards", () => {
  it("rejects a missing file", () => {
    expect(validateUpload(null).ok).toBe(false);
    expect(validateUpload(undefined).ok).toBe(false);
  });

  it("does not enforce size when size is unknown", () => {
    expect(validateUpload({ name: "x.pdf" }, "drawings").ok).toBe(true);
  });
});

describe("assertUploadAllowed", () => {
  it("throws for a rejected file", () => {
    expect(() => assertUploadAllowed(f("p.exe"), "default")).toThrow();
  });
  it("does not throw for an allowed file", () => {
    expect(() => assertUploadAllowed(f("ok.pdf"), "drawings")).not.toThrow();
  });
});

describe("getUploadProfile", () => {
  it("falls back to the default backstop for unknown/empty keys", () => {
    expect(getUploadProfile(undefined).allowedExtensions).toBeNull();
    expect(getUploadProfile(null).allowedExtensions).toBeNull();
    expect(getUploadProfile("drawings").allowedExtensions).toEqual(["pdf"]);
  });
});

describe("sanitizeFilename", () => {
  it("passes normal filenames through unchanged", () => {
    expect(sanitizeFilename("Sheet S-101 (Rev 2).pdf")).toBe("Sheet S-101 (Rev 2).pdf");
    expect(sanitizeFilename("anchor_bolts.xlsx")).toBe("anchor_bolts.xlsx");
  });

  it("strips directory components", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\x\\plan.pdf")).toBe("plan.pdf");
  });

  it("strips control characters", () => {
    const name = "bad" + String.fromCharCode(7) + "na" + String.fromCharCode(0) + "me.pdf";
    expect(sanitizeFilename(name)).toBe("badname.pdf");
  });

  it("removes leading dots", () => {
    expect(sanitizeFilename("...hidden.txt")).toBe("hidden.txt");
  });

  it("falls back to 'file' when nothing usable remains", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename(null)).toBe("file");
    expect(sanitizeFilename("///")).toBe("file");
  });

  it("bounds overly long names while keeping the extension", () => {
    const long = "a".repeat(500) + ".pdf";
    const out = sanitizeFilename(long);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith(".pdf")).toBe(true);
  });
});

describe("the Storage bucket ceiling", () => {
  // The per-workflow caps are generous DoS limits, not the real ceiling: the
  // app-files bucket stops at 50 MB. Anything in between passed client
  // validation and then died mid-upload, because a single-shot POST over the
  // bucket limit is cut off in flight — the browser reports a protocol error
  // and supabase-js reports "Failed to fetch", telling the user nothing about
  // size. These pin the clamp that turns that into an instant, readable no.
  const MB = 1024 * 1024;

  it("matches the app-files bucket's configured file_size_limit", () => {
    // Verified against storage.buckets on 2026-09-12: file_size_limit is
    // 52428800. If the bucket is raised, raise this in the same change.
    expect(STORAGE_BUCKET_MAX_BYTES).toBe(52428800);
  });

  it("never enforces more than the bucket will accept", () => {
    for (const workflow of [
      "drawings", "documents", "photo", "ocr",
      "model3d", "import", "attachment", "default",
    ] as const) {
      const profile = getUploadProfile(workflow);
      expect(effectiveMaxBytes(profile), workflow).toBeLessThanOrEqual(STORAGE_BUCKET_MAX_BYTES);
    }
  });

  it("keeps a workflow cap that is already tighter than the bucket", () => {
    // ocr is 25 MB — the bucket must not loosen it.
    expect(effectiveMaxBytes(getUploadProfile("ocr"))).toBe(25 * MB);
  });

  it("rejects a file over the bucket limit even when the workflow allows it", () => {
    // drawings claims 150 MB. An 80 MB PDF used to sail through here and fail
    // mid-POST with an unreadable network error.
    const res = validateUpload({ name: "set.pdf", size: 80 * MB }, "drawings");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/too large \(80 MB\)/i);
    expect(res.error).toMatch(/limit for drawing uploads is 50 MB/i);
  });

  it("quotes the ENFORCED limit, not the workflow's advertised one", () => {
    // Saying "the limit is 150 MB" while refusing at 50 MB is worse than no
    // message at all.
    const res = validateUpload({ name: "model.ifc", size: 200 * MB }, "model3d");
    expect(res.ok).toBe(false);
    expect(res.error).not.toMatch(/600 MB/);
    expect(res.error).toMatch(/50 MB/);
  });

  it("still accepts a file inside the bucket limit", () => {
    expect(validateUpload({ name: "rev.pdf", size: 385 * 1024 }, "drawings").ok).toBe(true);
    expect(validateUpload({ name: "big.pdf", size: 49 * MB }, "drawings").ok).toBe(true);
  });

  it("rejects exactly at the boundary, not one byte early", () => {
    expect(validateUpload({ name: "a.pdf", size: STORAGE_BUCKET_MAX_BYTES }, "drawings").ok).toBe(true);
    expect(validateUpload({ name: "a.pdf", size: STORAGE_BUCKET_MAX_BYTES + 1 }, "drawings").ok).toBe(false);
  });
});
