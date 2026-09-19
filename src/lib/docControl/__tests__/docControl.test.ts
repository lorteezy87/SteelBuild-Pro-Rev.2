import { describe, it, expect, afterEach } from "vitest";
import {
  attestFromHuman,
  buildChangeSummary,
  buildDocControlRecord,
  computeDocControlFindings,
  crossReferenceRegister,
  detectSignature,
  detectStamp,
  isApprovedIssuance,
  normalizeCallouts,
  normalizeIssueDate,
  normalizeRevisionCode,
  readTitleBlock,
  toMdrEntry,
} from "@/lib/docControl";
import type { IncomingSheet, MdrEntry } from "@/lib/docControl";

function entry(overrides: Partial<MdrEntry> = {}): MdrEntry {
  return {
    id: "d1",
    sheetNumber: "S-101",
    title: "FOUNDATION PLAN",
    revisionNumber: "1",
    drawingSetName: "IFC Set",
    stage: "IFC",
    isSuperseded: false,
    callouts: [],
    extractedText: null,
    ...overrides,
  };
}

describe("readTitleBlock — observed vs unknown", () => {
  it("reports every text-derived field as UNKNOWN on a scanned PDF, never blank", () => {
    const tb = readTitleBlock({
      scanned: true,
      setMeta: { projectName: "", revision: "", issueDate: "", issuedBy: "" },
      sheet: { sheetNumber: "", revision: "", date: "" },
    });
    for (const field of Object.values(tb)) {
      expect(field.observed).toBe(false);
      expect(field.value).toBeNull();
      expect(field.provenance).toBe("not-observed");
    }
  });

  it("distinguishes 'read it and the box was empty' from 'never read it'", () => {
    const tb = readTitleBlock({
      scanned: false,
      setMeta: { projectName: "", revision: "IFC", issueDate: "2026-04-02" },
      sheet: { sheetNumber: "S-201", revision: "IFC", date: "2026-04-02" },
    });
    // projectName WAS inspected and was empty — that is a real finding.
    expect(tb.projectName).toMatchObject({ value: null, observed: true, provenance: "pdf-text" });
    // authorizingEngineer was never in the payload at all — unknown.
    expect(tb.authorizingEngineer).toMatchObject({ value: null, observed: false });
  });

  it("never promotes the issuing FIRM into the authorizing engineer", () => {
    const tb = readTitleBlock({
      scanned: false,
      setMeta: { issuedBy: "Acme Structural Engineers, Inc." },
    });
    expect(tb.authorizingEngineer.value).toBeNull();
  });

  it("falls back to the set's recorded EOR, tagged as set-level provenance", () => {
    const tb = readTitleBlock({
      scanned: false,
      setMeta: {},
      existingSet: { eor_reviewer: "J. Ruiz, P.E." },
    });
    expect(tb.authorizingEngineer).toMatchObject({
      value: "J. Ruiz, P.E.",
      provenance: "drawing-set",
      observed: true,
    });
  });

  it("tags a rect-sourced revision with titleblock-rect provenance", () => {
    const tb = readTitleBlock({
      scanned: false,
      sheet: { revision: "REV 2" },
      revisionFromRect: true,
    });
    expect(tb.revisionNumber).toMatchObject({ value: "2", provenance: "titleblock-rect" });
  });

  it("keeps an unreadable printed date OBSERVED so it reads 'could not be read', not 'absent'", () => {
    const tb = readTitleBlock({ scanned: false, sheet: { date: "sometime in the fall" } });
    expect(tb.issueDate).toMatchObject({ value: null, observed: true });
  });
});

describe("normalizeIssueDate", () => {
  afterEach(() => {
    // Restore in case a test replaced the global clock.
    if ((globalThis as any).__realDate) {
      globalThis.Date = (globalThis as any).__realDate;
      delete (globalThis as any).__realDate;
    }
  });

  it.each([
    ["2026-04-02", "2026-04-02"],
    ["2026/4/2", "2026-04-02"],
    ["11/04/25", "2025-11-04"],
    ["11/4/2025", "2025-11-04"],
    ["4 March 2026", "2026-03-04"],
    ["March 4, 2026", "2026-03-04"],
    ["Mar. 4 2026", "2026-03-04"],
  ])("reads %s as %s", (input, expected) => {
    expect(normalizeIssueDate(input)).toBe(expected);
  });

  it.each(["", "   ", "TBD", "13/01/2026", "02/30/2026", "1899-01-01"])(
    "refuses %s rather than guessing",
    (input) => {
      expect(normalizeIssueDate(input)).toBeNull();
    },
  );

  it("accepts a leap day and rejects the day after in a common year", () => {
    expect(normalizeIssueDate("02/29/2028")).toBe("2028-02-29");
    expect(normalizeIssueDate("02/29/2026")).toBeNull();
  });

  /**
   * The suite runs with TZ=UTC, which hides every local-vs-UTC date bug. This
   * test proves TZ-independence structurally instead: with the Date constructor
   * removed entirely, the parser must still work — it cannot be doing timezone
   * arithmetic behind our backs.
   */
  it("parses without touching the Date constructor at all (TZ-proof)", () => {
    (globalThis as any).__realDate = globalThis.Date;
    (globalThis as any).Date = function ThrowingDate() {
      throw new Error("normalizeIssueDate must not construct a Date");
    };
    expect(normalizeIssueDate("11/04/25")).toBe("2025-11-04");
    expect(normalizeIssueDate("2026-12-31")).toBe("2026-12-31");
  });
});

describe("normalizeRevisionCode", () => {
  it.each([
    ["REV 2", "2"],
    ["Revision B", "B"],
    ["rev. 3", "3"],
    ["IFC", "IFC"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeRevisionCode(input)).toBe(expected);
  });

  it("returns null for an empty code", () => {
    expect(normalizeRevisionCode("  ")).toBeNull();
  });
});

describe("attestations — absence is never inferred from a text layer", () => {
  it("reports a seal as PRESENT on confident seal text", () => {
    const stamp = detectStamp({
      scanned: false,
      pageText: "REGISTERED PROFESSIONAL ENGINEER\nLICENSE NO. 45821\nEXPIRES: 12/31/2027",
    });
    expect(stamp.state).toBe("present");
  });

  it("never reports a seal ABSENT from a text layer, only unverifiable", () => {
    const stamp = detectStamp({ scanned: false, pageText: "FOUNDATION PLAN\nSCALE 1/4\" = 1'-0\"" });
    expect(stamp.state).toBe("unverifiable");
    expect(stamp.basis).toMatch(/not evidence/i);
  });

  it("does not read a title block's 'ENGINEER OF RECORD' line as a seal", () => {
    const stamp = detectStamp({ scanned: false, pageText: "ENGINEER OF RECORD: ACME STRUCTURAL" });
    expect(stamp.state).toBe("unverifiable");
  });

  it("always reports a signature as unverifiable from machine evidence", () => {
    expect(detectSignature({ scanned: false, pageText: "SIGNED" }).state).toBe("unverifiable");
    expect(detectSignature({ scanned: true }).state).toBe("unverifiable");
  });

  it("lets a person — and only a person — record an absent mark", () => {
    const att = attestFromHuman("absent", "N. Lortie");
    expect(att).toMatchObject({ state: "absent", provenance: "human" });
    expect(att.basis).toContain("N. Lortie");
  });
});

describe("crossReferenceRegister", () => {
  it("matches exactly one live sheet", () => {
    const xref = crossReferenceRegister({
      sheetNumber: "S-101",
      register: [entry(), entry({ id: "d2", sheetNumber: "S-102" })],
      registerComplete: true,
    });
    expect(xref.status).toBe("revision-of-record");
    expect(xref.matched?.id).toBe("d1");
  });

  it("does not match a superseded row", () => {
    const xref = crossReferenceRegister({
      sheetNumber: "S-101",
      register: [entry({ isSuperseded: true })],
      registerComplete: true,
    });
    expect(xref.status).toBe("new-to-register");
  });

  it("refuses to pair a duplicate number", () => {
    const xref = crossReferenceRegister({
      sheetNumber: "S-101",
      register: [entry(), entry({ id: "d2" })],
      registerComplete: true,
    });
    expect(xref.status).toBe("duplicate-in-register");
    expect(xref.matched).toBeNull();
    expect(xref.candidates).toHaveLength(2);
  });

  it("will not call a sheet NEW when the register read was truncated", () => {
    const xref = crossReferenceRegister({
      sheetNumber: "S-999",
      register: [entry()],
      registerComplete: false,
    });
    expect(xref.status).toBe("register-incomplete");
    expect(xref.note).toMatch(/truncated/i);
  });

  it("matches on exact numbers only — S-101 is not S101", () => {
    const xref = crossReferenceRegister({
      sheetNumber: "S101",
      register: [entry({ sheetNumber: "S-101" })],
      registerComplete: true,
    });
    expect(xref.status).toBe("new-to-register");
  });

  it("reports an unidentified document when no sheet number was read", () => {
    const xref = crossReferenceRegister({ sheetNumber: null, register: [entry()], registerComplete: true });
    expect(xref.status).toBe("unidentified");
  });
});

describe("toMdrEntry / normalizeCallouts", () => {
  it("maps a raw drawings row", () => {
    const mapped = toMdrEntry({
      id: "x",
      sheet_number: "S-301",
      title: "SECTIONS",
      revision_number: "2",
      is_superseded: false,
      callouts: [{ targetSheetNumber: "S-401", text: "SEE 3/S-401" }],
      extracted_text: "hello",
    });
    expect(mapped.sheetNumber).toBe("S-301");
    expect(mapped.callouts).toEqual([{ targetSheetNumber: "S-401", text: "SEE 3/S-401" }]);
  });

  it("survives a malformed callouts JSONB value", () => {
    expect(normalizeCallouts("not an array")).toEqual([]);
    expect(normalizeCallouts([null, 3, { targetSheetNumber: 7 }])).toEqual([
      { targetSheetNumber: null, text: null },
    ]);
  });
});

describe("buildChangeSummary", () => {
  const incoming: IncomingSheet = {
    sheetNumber: "S-101",
    title: "FOUNDATION PLAN",
    revisionNumber: "2",
    issueDate: "2026-04-02",
    extractedText: "NOTE 1\nNOTE 2",
    callouts: [{ targetSheetNumber: "S-401", text: null }],
    scanned: false,
  };

  it("ALWAYS emits a non-comparable line-work bullet — geometry is never diffed", () => {
    for (const previous of [null, entry({ extractedText: "NOTE 1" })]) {
      const summary = buildChangeSummary(incoming, previous);
      const lineWork = summary.bullets.filter((b) => b.channel === "line-work");
      expect(lineWork).toHaveLength(1);
      expect(lineWork[0].comparable).toBe(false);
      expect(lineWork[0].text).toMatch(/Overlay/i);
    }
  });

  it("reports added and removed text lines", () => {
    const summary = buildChangeSummary(incoming, entry({ extractedText: "NOTE 1\nNOTE 9" }));
    const text = summary.bullets.find((b) => b.channel === "text" && b.comparable);
    expect(text?.text).toContain("1 line added");
    expect(text?.text).toContain("1 line removed");
    expect(text?.text).toContain("+ NOTE 2");
  });

  it("says the text layer is NOT comparable when the sheet of record was never harvested", () => {
    const summary = buildChangeSummary(incoming, entry({ extractedText: null }));
    const text = summary.bullets.find((b) => b.channel === "text");
    expect(text?.comparable).toBe(false);
    expect(text?.text).toMatch(/may have changed/i);
  });

  it("treats an empty callout list on an unextracted row as UNKNOWN, not 'no callouts'", () => {
    const summary = buildChangeSummary(incoming, entry({ callouts: [], extractedText: null }));
    const callouts = summary.bullets.find((b) => b.channel === "callouts");
    expect(callouts?.comparable).toBe(false);
    expect(callouts?.text).toMatch(/unknown rather than empty/i);
  });

  it("diffs callouts when the sheet of record was extracted", () => {
    const summary = buildChangeSummary(
      incoming,
      entry({ extractedText: "x", callouts: [{ targetSheetNumber: "S-402", text: null }] as MdrEntry["callouts"] }),
    );
    const callouts = summary.bullets.find((b) => b.channel === "callouts");
    expect(callouts?.comparable).toBe(true);
    expect(callouts?.text).toContain("now references S-401");
    expect(callouts?.text).toContain("no longer references S-402");
  });

  it("flags a re-issue at an unchanged revision code", () => {
    const summary = buildChangeSummary({ ...incoming, revisionNumber: "1" }, entry({ revisionNumber: "1" }));
    const meta = summary.bullets.find((b) => b.channel === "metadata");
    expect(meta?.text).toMatch(/unchanged at 1/i);
  });

  it("says so plainly when there is no sheet of record", () => {
    const summary = buildChangeSummary(incoming, null);
    expect(summary.comparedAgainst).toBeNull();
    expect(summary.bullets[0].text).toMatch(/first issue/i);
  });
});

describe("isApprovedIssuance", () => {
  it.each(["IFC", "Released", "IFC Rev 2", "final ifc"])("accepts %s", (code) => {
    expect(isApprovedIssuance(code)).toBe(true);
  });

  it.each(["IFA", "OFA", "BFA", "OFS", "A", "2", "Bid Set", "IFC — PRELIMINARY", "VOID", ""])(
    "rejects %s",
    (code) => {
      expect(isApprovedIssuance(code)).toBe(false);
    },
  );
});

describe("computeDocControlFindings", () => {
  const baseTitleBlock = readTitleBlock({
    scanned: false,
    setMeta: { projectName: "Desert Ridge Phase 2", revision: "IFC", issueDate: "2026-04-02", authorizingEngineer: "J. Ruiz, P.E." },
    sheet: { sheetNumber: "S-101", revision: "IFC", date: "2026-04-02" },
  });

  const sealed = { state: "present", basis: "seal text", provenance: "pdf-text" } as const;

  it("returns no blockers for a clean, sealed, IFC sheet", () => {
    const findings = computeDocControlFindings({
      titleBlock: baseTitleBlock,
      attestations: { stamp: sealed, signature: attestFromHuman("present", "N. Lortie") },
      register: crossReferenceRegister({ sheetNumber: "S-101", register: [], registerComplete: true }),
    });
    expect(findings.filter((f) => f.severity === "blocker")).toHaveLength(0);
  });

  it("blocks a duplicate sheet number", () => {
    const findings = computeDocControlFindings({
      titleBlock: baseTitleBlock,
      attestations: { stamp: sealed, signature: attestFromHuman("present", "N. Lortie") },
      register: crossReferenceRegister({
        sheetNumber: "S-101",
        register: [entry(), entry({ id: "d2" })],
        registerComplete: true,
      }),
    });
    expect(findings[0]).toMatchObject({ code: "duplicate-sheet-number", severity: "blocker" });
  });

  it("blocks only on a HUMAN-confirmed missing seal, and warns on an unverified one", () => {
    const register = crossReferenceRegister({ sheetNumber: "S-101", register: [], registerComplete: true });

    const unverified = computeDocControlFindings({
      titleBlock: baseTitleBlock,
      attestations: { stamp: detectStamp({ scanned: false, pageText: "PLAN" }), signature: detectSignature({ scanned: false }) },
      register,
    });
    expect(unverified.some((f) => f.code === "unverified-stamp" && f.severity === "warning")).toBe(true);
    expect(unverified.some((f) => f.severity === "blocker")).toBe(false);

    const confirmed = computeDocControlFindings({
      titleBlock: baseTitleBlock,
      attestations: { stamp: attestFromHuman("absent", "N. Lortie"), signature: attestFromHuman("absent", "N. Lortie") },
      register,
    });
    expect(confirmed.filter((f) => f.severity === "blocker").map((f) => f.code)).toEqual(
      expect.arrayContaining(["absent-stamp", "absent-signature"]),
    );
  });

  it("warns that a review issuance must not reach the shop", () => {
    const tb = readTitleBlock({ scanned: false, sheet: { sheetNumber: "S-101", revision: "IFA" } });
    const findings = computeDocControlFindings({
      titleBlock: tb,
      attestations: { stamp: sealed, signature: attestFromHuman("present", "x") },
      register: crossReferenceRegister({ sheetNumber: "S-101", register: [], registerComplete: true }),
    });
    const unapproved = findings.find((f) => f.code === "unapproved-revision");
    expect(unapproved?.severity).toBe("warning");
    expect(unapproved?.message).toMatch(/do not release/i);
  });

  it("flags two documents claiming the same revision", () => {
    const findings = computeDocControlFindings({
      titleBlock: baseTitleBlock,
      attestations: { stamp: sealed, signature: attestFromHuman("present", "x") },
      register: crossReferenceRegister({
        sheetNumber: "S-101",
        register: [entry({ revisionNumber: "IFC" })],
        registerComplete: true,
      }),
    });
    expect(findings.some((f) => f.code === "revision-not-advanced")).toBe(true);
  });

  it("says 'not inspected' rather than 'missing' for a field nobody looked at", () => {
    const tb = readTitleBlock({ scanned: true, sheet: { sheetNumber: "S-101" } });
    const findings = computeDocControlFindings({
      titleBlock: { ...tb, sheetNumber: { value: "S-101", provenance: "human", observed: true } },
      attestations: { stamp: sealed, signature: attestFromHuman("present", "x") },
      register: crossReferenceRegister({ sheetNumber: "S-101", register: [], registerComplete: true }),
    });
    const notInspected = findings.filter((f) => f.code === "not-inspected");
    expect(notInspected.length).toBeGreaterThan(0);
    for (const f of notInspected) expect(f.message).toMatch(/unknown, not blank|Unknown, not blank/);
  });

  it("orders blockers before warnings before info", () => {
    const findings = computeDocControlFindings({
      titleBlock: readTitleBlock({ scanned: false, sheet: { sheetNumber: "" } }),
      attestations: { stamp: attestFromHuman("absent", "x"), signature: detectSignature({ scanned: false }) },
      register: crossReferenceRegister({ sheetNumber: null, register: [], registerComplete: true }),
    });
    const ranks = findings.map((f) => ({ blocker: 0, warning: 1, info: 2 })[f.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe("buildDocControlRecord", () => {
  const now = new Date("2026-09-18T17:00:00.000Z");

  function build(overrides: Partial<Parameters<typeof buildDocControlRecord>[0]> = {}) {
    return buildDocControlRecord({
      projectId: "p1",
      titleBlock: {
        scanned: false,
        setMeta: {
          projectName: "Desert Ridge Phase 2",
          revision: "IFC",
          issueDate: "04/02/2026",
          authorizingEngineer: "J. Ruiz, P.E.",
        },
        sheet: { sheetNumber: "S-101", revision: "IFC", date: "04/02/2026" },
      },
      attestationSource: {
        scanned: false,
        pageText: "REGISTERED PROFESSIONAL ENGINEER LICENSE NO. 45821",
      },
      register: [entry({ revisionNumber: "1", extractedText: "NOTE 1" })],
      registerComplete: true,
      incoming: { title: "FOUNDATION PLAN", extractedText: "NOTE 1\nNOTE 2", callouts: [] },
      now,
      ...overrides,
    });
  }

  it("emits a stable, versioned record with a deterministic timestamp", () => {
    const record = build();
    expect(record.schemaVersion).toBe("doc-control/1");
    expect(record.generatedAt).toBe("2026-09-18T17:00:00.000Z");
    expect(record.projectId).toBe("p1");
  });

  it("normalises the issue date into the record", () => {
    expect(build().titleBlock.issueDate.value).toBe("2026-04-02");
  });

  it("targets an UPDATE against the matched register row", () => {
    const record = build();
    expect(record.register.status).toBe("revision-of-record");
    expect(record.ingest).toMatchObject({ operation: "update", match: { id: "d1" } });
    expect(record.ingest.values).toEqual({
      sheet_number: "S-101",
      revision_number: "IFC",
      project_name: "Desert Ridge Phase 2",
      title: "FOUNDATION PLAN",
    });
  });

  it("targets an INSERT on the natural key for a sheet new to the register", () => {
    const record = build({ register: [] });
    expect(record.ingest).toMatchObject({
      operation: "insert",
      match: { project_id: "p1", sheet_number: "S-101" },
    });
  });

  it("WITHHOLDS unknown fields from the payload instead of writing blanks", () => {
    const record = build({
      titleBlock: { scanned: true, setMeta: {}, sheet: {} },
    });
    expect(record.ingest.values.sheet_number).toBeUndefined();
    expect(record.ingest.values.project_name).toBeUndefined();
    const reasons = record.ingest.withheld.map((w) => w.reason).join(" ");
    expect(reasons).toMatch(/Not inspected/);
    expect(Object.values(record.ingest.values)).not.toContain("");
  });

  it("names the columns `drawings` has no home for, with the set-level column that does", () => {
    const withheld = build().ingest.withheld;
    expect(withheld.find((w) => w.column === "issue_date")?.reason).toContain("drawing_sets.issued_date");
    expect(withheld.find((w) => w.column === "authorizing_engineer")?.reason).toContain(
      "drawing_sets.eor_reviewer",
    );
  });

  it("holds the document when a blocker is present, and accepts otherwise", () => {
    expect(build().disposition).toBe("accept");
    const blocked = build({ register: [entry(), entry({ id: "d2" })] });
    expect(blocked.disposition).toBe("hold");
  });

  it("does NOT hold on an unverified signature — warnings travel with the document", () => {
    const record = build();
    expect(record.attestations.signature.state).toBe("unverifiable");
    expect(record.findings.some((f) => f.code === "unverified-signature")).toBe(true);
    expect(record.disposition).toBe("accept");
  });

  it("lets a human attestation override the machine read and block the intake", () => {
    const record = build({ attestationOverrides: { stamp: attestFromHuman("absent", "N. Lortie") } });
    expect(record.attestations.stamp.state).toBe("absent");
    expect(record.disposition).toBe("hold");
  });

  it("carries the change summary for the matched sheet of record", () => {
    const record = build();
    expect(record.changeSummary.comparedAgainst).toBe("S-101 rev 1");
    expect(record.changeSummary.bullets.some((b) => b.channel === "line-work" && !b.comparable)).toBe(true);
  });

  it("is JSON-serialisable end to end", () => {
    const record = build();
    expect(() => JSON.parse(JSON.stringify(record))).not.toThrow();
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });
});
