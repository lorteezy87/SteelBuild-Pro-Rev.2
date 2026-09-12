import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PreflightResult } from "@/lib/rfiPreflight";
import {
  buildDrawingSetOptions,
  buildEmptyRfiForm,
  buildRfiFormPayload,
  buildWorkPackageOptions,
  cleanRfiNumericFields,
  deriveAutoLinkPatch,
  getActiveRfiProjectId,
  getRfiSubmissionError,
  seedRfiForm,
} from "../rfiFormDerivations";
import {
  isAllowedFileReference,
  mergeUniqueFiles,
  selectPdfFiles,
} from "../useRfiPdfAttachments";

const passingPreflight: PreflightResult = {
  checks: [],
  score: 100,
  blockers: [],
  passed: true,
};

const blockedPreflight: PreflightResult = {
  checks: [],
  score: 50,
  blockers: [{ key: "reference", label: "Add reference", pass: false, required: true }],
  passed: false,
};

function fakeFile(name: string, size: number, type: string): File {
  return { name, size, type } as File;
}

describe("RFI form container invariants", () => {
  const modalSource = readFileSync(new URL("../RFIFormModal.jsx", import.meta.url), "utf8");

  it("uses the shared sequence allocator without a client-derived fallback", () => {
    expect(modalSource).toContain("getNextFormattedNumber");
    expect(modalSource).not.toMatch(/Math\.max|Date\.now/);
  });

  it("does not use a form element or Radix Dialog", () => {
    expect(modalSource).not.toMatch(/<form\b|<\/form>/);
    expect(modalSource).not.toMatch(/@radix-ui\/react-dialog|<Dialog/);
  });
});

describe("RFI form defaulting", () => {
  it("preserves the exact create defaults and project-owned prefill precedence", () => {
    const form = seedRfiForm({
      projectId: "project-1",
      initialDrawingReference: "S1.1 / Grid A",
      prefill: {
        project_id: "wrong-project",
        title: "Clarify connection",
        priority: "High",
      },
      today: "2026-09-12",
    });

    expect(form).toEqual({
      ...buildEmptyRfiForm("project-1", "2026-09-12"),
      drawing_reference: "S1.1 / Grid A",
      title: "Clarify connection",
      priority: "High",
      project_id: "project-1",
    });
  });

  it("hydrates metadata-held fields without losing top-level edit values", () => {
    const form = seedRfiForm({
      projectId: "project-1",
      rfi: {
        id: "rfi-1",
        project_id: "project-2",
        title: "Existing",
        metadata: {
          rfi_type: "Conflict",
          proposed_solution: "Use detail 4",
          fab_hold: true,
          piece_marks: "B-1",
          fab_impact: true,
        },
      },
      today: "2026-09-12",
    });

    expect(form.project_id).toBe("project-2");
    expect(form.title).toBe("Existing");
    expect(form.rfi_type).toBe("Conflict");
    expect(form.proposed_solution).toBe("Use detail 4");
    expect(form.fab_hold).toBe(true);
    expect(form.piece_marks).toBe("B-1");
    expect(form.fab_impact).toBe(true);
  });
});

describe("RFI payload derivation", () => {
  it("folds local fields into metadata and strips their top-level keys", () => {
    const form = {
      ...buildEmptyRfiForm("project-1", "2026-09-12"),
      title: "Clarify weld",
      rfi_type: "Design Clarification",
      proposed_solution: "Use CJP",
      fab_hold: true,
      piece_marks: "  B-1, B-2  ",
      fab_impact: true,
      metadata: { source: "revision", preflight_override: { reason: "old" } },
    };

    const payload = buildRfiFormPayload(form, passingPreflight);
    expect(payload).not.toHaveProperty("rfi_type");
    expect(payload).not.toHaveProperty("fab_hold");
    expect(payload.metadata).toEqual({
      source: "revision",
      rfi_type: "Design Clarification",
      proposed_solution: "Use CJP",
      fab_hold: true,
      piece_marks: "B-1, B-2",
      fab_impact: true,
      erection_impact: false,
      drawing_revision_required: false,
      change_order_likely: false,
      preflight_score: 100,
      preflight_override: { reason: "old" },
    });
  });

  it("records a deterministic override audit entry and blocker keys", () => {
    const payload = buildRfiFormPayload(
      buildEmptyRfiForm("project-1", "2026-09-12"),
      blockedPreflight,
      "Field work is waiting",
      "2026-09-12T21:30:00.000Z",
    );

    expect(payload.metadata.preflight_override).toEqual({
      reason: "Field work is waiting",
      score: 50,
      blockers: ["reference"],
      at: "2026-09-12T21:30:00.000Z",
    });
  });

  it("coerces optional numeric fields exactly as the mutation expects", () => {
    expect(cleanRfiNumericFields({
      cost_impact_amount: "",
      schedule_impact_days: "4",
      title: "RFI",
    })).toEqual({
      cost_impact_amount: null,
      schedule_impact_days: 4,
      title: "RFI",
    });
  });
});

describe("RFI validation and linked-record derivation", () => {
  it("keeps title and preflight override validation messages stable", () => {
    const form = buildEmptyRfiForm("project-1", "2026-09-12");
    expect(getRfiSubmissionError(form, passingPreflight, false, "")).toBe("Title is required");

    form.title = "Clarify weld";
    expect(getRfiSubmissionError(form, blockedPreflight, false, "")).toContain(
      "Preflight: resolve Add reference",
    );
    expect(getRfiSubmissionError(form, blockedPreflight, true, " ")).toBe(
      "Enter a reason to override the preflight and submit",
    );
    expect(getRfiSubmissionError(form, blockedPreflight, true, "Proceed")).toBeNull();
  });

  it("derives active project and fail-closed auto-link patches", () => {
    expect(getActiveRfiProjectId("form-project", "prop-project")).toBe("form-project");
    expect(getActiveRfiProjectId("", "prop-project")).toBe("prop-project");
    expect(deriveAutoLinkPatch({ type: "sequence", entityId: "wp-1" })).toEqual({
      work_package_id: "wp-1",
    });
    expect(deriveAutoLinkPatch({
      type: "drawing",
      matchedEntity: { drawing_set_id: "set-1" },
    })).toEqual({ drawing_set_id: "set-1" });
    expect(deriveAutoLinkPatch({ type: "drawing", matchedEntity: {} })).toBeNull();
  });

  it("keeps linked-record labels and deleted-set filtering stable", () => {
    expect(buildWorkPackageOptions([
      { id: "work-package-1", wp_number: "WP-01", name: "Area A" },
      { id: "abcdefgh-more" },
    ])).toEqual([
      { value: "work-package-1", label: "WP-01 — Area A" },
      { value: "abcdefgh-more", label: "abcdefgh" },
    ]);
    expect(buildDrawingSetOptions([
      { id: "set-1", set_name: "Main", revision: "2" },
      { id: "set-2", set_name: "Deleted", is_deleted: true },
    ])).toEqual([{ value: "set-1", label: "Main — Rev 2" }]);
  });
});

describe("RFI PDF attachment derivation", () => {
  it("accepts PDF MIME types or extensions and identifies rejected files", () => {
    const pdf = fakeFile("sketch.bin", 100, "application/pdf");
    const extensionPdf = fakeFile("response.PDF", 200, "");
    const image = fakeFile("photo.png", 300, "image/png");
    expect(selectPdfFiles([pdf, extensionPdf, image])).toEqual({
      accepted: [pdf, extensionPdf],
      rejectedNames: ["photo.png"],
    });
  });

  it("deduplicates by the existing name-and-size contract", () => {
    const first = fakeFile("rfi.pdf", 100, "application/pdf");
    const duplicate = fakeFile("rfi.pdf", 100, "application/pdf");
    const second = fakeFile("rfi.pdf", 200, "application/pdf");
    expect(mergeUniqueFiles([first], [duplicate, second])).toEqual([first, second]);
  });

  it("allows web URLs and storage paths while blocking unsafe protocols", () => {
    expect(isAllowedFileReference("https://example.com/rfi.pdf")).toBe(true);
    expect(isAllowedFileReference("rfi-files/project/rfi.pdf")).toBe(true);
    expect(isAllowedFileReference("javascript:alert(1)")).toBe(false);
    expect(isAllowedFileReference("data:text/html,test")).toBe(false);
    expect(isAllowedFileReference(" ")).toBe(false);
  });
});
