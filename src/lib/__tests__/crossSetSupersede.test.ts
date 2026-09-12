import { describe, expect, it, vi } from "vitest";

// drawingSetUploadHelpers pulls in pdf.js; stub it so the same-set replace can be
// compared with the cross-set planner in the node environment.
vi.mock("@/lib/pdfSheetExtractor", () => ({
  extractSheetsFromPdf: vi.fn(),
  EMPTY_SET_META: {},
  parseFilename: vi.fn(),
  validatePdfPage: vi.fn(),
}));
vi.mock("@/lib/applyTitleblockRevisionOcr", () => ({ applyTitleblockRevisionOcr: vi.fn() }));

import { planExistingSetSheetReplace } from "@/components/drawings/drawingSetUploadHelpers";
import {
  SUPERSEDE_FETCH_FAILED,
  applyCrossSetSupersede,
  buildReplaceSentence,
  buildSharedNumberSentence,
  compareRevisions,
  describeSupersedeActivity,
  describeSupersededSet,
  describeSupersedeWriteError,
  groupSupersedeItemsBySet,
  isShortSheetKey,
  planCrossSetSupersede,
  resolveUploadSetName,
} from "../crossSetSupersede";
import type {
  CrossSetSource,
  CrossSetSourceDrawing,
  CrossSetSourceSet,
  SupersedeDefaultReason,
  SupersedePatch,
  UploadSheetLike,
} from "../crossSetSupersede";

const set = (id: string, setName: string, extra: Partial<CrossSetSourceSet> = {}): CrossSetSourceSet => ({
  id, set_name: setName, is_locked: false, is_deleted: false, ...extra,
});
const dwg = (
  id: string,
  setId: string | null,
  setName: string,
  sheetNumber: string,
  title: string,
  revision = "1",
  extra: Partial<CrossSetSourceDrawing> = {},
): CrossSetSourceDrawing => ({
  id, drawing_set_id: setId, drawing_set_name: setName, sheet_number: sheetNumber, title,
  revision_number: revision, is_superseded: false, is_deleted: false, metadata: null, ...extra,
});
const sheet = (sheetNumber: string, sheetTitle: string, revision = "2", selected = true): UploadSheetLike => ({
  sheetNumber, sheetTitle, revision, selected,
});

const L2 = set("set-l2", "Main Steel – L2");
const NEW_SET = "Main Steel – L2 Rev A";

describe("planCrossSetSupersede — matching", () => {
  it("matches S-201, S201, s 201 and S.201 across sets, in both directions", () => {
    for (const typed of ["S-201", "S201", "s 201", "S.201"]) {
      const plan = planCrossSetSupersede({
        source: { sets: [L2], drawings: [dwg("old-201", "set-l2", "Main Steel – L2", "S-201", "Framing Plan")] },
        newSheets: [sheet(typed, "Framing Plan")],
        meta: { setName: NEW_SET },
      });
      expect(plan.rows.map((row) => row.oldId)).toEqual(["old-201"]);
    }
    const stored = planCrossSetSupersede({
      source: { sets: [L2], drawings: [dwg("old-201", "set-l2", "Main Steel – L2", "s.201", "Framing Plan")] },
      newSheets: [sheet("S-201", "Framing Plan")],
      meta: { setName: NEW_SET },
    });
    expect(stored.rows).toHaveLength(1);
  });

  it("agrees with the same-set replace on which numbers are the same sheet", () => {
    const pairs: Array<[string, string]> = [
      ["S-201", "S201"], ["S.2", "S-2"], ["s 101", "S101"], ["101E-111", "101e111"],
      ["S-201", "S-202"], ["S-2", "S-20"], ["A1.1", "A-11"],
    ];
    for (const [stored, uploaded] of pairs) {
      const sameSet = planExistingSetSheetReplace([{ id: "x", sheet_number: stored }], [{ sheet_number: uploaded }]);
      const crossSet = planCrossSetSupersede({
        source: { sets: [L2], drawings: [dwg("x", "set-l2", "Main Steel – L2", stored, "Plan")] },
        newSheets: [sheet(uploaded, "Plan")],
        meta: { setName: NEW_SET },
      });
      expect(`${stored} vs ${uploaded}: ${crossSet.rows.length}`).toBe(`${stored} vs ${uploaded}: ${sameSet.toUpdate.length}`);
    }
  });

  it("excludes the target set, superseded/deleted rows, deleted sets, unassigned rows, blank keys and unselected sheets", () => {
    const source: CrossSetSource = {
      sets: [set("set-a", NEW_SET), L2, set("set-gone", "Old Steel", { is_deleted: true })],
      drawings: [
        dwg("in-target", "set-a", NEW_SET, "S-201", "Framing Plan"),
        dwg("superseded", "set-l2", "Main Steel – L2", "S-201", "Framing Plan", "1", { is_superseded: true }),
        dwg("deleted", "set-l2", "Main Steel – L2", "S-201", "Framing Plan", "1", { is_deleted: true }),
        dwg("set-deleted", "set-gone", "Old Steel", "S-201", "Framing Plan"),
        dwg("no-set", null, "Main Steel – L2", "S-201", "Framing Plan"),
        dwg("blank", "set-l2", "Main Steel – L2", " - ", "Framing Plan"),
        dwg("unselected-match", "set-l2", "Main Steel – L2", "S-300", "Roof Plan"),
        dwg("live", "set-l2", "Main Steel – L2", "S-201", "Framing Plan"),
        // is_superseded is nullable: NULL is live.
        dwg("null-superseded", "set-l2", "Main Steel – L2", "S-204", "Sections", "1", { is_superseded: null }),
      ],
    };
    const newSheets = [sheet("S-201", "Framing Plan"), sheet("", "Blank"), sheet("S-300", "Roof Plan", "2", false), sheet("S-204", "Sections")];

    // Preview: the target is the live set whose name is exactly the typed name.
    const preview = planCrossSetSupersede({ source, newSheets, meta: { setName: NEW_SET } });
    expect(preview.targetSetId).toBe("set-a");
    expect(preview.rows.map((row) => row.oldId)).toEqual(["live", "null-superseded"]);

    // Commit: the target is the resolved parent set id.
    const commit = planCrossSetSupersede({ source, newSheets, targetSetId: "set-l2", targetSetName: "Main Steel – L2" });
    expect(commit.rows.map((row) => row.oldId)).toEqual(["in-target"]);
  });

  it("returns one row per old drawing when a number is live in two other sets", () => {
    const plan = planCrossSetSupersede({
      source: {
        sets: [set("set-lad", "Ladders - Bldg. 2"), set("set-br", "Balcony Rail - Bldg. 2")],
        drawings: [
          dwg("lad-124", "set-lad", "Ladders - Bldg. 2", "602E124", "LADDER L-4 LAYOUT"),
          dwg("br-124", "set-br", "Balcony Rail - Bldg. 2", "602E124", "GUARDRAIL LAYOUT - UNIT 4"),
        ],
      },
      newSheets: [sheet("602E124", "Guardrail Layout - Unit 4")],
      meta: { setName: "Added Rails - Bldg. 2" },
    });
    expect(plan.rows.map((row) => [row.oldId, row.reason, row.defaultChecked])).toEqual([
      ["br-124", "replaces", true],
      ["lad-124", "title_differs", false],
    ]);
    expect(plan.groups.map((group) => group.setName)).toEqual(["Balcony Rail - Bldg. 2"]);
    expect(plan.differentRows.map((row) => row.oldId)).toEqual(["lad-124"]);
  });
});

describe("planCrossSetSupersede — default selection", () => {
  // Modelled on the 21 live cross-set pairs found in production (read-only query,
  // 2026-09-11): the sheet numbers, the set names the design review recorded
  // (Balcony Rail / Ladders / Added Rails - Bldg. 2, Joists, Deck, Anchor Bolts,
  // Academy MS Mesa) and each pair's outcome. Titles, revisions and the other set
  // names are stand-ins with the same relationship: identical, different or blank
  // title; newer, same, older or unknown revision.
  interface Pair {
    sheet: string; oldSet: string; oldTitle: string; oldRev: string;
    newSet: string; newTitle: string; newRev: string; expected: SupersedeDefaultReason;
  }
  const pair = (sheetNumber: string, oldSet: string, oldTitle: string, oldRev: string, newSet: string, newTitle: string, newRev: string, expected: SupersedeDefaultReason): Pair =>
    ({ sheet: sheetNumber, oldSet, oldTitle, oldRev, newSet, newTitle, newRev, expected });
  const PRODUCTION_PAIRS: Pair[] = [
    // 8 real replacements plus one identical-revision copy — pre-ticked.
    pair("602E124", "Balcony Rail - Bldg. 2", "GUARDRAIL LAYOUT - UNIT 4", "1", "Added Rails - Bldg. 2", "Guardrail Layout - Unit 4", "2", "replaces"),
    pair("404E102", "Stairs - Bldg. 4", "STAIR 2 PLAN", "1", "Stairs - Bldg. 4 Rev 2", "STAIR 2 PLAN", "2", "replaces"),
    pair("101E109", "Embeds - Bldg. 1", "EMBED PLAN - LEVEL 2", "0", "Embeds - Bldg. 1 Rev 1", "EMBED PLAN - LEVEL 2", "1", "replaces"),
    pair("101E112", "Embeds - Bldg. 1", "EMBED DETAILS", "0", "Embeds - Bldg. 1 Rev 1", "EMBED  details", "1", "replaces"),
    pair("101E112", "Embeds - Bldg. 1 Partial", "EMBED DETAILS", "0", "Embeds - Bldg. 1 Rev 1", "EMBED DETAILS", "1", "replaces"),
    pair("502E101", "Canopy - Bldg. 5", "CANOPY FRAMING PLAN", "A", "Canopy - Bldg. 5 Rev B", "CANOPY FRAMING PLAN", "B", "replaces"),
    pair("502E102", "Canopy - Bldg. 5", "CANOPY SECTIONS", "A", "Canopy - Bldg. 5 Rev B", "CANOPY SECTIONS", "B", "replaces"),
    pair("502E103", "Canopy - Bldg. 5", "CANOPY DETAILS", "A", "Canopy - Bldg. 5 Rev B", "CANOPY DETAILS", "1", "replaces"),
    pair("101ABP2", "Academy MS Mesa", "DETAILS & SECTIONS", "1", "Anchor Bolts", "DETAILS & SECTIONS", "1", "replaces"),
    // Same number, different drawing — never pre-ticked.
    pair("602E121", "Ladders - Bldg. 2", "LADDER L-1 LAYOUT", "1", "Balcony Rail - Bldg. 2", "GUARDRAIL LAYOUT - UNIT 1", "1", "title_differs"),
    pair("602E122", "Ladders - Bldg. 2", "LADDER L-2 LAYOUT", "1", "Balcony Rail - Bldg. 2", "GUARDRAIL LAYOUT - UNIT 2", "1", "title_differs"),
    pair("602E123", "Ladders - Bldg. 2", "LADDER L-3 LAYOUT", "1", "Balcony Rail - Bldg. 2", "GUARDRAIL LAYOUT - UNIT 3", "1", "title_differs"),
    pair("602E124", "Ladders - Bldg. 2", "LADDER L-4 LAYOUT", "1", "Balcony Rail - Bldg. 2", "GUARDRAIL LAYOUT - UNIT 4", "1", "title_differs"),
    pair("602E124", "Ladders - Bldg. 2", "LADDER L-4 LAYOUT", "1", "Added Rails - Bldg. 2", "Guardrail Layout - Unit 4", "2", "title_differs"),
    pair("E101", "Embeds - Bldg. 3", "EMBED PLAN", "0", "Misc Metals - Bldg. 3", "ELEVATOR PIT LADDER", "0", "title_differs"),
    pair("D1", "Deck", "DECK LAYOUT", "0", "Stairs", "STAIR DETAILS", "0", "title_differs"),
    // Vendor sets that restart their numbering (identical titles, uploaded a minute apart).
    pair("C1", "Joists", "GENERAL NOTES", "0", "Deck", "GENERAL NOTES", "0", "short_number"),
    pair("D3", "Joists", "STANDARD DETAILS", "0", "Deck", "STANDARD DETAILS", "0", "short_number"),
    // Real revisions, but nothing in the data confirms them.
    pair("101E111", "Embeds - Bldg. 1", "EMBED PLAN - LEVEL 3", "0", "Embeds - Bldg. 1 Rev 1", "", "1", "title_missing"),
    pair("101E113", "Embeds - Bldg. 1", "", "0", "Embeds - Bldg. 1 Rev 1", "EMBED SECTIONS", "1", "title_missing"),
    // Rev 1 uploaded into Anchor Bolts over Academy MS Mesa's rev 2.
    pair("101ABP1", "Academy MS Mesa", "ANCHOR BOLT LAYOUT PLAN", "2", "Anchor Bolts", "ANCHOR BOLT LAYOUT PLAN", "1", "older_revision"),
  ];

  const planPair = (p: Pair) => {
    const oldSetId = `set:${p.oldSet}`;
    const newSetId = `set:${p.newSet}`;
    return planCrossSetSupersede({
      source: {
        sets: [set(oldSetId, p.oldSet), set(newSetId, p.newSet)],
        drawings: [dwg(`old:${p.sheet}:${p.oldSet}`, oldSetId, p.oldSet, p.sheet, p.oldTitle, p.oldRev)],
      },
      newSheets: [sheet(p.sheet, p.newTitle, p.newRev)],
      meta: { setName: p.newSet },
    }).rows[0];
  };

  it("pre-ticks the 9 replacements and none of the different-drawing, vendor, blank-title or stale pairs", () => {
    expect(PRODUCTION_PAIRS).toHaveLength(21);
    const outcomes = PRODUCTION_PAIRS.map((p) => ({ p, row: planPair(p) }));
    for (const { p, row } of outcomes) {
      expect(`${p.sheet} ${p.oldSet} → ${p.newSet}: ${row?.reason}`).toBe(`${p.sheet} ${p.oldSet} → ${p.newSet}: ${p.expected}`);
      expect(row?.defaultChecked).toBe(p.expected === "replaces");
    }
    const ticked = outcomes.filter(({ row }) => row?.defaultChecked).map(({ p }) => `${p.sheet} ${p.oldSet}`);
    expect(ticked).toEqual([
      "602E124 Balcony Rail - Bldg. 2", "404E102 Stairs - Bldg. 4", "101E109 Embeds - Bldg. 1",
      "101E112 Embeds - Bldg. 1", "101E112 Embeds - Bldg. 1 Partial",
      "502E101 Canopy - Bldg. 5", "502E102 Canopy - Bldg. 5", "502E103 Canopy - Bldg. 5",
      "101ABP2 Academy MS Mesa",
    ]);
    const counts: Record<string, number> = {};
    for (const { row } of outcomes) counts[row?.reason ?? "missing"] = (counts[row?.reason ?? "missing"] ?? 0) + 1;
    expect(counts).toEqual({ replaces: 9, title_differs: 7, short_number: 2, title_missing: 2, older_revision: 1 });
  });

  it("explains each unticked row and warns on identical or incomparable revisions", () => {
    const byKey = (sheetNumber: string, oldSet: string) => {
      const p = PRODUCTION_PAIRS.find((candidate) => candidate.sheet === sheetNumber && candidate.oldSet === oldSet);
      if (!p) throw new Error(`missing fixture ${sheetNumber}`);
      return planPair(p);
    };
    expect(byKey("101ABP2", "Academy MS Mesa")?.note).toBe("Same revision — check this isn't a re-upload");
    expect(byKey("101ABP1", "Academy MS Mesa")?.note).toBe("Uploaded rev 1 is older than the live rev 2");
    expect(byKey("502E103", "Canopy - Bldg. 5")?.note).toBe("Rev A → 1");
    expect(byKey("C1", "Joists")?.note).toBe("Short sheet number — vendor packages often restart numbering");
    expect(byKey("101E111", "Embeds - Bldg. 1")?.note).toBe("Title missing — compare the drawings before ticking");
    expect(byKey("404E102", "Stairs - Bldg. 4")?.note).toBeNull();
  });

  it("does not tick pages in a set whose name differs from the typed name only by case", () => {
    const source: CrossSetSource = { sets: [L2], drawings: [dwg("old-201", "set-l2", "Main Steel – L2", "S-201", "Framing Plan")] };
    const typo = planCrossSetSupersede({ source, newSheets: [sheet("S-201", "Framing Plan")], meta: { setName: "main steel – l2" } });
    expect(typo.rows).toHaveLength(1);
    expect(typo.rows[0]).toMatchObject({ reason: "set_name_case", defaultChecked: false });
    expect(typo.setNameCaseConflict).toEqual({ typed: "main steel – l2", existing: "Main Steel – L2" });

    const exact = planCrossSetSupersede({ source, newSheets: [sheet("S-201", "Framing Plan")], meta: { setName: "Main Steel – L2" } });
    expect(exact.rows).toEqual([]);
    expect(exact.setNameCaseConflict).toBeNull();
  });

  it("disables rows in locked sets", () => {
    const plan = planCrossSetSupersede({
      source: { sets: [set("set-l2", "Main Steel – L2", { is_locked: true })], drawings: [dwg("old-201", "set-l2", "Main Steel – L2", "S-201", "Framing Plan")] },
      newSheets: [sheet("S-201", "Framing Plan")],
      meta: { setName: NEW_SET },
    });
    expect(plan.rows[0]).toMatchObject({ reason: "locked", disabled: true, defaultChecked: false, note: "Set is locked" });
    expect(plan.groups[0].locked).toBe(true);
  });

  it("leaves a live numbered page unticked when the upload carries an older letter revision", () => {
    const plan = planCrossSetSupersede({
      source: { sets: [set("set-ifc", "Main Steel – L2 IFC")], drawings: [dwg("ifc-201", "set-ifc", "Main Steel – L2 IFC", "S-201", "Framing Plan", "1")] },
      newSheets: [sheet("S-201", "Framing Plan", "B")],
      meta: { setName: "Main Steel – L2 Approval" },
    });
    expect(plan.rows[0]).toMatchObject({
      reason: "older_revision", revisionComparison: "older", defaultChecked: false,
      note: "Uploaded rev B is older than the live rev 1",
    });
    // The row carries no per-sheet stage: drawings.stage isn't synced from the submittal.
    expect(plan.rows[0]).not.toHaveProperty("oldStage");
  });
});

describe("pure helpers", () => {
  it("compareRevisions", () => {
    expect(compareRevisions("1", "2")).toBe("older");
    expect(compareRevisions("A", "B")).toBe("older");
    expect(compareRevisions("2", "1")).toBe("newer");
    expect(compareRevisions("C", "B")).toBe("newer");
    // Letters are pre-IFC, numbers post-IFC: a letter over a number is the stale copy,
    // while a number over a letter (A → 1) crosses IFC forwards and stays not comparable.
    expect(compareRevisions("A", "1")).toBe("older");
    expect(compareRevisions("Rev B", "3")).toBe("older");
    expect(compareRevisions("1", "A")).toBe("not_comparable");
    expect(compareRevisions("0", "2")).toBe("unknown");
    expect(compareRevisions("", "A")).toBe("unknown");
    expect(compareRevisions("REV 0", "1")).toBe("unknown");
    expect(compareRevisions("-", "1")).toBe("unknown");
    expect(compareRevisions("Rev 2", "2")).toBe("same");
    expect(compareRevisions("02", "2")).toBe("same");
  });

  it("isShortSheetKey", () => {
    for (const short of ["C1", "D3", "S1", "S-1", "AB12", "12"]) expect(isShortSheetKey(short)).toBe(true);
    for (const long of ["S201", "S-201", "E101", "101E111", "602E124", "ABC1", ""]) expect(isShortSheetKey(long)).toBe(false);
  });

  it("resolveUploadSetName keeps the wizard's expression", () => {
    expect(resolveUploadSetName({ setName: "  Main Steel – L2  ", revision: "A" })).toBe("Main Steel – L2");
    expect(resolveUploadSetName({ setName: "  ", revision: "B" })).toBe("B");
    expect(resolveUploadSetName({})).toBe("Drawing Set");
  });

  it("buildReplaceSentence keeps the approved copy", () => {
    expect(buildReplaceSentence(["S-201"], "X")).toBe("S-201 replaces a page in X.");
    expect(buildReplaceSentence(["S-201", "S-204"], "X")).toBe("S-201 and S-204 replace pages in X.");
    expect(buildReplaceSentence(["S-201", "S-204", "S-209"], "Main Steel – L2", { ask: true }))
      .toBe("S-201, S-204 and S-209 replace pages in Main Steel – L2. Mark the old ones superseded?");
    expect(buildReplaceSentence(["S-201"], "X", { ask: true })).toBe("S-201 replaces a page in X. Mark the old one superseded?");
  });

  it("buildSharedNumberSentence never claims a replacement", () => {
    expect(buildSharedNumberSentence(["C1"], "Joists")).toBe("C1 shares a number with a page in Joists.");
    expect(buildSharedNumberSentence(["C1", "D3"], "Joists")).toBe("C1 and D3 share numbers with pages in Joists.");
    expect(buildSharedNumberSentence(["C1"], "Joists", { compare: true }))
      .toBe("C1 shares a number with a page in Joists. Compare the drawings before ticking.");
  });

  it("describeSupersededSet ends each set's line as a sentence", () => {
    expect(describeSupersededSet({ setId: "set-l2", setName: "Main Steel – L2", sheetNumbers: ["S-201", "S-204"] }))
      .toBe("Marked 2 pages superseded in Main Steel – L2: S-201, S-204.");
  });

  it("describeSupersedeWriteError names locks and permission refusals", () => {
    expect(describeSupersedeWriteError(new Error("[drawings.update] DRAWING_SET_LOCKED: This drawing set is locked from edits."))).toBe("Set is locked");
    expect(describeSupersedeWriteError(new Error('[drawings.update] new row violates row-level security policy for table "drawings"')))
      .toBe("You don't have permission to change it, or its set is locked");
    expect(describeSupersedeWriteError({ message: "timeout" })).toBe("timeout");
  });
});

describe("applyCrossSetSupersede", () => {
  const NOW = "2026-09-11T12:00:00.000Z";
  const freshSource = (overrides: Record<string, Partial<CrossSetSourceDrawing>> = {}): CrossSetSource => ({
    sets: [L2, set("set-new", NEW_SET)],
    drawings: [
      dwg("old-201", "set-l2", "Main Steel – L2", "S-201", "Framing Plan", "1", { metadata: { drawing_log: { row: 4 } }, ...overrides["old-201"] }),
      dwg("old-204", "set-l2", "Main Steel – L2", "S-204", "Sections", "1", { ...overrides["old-204"] }),
      dwg("old-209", "set-l2", "Main Steel – L2", "S-209", "Details", "1", { metadata: "legacy note", ...overrides["old-209"] }),
      dwg("old-999", "set-l2", "Main Steel – L2", "S-999", "Unconfirmed", "1"),
    ],
  });
  const savedRows = [
    { id: "new-201", sheet_number: "S201" },
    { id: "new-204", sheet_number: "S-204" },
    { id: "new-209", sheet_number: "S-209" },
    { id: "new-999", sheet_number: "S-999" },
  ];
  const run = (update: (id: string, patch: SupersedePatch) => Promise<unknown>, source: CrossSetSource | (() => Promise<CrossSetSource>), rows = savedRows) =>
    applyCrossSetSupersede({
      confirmedIds: ["old-201", "old-204", "old-209"],
      labels: {
        "old-201": { sheetNumber: "S-201", setName: "Main Steel – L2" },
        "old-204": { sheetNumber: "S-204", setName: "Main Steel – L2" },
        "old-209": { sheetNumber: "S-209", setName: "Main Steel – L2" },
      },
      savedRows: rows,
      parentSetId: "set-new",
      resolvedSetName: NEW_SET,
      batchId: "batch-1",
      now: NOW,
      fetchSource: typeof source === "function" ? source : async () => source,
      update,
    });

  it("writes only confirmed pages, one at a time, merging superseded_by into existing metadata", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const update = vi.fn(async (_id: string, _patch: SupersedePatch) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return {};
    });
    const result = await run(update, freshSource());
    expect(maxInFlight).toBe(1);
    expect(update.mock.calls.map(([id]) => id)).toEqual(["old-201", "old-204", "old-209"]);
    expect(update).not.toHaveBeenCalledWith("old-999", expect.anything());
    const supersededBy = (drawingId: string, sheetNumber: string) => ({
      drawing_id: drawingId, drawing_set_id: "set-new", drawing_set_name: NEW_SET,
      sheet_number: sheetNumber, upload_batch_id: "batch-1", at: NOW,
    });
    expect(update).toHaveBeenNthCalledWith(1, "old-201", { is_superseded: true, metadata: { drawing_log: { row: 4 }, superseded_by: supersededBy("new-201", "S201") } });
    expect(update).toHaveBeenNthCalledWith(2, "old-204", { is_superseded: true, metadata: { superseded_by: supersededBy("new-204", "S-204") } });
    expect(update).toHaveBeenNthCalledWith(3, "old-209", { is_superseded: true, metadata: { previous_metadata: "legacy note", superseded_by: supersededBy("new-209", "S-209") } });
    expect(result.superseded.map((item) => [item.sheetNumber, item.setName, item.replacedById])).toEqual([
      ["S-201", "Main Steel – L2", "new-201"], ["S-204", "Main Steel – L2", "new-204"], ["S-209", "Main Steel – L2", "new-209"],
    ]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(describeSupersedeActivity(groupSupersedeItemsBySet(result.superseded)[0], NEW_SET))
      .toBe('Superseded 3 pages in "Main Steel – L2" (S-201, S-204, S-209) — replaced by "Main Steel – L2 Rev A"');
  });

  it("reports a refused write per page and keeps going", async () => {
    const update = vi.fn(async (id: string) => {
      if (id === "old-204") throw new Error("[drawings.update] DRAWING_SET_LOCKED: This drawing set is locked from edits.");
      return {};
    });
    const result = await run(update, freshSource());
    expect(result.superseded.map((item) => item.id)).toEqual(["old-201", "old-209"]);
    expect(result.failed).toEqual([
      { id: "old-204", sheetNumber: "S-204", setId: "set-l2", setName: "Main Steel – L2", message: "Set is locked", failure: "write" },
    ]);
  });

  it("leaves a page live when its replacement didn't save", async () => {
    const update = vi.fn(async () => ({}));
    const result = await run(update, freshSource(), savedRows.filter((row) => row.id !== "new-204"));
    expect(update).not.toHaveBeenCalledWith("old-204", expect.anything());
    expect(result.skipped).toEqual([
      expect.objectContaining({ id: "old-204", sheetNumber: "S-204", skipReason: "replacement_not_saved", message: "its replacement didn't save — left live" }),
    ]);
    expect(result.superseded).toHaveLength(2);
  });

  it("re-checks a stale preview against the fresh read", async () => {
    const update = vi.fn(async () => ({}));
    const source = freshSource({
      "old-201": { is_superseded: true },
      "old-204": { is_deleted: true },
      "old-209": { drawing_set_id: "set-new", drawing_set_name: NEW_SET },
    });
    const result = await run(update, source);
    expect(update).not.toHaveBeenCalled();
    expect(result.skipped.map((item) => [item.id, item.skipReason])).toEqual([
      ["old-201", "no_longer_live"], ["old-204", "no_longer_live"], ["old-209", "now_in_this_set"],
    ]);
  });

  it("writes nothing and fails every page when the fresh read fails", async () => {
    const update = vi.fn(async () => ({}));
    const result = await run(update, async () => { throw new Error("network down"); });
    expect(update).not.toHaveBeenCalled();
    expect(result.superseded).toEqual([]);
    expect(result.failed.map((item) => [item.sheetNumber, item.setName, item.message])).toEqual([
      ["S-201", "Main Steel – L2", SUPERSEDE_FETCH_FAILED],
      ["S-204", "Main Steel – L2", SUPERSEDE_FETCH_FAILED],
      ["S-209", "Main Steel – L2", SUPERSEDE_FETCH_FAILED],
    ]);
  });

  it("does nothing without confirmed ids", async () => {
    const fetchSource = vi.fn(async () => freshSource());
    const update = vi.fn(async () => ({}));
    const result = await applyCrossSetSupersede({
      confirmedIds: [], savedRows, parentSetId: "set-new", resolvedSetName: NEW_SET, batchId: null, now: NOW, fetchSource, update,
    });
    expect(result).toEqual({ superseded: [], failed: [], skipped: [] });
    expect(fetchSource).not.toHaveBeenCalled();
  });
});
