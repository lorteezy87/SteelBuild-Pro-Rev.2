import { describe, expect, it } from "vitest";
import {
  backLinkTooltip,
  buildSectionCutLinkIndex,
  linkLabel,
  linkTooltip,
  parseDetailNumber,
  sheetKey,
} from "@/lib/sectionCutLinks";
import type { LinkableDrawing, ResolvedSectionCutLink } from "@/lib/sectionCutLinks";
import { calloutSheetKey } from "@/lib/calloutDetection";
import { normalizeSN } from "@/pages/drawingViewer/drawingViewerUtils";

function sheet(over: Partial<LinkableDrawing> & { id: string }): LinkableDrawing {
  return { sheet_number: "S-101", title: "Framing plan", callouts: [], ...over };
}
const callout = (target: string, text?: string, extra: Record<string, unknown> = {}) => ({
  targetSheetNumber: target,
  text: text ?? `SEE ${target}`,
  coords: { x: 10, y: 20, width: 30, height: 12 },
  ...extra,
});

describe("sheetKey", () => {
  it("agrees with the two normalizers already in the app", () => {
    // Three copies of this rule exist; a link that resolves in the engine but
    // not in the viewer (or vice versa) is the bug this pins.
    for (const raw of ["S-401", "s 401", "S_401", "S.401", " S-4 01 ", "A201", "a-201"]) {
      expect(sheetKey(raw)).toBe(calloutSheetKey(raw));
      expect(sheetKey(raw)).toBe(normalizeSN(raw));
    }
  });

  it("collapses the separators a detailer actually types", () => {
    expect(sheetKey("S-401")).toBe(sheetKey("S401"));
    expect(sheetKey("s 4 0 1")).toBe("S401");
  });
});

describe("parseDetailNumber", () => {
  it("reads the bubble number off the printed forms", () => {
    expect(parseDetailNumber("3/S-401", "S-401")).toBe("3");
    expect(parseDetailNumber("SECTION 2/A201", "A201")).toBe("2");
    expect(parseDetailNumber("A/S-401", "S-401")).toBe("A");
    expect(parseDetailNumber("SEE SECTION 12/S-301 FOR TYP.", "S-301")).toBe("12");
  });

  it("returns null rather than guessing when there is no bubble", () => {
    expect(parseDetailNumber("SEE S-401", "S-401")).toBeNull();
    expect(parseDetailNumber("S-401", "S-401")).toBeNull();
    expect(parseDetailNumber("", "S-401")).toBeNull();
  });

  it("does not mine a number out of the sheet number itself", () => {
    // "A-301" must not yield "301" or "3".
    expect(parseDetailNumber("SEE A-301", "A-301")).toBeNull();
  });
});

describe("buildSectionCutLinkIndex — forward direction", () => {
  const rows = [
    sheet({ id: "d1", sheet_number: "S-101", callouts: [callout("S-401", "3/S-401"), callout("S-999")] }),
    sheet({ id: "d2", sheet_number: "S-401", title: "Connection details", callouts: [] }),
  ];

  it("resolves a callout whose target is in the register", () => {
    const out = buildSectionCutLinkIndex(rows).outgoing("d1");
    expect(out.resolved.map((l) => l.targetDrawingId)).toEqual(["d2"]);
    expect(out.resolved[0].detailNumber).toBe("3");
    expect(out.resolved[0].targetSheetTitle).toBe("Connection details");
  });

  it("KEEPS a dangling reference instead of dropping it", () => {
    // A callout pointing at a sheet nobody uploaded is a coordination finding.
    const out = buildSectionCutLinkIndex(rows).outgoing("d1");
    expect(out.unresolved.map((l) => l.targetAsPrinted)).toEqual(["S-999"]);
  });

  it("never reports a sheet as referencing itself", () => {
    const self = [sheet({ id: "d1", sheet_number: "S-101", callouts: [callout("S 101", "3/S-101")] })];
    const out = buildSectionCutLinkIndex(self).outgoing("d1");
    expect(out.resolved).toHaveLength(0);
    expect(out.unresolved).toHaveLength(0);
  });
});

describe("buildSectionCutLinkIndex — reverse direction", () => {
  const rows = [
    sheet({ id: "d1", sheet_number: "S-101", title: "Framing", callouts: [callout("S-401", "3/S-401")] }),
    sheet({ id: "d2", sheet_number: "S-102", title: "Roof framing", callouts: [callout("S-401", "5/S-401")] }),
    sheet({ id: "d3", sheet_number: "S-401", title: "Details", callouts: [] }),
  ];

  it("answers what references THIS sheet — the question the data could not answer before", () => {
    const inbound = buildSectionCutLinkIndex(rows).incoming("d3");
    expect(inbound.links.map((l) => `${l.detailNumber}/${l.sourceSheetNumber}`)).toEqual(["3/S-101", "5/S-102"]);
    expect(inbound.complete).toBe(true);
  });

  it("supports one section cut appearing on multiple sheets", () => {
    expect(buildSectionCutLinkIndex(rows).sourcesReferencing("d3")).toEqual(["d1", "d2"]);
  });

  it("supports multiple section cuts on a single sheet", () => {
    const many = [
      sheet({ id: "a", sheet_number: "S-101", callouts: [callout("S-401", "3/S-401"), callout("S-401", "4/S-401")] }),
      sheet({ id: "b", sheet_number: "S-401", callouts: [] }),
    ];
    const inbound = buildSectionCutLinkIndex(many).incoming("b");
    expect(inbound.links.map((l) => l.detailNumber)).toEqual(["3", "4"]);
  });
});

describe("duplicate handling", () => {
  it("collapses the same reference printed twice on one sheet", () => {
    const rows = [
      sheet({ id: "a", sheet_number: "S-101", callouts: [callout("S-401", "3/S-401"), callout("S-401", "3/S-401")] }),
      sheet({ id: "b", sheet_number: "S-401", callouts: [] }),
    ];
    expect(buildSectionCutLinkIndex(rows).outgoing("a").resolved).toHaveLength(1);
  });

  it("collapses references that differ only by formatting", () => {
    const rows = [
      sheet({ id: "a", sheet_number: "S-101", callouts: [callout("S-401", "3/S-401"), callout("S401", "3/S401")] }),
      sheet({ id: "b", sheet_number: "S-401", callouts: [] }),
    ];
    expect(buildSectionCutLinkIndex(rows).outgoing("a").resolved).toHaveLength(1);
  });

  it("keeps two different details on the same target as two links", () => {
    const rows = [
      sheet({ id: "a", sheet_number: "S-101", callouts: [callout("S-401", "3/S-401"), callout("S-401", "4/S-401")] }),
      sheet({ id: "b", sheet_number: "S-401", callouts: [] }),
    ];
    expect(buildSectionCutLinkIndex(rows).outgoing("a").resolved).toHaveLength(2);
  });
});

describe("renames and late uploads — the decided semantics", () => {
  it("resolves a reference the moment the target sheet is uploaded, with no rebuild", () => {
    const before = [sheet({ id: "a", sheet_number: "S-101", callouts: [callout("S-401", "3/S-401")] })];
    expect(buildSectionCutLinkIndex(before).outgoing("a").unresolved).toHaveLength(1);

    const after = [...before, sheet({ id: "b", sheet_number: "S-401", callouts: [] })];
    const out = buildSectionCutLinkIndex(after).outgoing("a");
    expect(out.unresolved).toHaveLength(0);
    expect(out.resolved[0].targetDrawingId).toBe("b");
  });

  it("goes UNRESOLVED when the target sheet is renumbered — it does not silently retarget", () => {
    // The issued PDF still says "3/S-401". Routing the detailer to S-401A would
    // send them to a sheet the drawing never pointed at.
    const renamed = [
      sheet({ id: "a", sheet_number: "S-101", callouts: [callout("S-401", "3/S-401")] }),
      sheet({ id: "b", sheet_number: "S-401A", callouts: [] }),
    ];
    const out = buildSectionCutLinkIndex(renamed).outgoing("a");
    expect(out.resolved).toHaveLength(0);
    expect(out.unresolved).toHaveLength(1);
    expect(linkTooltip(out.unresolved[0])).toMatch(/renumbered/);
  });

  it("drops the back-reference when the referencing sheet is deleted", () => {
    const rows = [sheet({ id: "b", sheet_number: "S-401", callouts: [] })];
    expect(buildSectionCutLinkIndex(rows).incoming("b").links).toHaveLength(0);
  });
});

describe("absence is not evidence", () => {
  it("distinguishes an unharvested sheet from one with no references", () => {
    const rows = [
      sheet({ id: "never", sheet_number: "S-101", callouts: null }),
      sheet({ id: "clean", sheet_number: "S-102", callouts: [] }),
    ];
    const index = buildSectionCutLinkIndex(rows);
    expect(index.outgoing("never").sourceHarvested).toBe(false);
    expect(index.outgoing("clean").sourceHarvested).toBe(true);
    // Both have zero links — only the flag tells them apart.
    expect(index.outgoing("never").resolved).toHaveLength(0);
    expect(index.outgoing("clean").resolved).toHaveLength(0);
  });

  it("an unknown drawing id reads as UNHARVESTED, never as clean", () => {
    expect(buildSectionCutLinkIndex([]).outgoing("ghost").sourceHarvested).toBe(false);
  });

  it("carries the register's row cap through to every incoming answer", () => {
    // A referencing sheet past the row cap was never read, so "nothing
    // references this sheet" is not a claim this index can make.
    const rows = [sheet({ id: "b", sheet_number: "S-401", callouts: [] })];
    const capped = buildSectionCutLinkIndex(rows, { registerComplete: false });
    expect(capped.incoming("b").links).toHaveLength(0);
    expect(capped.incoming("b").complete).toBe(false);
    expect(capped.registerComplete).toBe(false);
  });

  it("defaults to complete only when the caller says nothing", () => {
    expect(buildSectionCutLinkIndex([]).registerComplete).toBe(true);
  });
});

describe("manual links stay distinguishable from detected ones", () => {
  it("tags origin so re-detection can never silently drop a human's link", () => {
    const rows = [
      sheet({ id: "a", sheet_number: "S-101", callouts: [
        callout("S-401", "3/S-401"),
        callout("S-402", "SEE S-402", { origin: "manual" }),
      ] }),
      sheet({ id: "b", sheet_number: "S-401", callouts: [] }),
      sheet({ id: "c", sheet_number: "S-402", callouts: [] }),
    ];
    const out = buildSectionCutLinkIndex(rows).outgoing("a");
    expect(out.resolved.find((l) => l.targetAsPrinted === "S-401")!.origin).toBe("detected");
    expect(out.resolved.find((l) => l.targetAsPrinted === "S-402")!.origin).toBe("manual");
  });

  it("treats an unrecognised origin as detected rather than inventing a third kind", () => {
    const rows = [
      sheet({ id: "a", sheet_number: "S-101", callouts: [callout("S-401", "3/S-401", { origin: "wat" })] }),
      sheet({ id: "b", sheet_number: "S-401", callouts: [] }),
    ];
    expect(buildSectionCutLinkIndex(rows).outgoing("a").resolved[0].origin).toBe("detected");
  });
});

describe("labels and tooltips", () => {
  const rows = [
    sheet({ id: "a", sheet_number: "S-101", title: "Framing", callouts: [callout("S-401", "SEE SECTION 3/S-401 FOR TYP.")] }),
    sheet({ id: "b", sheet_number: "S-401", title: "Connection details", callouts: [] }),
  ];
  const link = buildSectionCutLinkIndex(rows).outgoing("a").resolved[0];

  it("labels a bubble reference as detail/sheet, never the raw sentence", () => {
    expect(linkLabel(link)).toBe("3/S-401");
    expect(linkLabel({ ...link, detailNumber: null })).toBe("S-401");
  });

  it("puts sheet number, title and section cut id in the tooltip", () => {
    expect(linkTooltip(link)).toBe("Detail 3 · S-401 · Connection details");
  });

  it("names the two causes of a dangling reference rather than showing a dead link", () => {
    const orphan = buildSectionCutLinkIndex([rows[0]]).outgoing("a").unresolved[0];
    expect(linkTooltip(orphan)).toMatch(/no sheet S-401 in this register/);
    expect(linkTooltip(orphan)).toMatch(/not uploaded, or renumbered/);
  });

  it("reads the other way round on a back-reference", () => {
    const inbound = buildSectionCutLinkIndex(rows).incoming("b").links[0] as ResolvedSectionCutLink;
    expect(backLinkTooltip(inbound)).toBe("Referenced by S-101 · Framing (detail 3)");
  });
});

describe("scale", () => {
  it("builds both directions over a large register without an N+1 scan", () => {
    // 2,000 sheets each carrying 3 callouts = 6,000 links. The old
    // per-callout drawings.find() would be 12,000,000 comparisons.
    const rows: LinkableDrawing[] = [];
    for (let i = 0; i < 2000; i++) {
      rows.push(sheet({
        id: `d${i}`,
        sheet_number: `S-${1000 + i}`,
        callouts: [callout(`S-${1000 + ((i + 1) % 2000)}`, `1/S-${1000 + ((i + 1) % 2000)}`),
                   callout(`S-${1000 + ((i + 2) % 2000)}`, `2/S-${1000 + ((i + 2) % 2000)}`),
                   callout("S-MISSING")],
      }));
    }
    const started = Date.now();
    const index = buildSectionCutLinkIndex(rows);
    const elapsed = Date.now() - started;
    expect(index.all()).toHaveLength(6000);
    expect(index.incoming("d5").links).toHaveLength(2);
    expect(index.outgoing("d5").unresolved).toHaveLength(1);
    expect(elapsed).toBeLessThan(1000);
  });
});
