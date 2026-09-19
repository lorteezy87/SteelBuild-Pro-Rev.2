import { describe, it, expect } from "vitest";
import { buildIntakeRecords, registerFromMatch, type UploadMatch } from "@/lib/docControl";

const NOW = new Date("2026-09-18T17:00:00.000Z");

function intake(matches: UploadMatch[], overrides: Record<string, unknown> = {}) {
  return buildIntakeRecords({
    matches,
    setMeta: {
      projectName: "Desert Ridge Phase 2",
      revision: "IFC",
      issueDate: "04/02/2026",
      authorizingEngineer: "J. Ruiz, P.E.",
    },
    scanned: false,
    projectId: "p1",
    now: NOW,
    ...overrides,
  });
}

const revised: UploadMatch = {
  sheetNumber: "S-101",
  change: "revised",
  oldSheet: {
    id: "d1",
    sheetNumber: "S-101",
    sheetTitle: "FOUNDATION PLAN",
    revisionNumber: "1",
    extractedText: "NOTE 1",
    callouts: [{ targetSheetNumber: "S-401", text: "SEE 3/S-401" }],
  },
  newSheet: { sheetNumber: "S-101", sheetTitle: "FOUNDATION PLAN", revision: "IFC", date: "04/02/2026" },
};

describe("registerFromMatch", () => {
  it("maps a revised match onto the sheet of record", () => {
    const xref = registerFromMatch(revised);
    expect(xref.status).toBe("revision-of-record");
    expect(xref.matched?.id).toBe("d1");
  });

  it("maps an added match to new-to-register", () => {
    expect(registerFromMatch({ sheetNumber: "S-900", change: "added" }).status).toBe("new-to-register");
  });

  it("maps an ambiguous numbered match to a duplicate, never to 'new'", () => {
    const xref = registerFromMatch({
      sheetNumber: "S-101",
      change: "ambiguous",
      ambiguousReason: "Multiple existing sheets share exact number \"S-101\".",
    });
    expect(xref.status).toBe("duplicate-in-register");
    expect(xref.note).toContain("Multiple existing sheets");
  });

  it("maps an ambiguous BLANK-numbered match to unidentified", () => {
    expect(registerFromMatch({ sheetNumber: "", change: "ambiguous" }).status).toBe("unidentified");
  });

  it("refuses to guess at an unrecognised verdict", () => {
    const xref = registerFromMatch({ sheetNumber: "S-101", change: "teleported" });
    expect(xref.status).toBe("unidentified");
    expect(xref.note).toMatch(/Unrecognised match verdict/);
  });
});

describe("buildIntakeRecords", () => {
  it("emits one record per INCOMING sheet and skips removed sheets", () => {
    const records = intake([
      revised,
      { sheetNumber: "S-102", change: "added", newSheet: { sheetNumber: "S-102", sheetTitle: "SECTIONS" } },
      { sheetNumber: "S-103", change: "removed", oldSheet: { sheetNumber: "S-103" } },
    ]);
    expect(records.map((r) => r.titleBlock.sheetNumber.value)).toEqual(["S-101", "S-102"]);
  });

  it("carries the register verdict from the wizard's own match", () => {
    const [record] = intake([revised]);
    expect(record.register.status).toBe("revision-of-record");
    expect(record.ingest).toMatchObject({ operation: "update", match: { id: "d1" } });
  });

  it("reports everything as unknown when the upload is image-only", () => {
    const [record] = intake([revised], { scanned: true });
    expect(record.titleBlock.projectName.observed).toBe(false);
    expect(record.attestations.stamp.state).toBe("unverifiable");
    expect(record.findings.some((f) => f.code === "not-inspected")).toBe(true);
  });

  it("detects a seal when the caller supplies that page's text", () => {
    const [record] = intake(
      [{ ...revised, newSheet: { ...revised.newSheet, pdfPage: 4 } }],
      { pageTextByPdfPage: { 4: "REGISTERED PROFESSIONAL ENGINEER LIC. NO. 45821" } },
    );
    expect(record.attestations.stamp.state).toBe("present");
  });

  it("does not leak one page's seal onto a different sheet", () => {
    const [record] = intake(
      [{ ...revised, newSheet: { ...revised.newSheet, pdfPage: 9 } }],
      { pageTextByPdfPage: { 4: "REGISTERED PROFESSIONAL ENGINEER LIC. NO. 45821" } },
    );
    expect(record.attestations.stamp.state).toBe("unverifiable");
  });

  it("applies a reviewer attestation to the matching sheet only", () => {
    const records = intake(
      [revised, { sheetNumber: "S-102", change: "added", newSheet: { sheetNumber: "S-102" } }],
      {
        attestationsBySheetNumber: {
          "S-101": { stamp: { state: "absent", basis: "Confirmed MISSING by N. Lortie.", provenance: "human" } },
        },
      },
    );
    expect(records[0].attestations.stamp.state).toBe("absent");
    expect(records[0].disposition).toBe("hold");
    expect(records[1].attestations.stamp.state).toBe("unverifiable");
    expect(records[1].disposition).toBe("accept");
  });

  it("never reports the text layer as unchanged when the wizard harvested none", () => {
    const [record] = intake([revised]);
    const text = record.changeSummary.bullets.find((b) => b.channel === "text");
    expect(text?.comparable).toBe(false);
  });

  it("tolerates a match list with no incoming sheets at all", () => {
    expect(intake([{ sheetNumber: "S-1", change: "removed", oldSheet: { sheetNumber: "S-1" } }])).toEqual([]);
  });
});
