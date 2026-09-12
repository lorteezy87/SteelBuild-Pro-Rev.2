import { describe, expect, it } from "vitest";
import { buildBoardItems, resolvePackageStage } from "@/components/submittals/processBoard.derive";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";
import type { TransmittalRow } from "@/hooks/useTransmittals";
import {
  MATRIX_FILTERS,
  buildLastOutgoingBySet,
  buildLastTransmittalBySet,
  createSubmittalForSetHref,
  enrichApprovalMatrixRows,
  lastSentForSet,
  matchesMatrixFilter,
  parseMatrixFilter,
  submittalHref,
  summarizeMatrixCoverage,
  transmittalHref,
} from "../approvalMatrix.derive";
import type { LastOutgoingTransmittal } from "../approvalMatrix.derive";
import { buildApprovalMatrixRows, buildSetPackages, summarizeApprovalMatrix } from "../format";

function hold(drawingId: string, isActive = true): DrawingHoldRow {
  return {
    id: `hold-${drawingId}-${isActive ? "on" : "off"}`,
    project_id: "p1",
    drawing_id: drawingId,
    reason: "Pending RFI",
    prior_release_status: null,
    placed_by_id: null,
    placed_by_name: null,
    placed_at: "2026-08-01T00:00:00Z",
    is_active: isActive,
    released_by_id: null,
    released_by_name: null,
    released_at: isActive ? null : "2026-08-02T00:00:00Z",
    release_notes: null,
    created_at: "2026-08-01T00:00:00Z",
  };
}

// A null drawing id is an item whose revision wasn't in useTransmittals' read.
function transmittal(overrides: Partial<TransmittalRow> & { drawingIds?: Array<string | null> } = {}): TransmittalRow {
  const { drawingIds = [], ...rest } = overrides;
  const items = drawingIds.map((drawingId, i) => ({
    id: `${rest.id ?? "t"}-item-${i}`,
    drawing_revision_id: `rev-${drawingId ?? `unmatched-${i}`}`,
    drawing_id: drawingId,
    sheet_number: drawingId ? drawingId.toUpperCase() : null,
    sheet_title: null as string | null,
    revision_code: "0",
  }));
  return {
    id: "t",
    project_id: "p1",
    transmittal_number: "T-001",
    direction: "outgoing",
    source_company: null,
    received_from: null,
    sent_to: "EOR",
    subject: null,
    date_sent: "2026-08-01",
    date_received: null,
    notes: null,
    created_at: "2026-08-01T09:00:00Z",
    is_deleted: false,
    items,
    item_count: items.length,
    ...rest,
  };
}

const SETS = [
  { id: "s1", set_name: "Main Steel" },
  { id: "s2", set_name: "Anchor Bolts" },
  { id: "s3", set_name: "Stairs" },
];

const DRAWINGS = [
  { id: "d1", drawing_set_id: "s1", stage: "IFA" },
  { id: "d2", drawing_set_id: "s1", stage: "IFA" },
  { id: "d3", drawing_set_id: "s1", stage: "IFA", is_superseded: true },
  { id: "d4", drawing_set_id: "s2", stage: "OFA" },
  { id: "d5", drawing_set_id: "s3", stage: "IFA", is_deleted: true },
];

function enrich(
  submittals: any[],
  opts: { holds?: DrawingHoldRow[]; transmittals?: TransmittalRow[]; sets?: any[]; drawings?: any[]; current?: ReadonlyMap<string, string> } = {},
) {
  const sets = opts.sets ?? SETS;
  const packages = buildSetPackages((opts.drawings ?? DRAWINGS) as any, sets as any, submittals as any);
  const rows = buildApprovalMatrixRows(sets, submittals);
  return {
    packages,
    rows: enrichApprovalMatrixRows(rows, {
      setPackages: packages,
      holds: opts.holds,
      transmittals: opts.transmittals,
      currentRevisionIdByDrawingId: opts.current,
    }),
  };
}

const byId = <T extends { id: string }>(rows: T[], id: string): T => {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
};

describe("enrichApprovalMatrixRows — sheets and holds (2026 columns)", () => {
  it("counts live sheets and ACTIVE holds per set; superseded, deleted and released don't count", () => {
    const { rows } = enrich([], {
      holds: [hold("d1"), hold("d2", false), hold("d3"), hold("d4")],
    });
    expect(byId(rows, "s1")).toMatchObject({ sheetCount: 2, onHold: 1 }); // d3 superseded, d2 released
    expect(byId(rows, "s2")).toMatchObject({ sheetCount: 1, onHold: 1 });
    expect(byId(rows, "s3")).toMatchObject({ sheetCount: 0, onHold: 0 }); // d5 deleted
  });

  it("reports an unknown sheet count (null) rather than 0 when the set has no package", () => {
    const rows = enrichApprovalMatrixRows(buildApprovalMatrixRows(SETS, []), { setPackages: [] });
    expect(rows.every((r) => r.sheetCount === null && r.onHold === 0)).toBe(true);
  });

  it("keeps buildApprovalMatrixRows order and fields untouched", () => {
    const submittals = [{ id: "a", drawing_set_ids: ["s1"], status: "Submitted", submittal_number: "001", submitted_date: "2026-08-01" }];
    const base = buildApprovalMatrixRows(SETS, submittals);
    const { rows } = enrich(submittals);
    expect(rows.map((r) => r.id)).toEqual(base.map((r) => r.id));
    expect(byId(rows, "s1").latestSubmittal.id).toBe("a");
  });
});

describe("enrichApprovalMatrixRows — stage", () => {
  const submittals = [
    { id: "a", drawing_set_ids: ["s1"], status: "Under Review", ball_in_court: "EOR", submittal_number: "001", submitted_date: "2026-08-01" },
    { id: "v", drawing_set_ids: ["s2"], status: "Void", submittal_number: "002" },
  ];

  it("matches the Process Board's stage for every set (one rule, two tabs)", () => {
    const { rows, packages } = enrich(submittals);
    const board = buildBoardItems(packages, submittals);
    for (const row of rows) {
      const item = board.find((b) => b.id === `set-id:${row.id}`);
      expect(item, row.id).toBeTruthy();
      expect(row.stage, row.id).toBe(item?.stage);
    }
  });

  it("labels where the stage came from: submittal, legacy sheet fallback, or nothing", () => {
    const { rows } = enrich(submittals);
    expect(byId(rows, "s1").stageSource).toBe("submittal");
    // Void governs (fallback) but maps to no stage → the sheets' stage, flagged as such.
    expect(byId(rows, "s2")).toMatchObject({ stageSource: "sheets", stage: "OFA" });
    expect(byId(rows, "s3")).toMatchObject({ stageSource: "none", stage: "Not Started" });
  });

  it("resolvePackageStage prefers the governing submittal over sheet stages", () => {
    expect(resolvePackageStage([{ id: "a", status: "Released for Fabrication", submitted_date: "2026-08-01" }], [{ stage: "IFA" }])).toBe("Released");
    expect(resolvePackageStage([{ id: "v", status: "Void" }], [{ stage: "OFA" }])).toBe("OFA");
    expect(resolvePackageStage([], [])).toBe("Not Started");
  });
});

describe("buildLastTransmittalBySet (items → revision → sheet → set)", () => {
  const { packages } = enrich([]);

  it("picks the newest by the date the direction implies, across both directions", () => {
    const last = buildLastTransmittalBySet([
      transmittal({ id: "out", transmittal_number: "T-001", date_sent: "2026-08-01", drawingIds: ["d1"] }),
      transmittal({ id: "in", transmittal_number: "T-002", direction: "incoming", date_sent: null, date_received: "2026-08-05", received_from: "EOR", drawingIds: ["d2"] }),
    ], packages);
    expect(last.get("s1")).toEqual({ id: "in", number: "T-002", direction: "incoming", party: "EOR", date: "2026-08-05" });
  });

  it("breaks same-day ties on created_at, then on transmittal number", () => {
    const last = buildLastTransmittalBySet([
      transmittal({ id: "early", transmittal_number: "T-009", created_at: "2026-08-01T08:00:00Z", drawingIds: ["d1"] }),
      transmittal({ id: "late", transmittal_number: "T-003", created_at: "2026-08-01T17:00:00Z", drawingIds: ["d1"] }),
    ], packages);
    expect(last.get("s1")?.id).toBe("late");
    const tie = buildLastTransmittalBySet([
      transmittal({ id: "t2", transmittal_number: "T-2", drawingIds: ["d1"] }),
      transmittal({ id: "t10", transmittal_number: "T-10", drawingIds: ["d1"] }),
    ], packages);
    expect(tie.get("s1")?.id).toBe("t10"); // natural order: T-10 > T-2
  });

  it("maps superseded sheets, spans sets, and ignores deleted transmittals and unknown sheets", () => {
    const last = buildLastTransmittalBySet([
      transmittal({ id: "both", transmittal_number: "T-001", drawingIds: ["d3", "d4", "ghost"] }),
      transmittal({ id: "deleted", transmittal_number: "T-099", date_sent: "2026-12-31", is_deleted: true, drawingIds: ["d4"] }),
    ], packages);
    expect(last.get("s1")?.id).toBe("both"); // d3 is superseded but still in s1
    expect(last.get("s2")?.id).toBe("both");
    expect(last.has("s3")).toBe(false);
  });

  it("ignores voided transmittals: void is m4_1's only retraction, and it keeps its dates", () => {
    const last = buildLastTransmittalBySet([
      transmittal({ id: "live", transmittal_number: "T-001", status: "sent", date_sent: "2026-08-01", drawingIds: ["d1"] }),
      transmittal({ id: "void", transmittal_number: "T-002", status: "void", date_sent: "2026-08-05", drawingIds: ["d1", "d4"] }),
    ], packages);
    expect(last.get("s1")?.id).toBe("live");
    expect(last.has("s2")).toBe(false);
  });

  it("falls back to created_at when a transmittal carries no date", () => {
    const last = buildLastTransmittalBySet([
      transmittal({ id: "dated", date_sent: "2026-08-01", drawingIds: ["d1"] }),
      transmittal({ id: "undated", date_sent: null, created_at: "2026-08-03T00:00:00Z", drawingIds: ["d1"] }),
    ], packages);
    expect(last.get("s1")).toMatchObject({ id: "undated", date: null });
  });

  // Local-vs-UTC day keys are pinned in approvalMatrix.derive.localday.test.ts:
  // this suite runs under TZ=UTC, which hides exactly that difference.
});

describe("buildLastOutgoingBySet + lastSentForSet (the expanded row's Last sent)", () => {
  // Every sheet's current revision is the one the fixture sends by default.
  const CURRENT: ReadonlyMap<string, string> = new Map([["d1", "rev-d1"], ["d2", "rev-d2"], ["d3", "rev-d3"], ["d4", "rev-d4"]]);
  const currentWith = (changes: Record<string, string | null>) => {
    const map = new Map(CURRENT);
    for (const [drawingId, revisionId] of Object.entries(changes)) {
      if (revisionId === null) map.delete(drawingId);
      else map.set(drawingId, revisionId);
    }
    return map;
  };

  // What useTransmittals hands over when its transmittals or items read hit the
  // row cap: the same rows, flagged with a non-enumerable property.
  const truncatedLog = (rows: TransmittalRow[]): TransmittalRow[] =>
    Object.defineProperty(rows, "possiblyTruncated", { value: true, enumerable: false });

  // One sheet sent at two revisions, the older of which is no longer current.
  const CURRENT_REV_ITEM = { id: "a", drawing_revision_id: "rev-d1", drawing_id: "d1", sheet_number: "D1", sheet_title: null as string | null, revision_code: "1" };
  const OLDER_REV_ITEM = { id: "b", drawing_revision_id: "rev-d1-A", drawing_id: "d1", sheet_number: "D1", sheet_title: null as string | null, revision_code: "0" };

  type Expected =
    | "none"
    | { unknown: number; truncated?: boolean }
    | { undated: string }
    | Partial<LastOutgoingTransmittal>;
  const asLastSent = (expected: Expected) =>
    expected === "none"
      ? { kind: "none" }
      : "unknown" in expected
        ? { kind: "unknown", unresolvedItems: expected.unknown, possiblyTruncated: expected.truncated ?? false }
        : "undated" in expected
          ? { kind: "undated", transmittal: { id: expected.undated } }
          : { kind: "sent", transmittal: expected };

  const CASES: Array<{
    name: string;
    transmittals: TransmittalRow[];
    current?: ReadonlyMap<string, string>;
    drawings?: any[];
    expected: Record<string, Expected>;
  }> = [
    {
      name: "ignores incoming transmittals, even one carrying a send date",
      transmittals: [transmittal({ id: "in", direction: "incoming", date_sent: "2026-08-05", date_received: "2026-08-05", drawingIds: ["d1"] })],
      expected: { s1: "none" },
    },
    {
      name: "ignores internal transmittals, dated or not",
      transmittals: [
        transmittal({ id: "int", direction: "internal", drawingIds: ["d1"] }),
        transmittal({ id: "int-undated", direction: "internal", date_sent: null, drawingIds: ["d1", "ghost"] }),
      ],
      expected: { s1: "none" },
    },
    {
      name: "an outgoing transmittal with no send date, null or blank, still carried its set: sent, date not entered",
      transmittals: [
        transmittal({ id: "no-date", date_sent: null, drawingIds: ["d1"] }),
        transmittal({ id: "blank-date", date_sent: "  ", drawingIds: ["d4"] }),
      ],
      expected: { s1: { undated: "no-date" }, s2: { undated: "blank-date" }, s3: "none" },
    },
    {
      name: "of two undated transmittals the later logged wins, then the higher number",
      transmittals: [
        transmittal({ id: "later", transmittal_number: "T-001", date_sent: null, created_at: "2026-08-05T09:00:00Z", drawingIds: ["d1"] }),
        transmittal({ id: "earlier", transmittal_number: "T-009", date_sent: null, created_at: "2026-08-01T09:00:00Z", drawingIds: ["d1"] }),
        transmittal({ id: "t2", transmittal_number: "T-2", date_sent: null, drawingIds: ["d4"] }),
        transmittal({ id: "t10", transmittal_number: "T-10", date_sent: null, drawingIds: ["d4"] }),
      ],
      expected: { s1: { undated: "later" }, s2: { undated: "t10" } },
    },
    {
      name: "a dated transmittal wins over an undated one logged after it: only the dated one can be ordered",
      transmittals: [
        transmittal({ id: "dated", date_sent: "2026-08-01", created_at: "2026-08-01T09:00:00Z", drawingIds: ["d1"] }),
        transmittal({ id: "undated", date_sent: null, created_at: "2026-08-09T09:00:00Z", drawingIds: ["d2"] }),
      ],
      expected: { s1: { id: "dated", sheetCount: 1 } },
    },
    {
      name: "ignores soft-deleted transmittals, dated or not",
      transmittals: [
        transmittal({ id: "gone", is_deleted: true, drawingIds: ["d1"] }),
        transmittal({ id: "gone-undated", is_deleted: true, date_sent: null, drawingIds: ["d1", "ghost"] }),
      ],
      expected: { s1: "none" },
    },
    {
      name: "the newest send date wins, even when it was logged first",
      transmittals: [
        transmittal({ id: "newer", transmittal_number: "T-001", date_sent: "2026-08-05", created_at: "2026-08-01T09:00:00Z", drawingIds: ["d1"] }),
        transmittal({ id: "older", transmittal_number: "T-002", date_sent: "2026-08-01", created_at: "2026-08-06T09:00:00Z", drawingIds: ["d1"] }),
      ],
      expected: { s1: { id: "newer" } },
    },
    {
      name: "a same-day tie goes to the later created_at, ahead of the transmittal number",
      transmittals: [
        transmittal({ id: "late", transmittal_number: "T-001", created_at: "2026-08-01T17:00:00Z", drawingIds: ["d1"] }),
        transmittal({ id: "early", transmittal_number: "T-009", created_at: "2026-08-01T08:00:00Z", drawingIds: ["d1"] }),
      ],
      expected: { s1: { id: "late" } },
    },
    {
      name: "one transmittal spanning two sets updates both",
      transmittals: [transmittal({ id: "both", drawingIds: ["d1", "d4"] })],
      expected: { s1: { id: "both", sheetCount: 1 }, s2: { id: "both", sheetCount: 1 }, s3: "none" },
    },
    {
      name: "each set keeps its own newest",
      transmittals: [
        transmittal({ id: "both", date_sent: "2026-08-01", drawingIds: ["d1", "d4"] }),
        transmittal({ id: "s1-only", date_sent: "2026-08-05", drawingIds: ["d2"] }),
      ],
      expected: { s1: { id: "s1-only", sheetCount: 1 }, s2: { id: "both" } },
    },
    {
      name: "counts distinct sheets, not items",
      transmittals: [transmittal({ id: "dup", drawingIds: ["d1", "d1", "d2"] })],
      expected: { s1: { sheetCount: 2, revisedSinceSent: 0 } },
    },
    {
      name: "a sheet whose current revision moved on is revised since sent",
      transmittals: [transmittal({ id: "t", drawingIds: ["d1", "d2"] })],
      current: currentWith({ d1: "rev-d1-B" }),
      expected: { s1: { sheetCount: 2, revisedSinceSent: 1, supersededNow: 0, uncheckedSheets: 0 } },
    },
    {
      name: "a superseded sheet counts as superseded now, not revised: the revise-as-a-new-set workflow",
      transmittals: [transmittal({ id: "t", drawingIds: ["d3"] })],
      expected: { s1: { sheetCount: 1, revisedSinceSent: 0, supersededNow: 1, uncheckedSheets: 0 } },
    },
    {
      name: "a sheet both revised and superseded counts in both parts",
      transmittals: [transmittal({ id: "t", drawingIds: ["d3"] })],
      current: currentWith({ d3: "rev-d3-B" }),
      expected: { s1: { sheetCount: 1, revisedSinceSent: 1, supersededNow: 1, uncheckedSheets: 0 } },
    },
    {
      name: "a superseded sheet with no current revision loaded is superseded now AND unchecked, never unrevised",
      transmittals: [transmittal({ id: "t", drawingIds: ["d3"] })],
      current: currentWith({ d3: null }),
      expected: { s1: { revisedSinceSent: 0, supersededNow: 1, uncheckedSheets: 1 } },
    },
    {
      name: "current revision listed first: not revised while any revision it carried for the sheet is still current",
      transmittals: [transmittal({ id: "two-revs", items: [CURRENT_REV_ITEM, OLDER_REV_ITEM] })],
      expected: { s1: { sheetCount: 1, revisedSinceSent: 0, uncheckedSheets: 0 } },
    },
    {
      // useTransmittals sorts a sheet's items by revision_code ascending, so
      // real data lists the older revision first and the current one last.
      name: "older revision listed first, as useTransmittals sorts: not revised while any revision it carried is still current",
      transmittals: [transmittal({ id: "two-revs", items: [OLDER_REV_ITEM, CURRENT_REV_ITEM] })],
      expected: { s1: { sheetCount: 1, revisedSinceSent: 0, uncheckedSheets: 0 } },
    },
    {
      name: "a live sheet with no current revision loaded is unchecked, not revised",
      transmittals: [transmittal({ id: "t", drawingIds: ["d1", "d2"] })],
      current: currentWith({ d2: null }),
      expected: { s1: { sheetCount: 2, revisedSinceSent: 0, uncheckedSheets: 1 } },
    },
    {
      name: "unmatched items make every unmatched set Unknown, while a matched set still shows its transmittal",
      transmittals: [transmittal({ id: "t", drawingIds: ["d1", null, "ghost"] })],
      expected: { s1: { id: "t", sheetCount: 1 }, s2: { unknown: 2 }, s3: { unknown: 2 } },
    },
    {
      name: "a sheet deleted since is unmatched: it could have been any set's",
      transmittals: [transmittal({ id: "t", drawingIds: ["d5"] })],
      expected: { s3: { unknown: 1 }, s1: { unknown: 1 } },
    },
    {
      name: "unmatched items on incoming transmittals don't make anything Unknown",
      transmittals: [transmittal({ id: "in", direction: "incoming", date_received: "2026-08-02", drawingIds: [null] })],
      expected: { s1: "none", s2: "none" },
    },
    {
      name: "unmatched items on an undated outgoing transmittal make every unmatched set Unknown",
      transmittals: [transmittal({ id: "no-date", date_sent: null, drawingIds: ["d1", "ghost"] })],
      expected: { s1: { undated: "no-date" }, s2: { unknown: 1 }, s3: { unknown: 1 } },
    },
    {
      name: "a log cut off at the row cap makes every set with no transmittal of its own Unknown, never Not sent yet",
      transmittals: truncatedLog([
        transmittal({ id: "t", drawingIds: ["d1"] }),
        transmittal({ id: "no-date", date_sent: null, drawingIds: ["d4"] }),
      ]),
      expected: { s1: { id: "t" }, s2: { undated: "no-date" }, s3: { unknown: 0, truncated: true } },
    },
    {
      name: "a log cut off at the row cap is Unknown even with no rows left to show",
      transmittals: truncatedLog([]),
      expected: { s1: { unknown: 0, truncated: true }, s3: { unknown: 0, truncated: true } },
    },
    {
      name: "a cut-off log with unmatched items reports both",
      transmittals: truncatedLog([transmittal({ id: "t", drawingIds: [null] })]),
      expected: { s1: { unknown: 1, truncated: true } },
    },
    {
      name: "a known sheet in no set is skipped, not unmatched",
      transmittals: [transmittal({ id: "t", drawingIds: ["loose"] })],
      drawings: [...DRAWINGS, { id: "loose", stage: "IFA" }],
      expected: { s1: "none", s2: "none" },
    },
    {
      name: "a sheet sent with no revision recorded (m4_1 items carry only drawing_id) is placed, and unchecked, never revised",
      transmittals: [transmittal({ id: "no-rev", items: [{ ...CURRENT_REV_ITEM, id: "n", drawing_revision_id: null }] })],
      expected: { s1: { id: "no-rev", sheetCount: 1, revisedSinceSent: 0, uncheckedSheets: 1 }, s2: "none" },
    },
    {
      name: "a voided transmittal is skipped, even a newer one, and the older live one wins",
      transmittals: [
        transmittal({ id: "void", transmittal_number: "T-002", status: "void", date_sent: "2026-08-05", drawingIds: ["d1"] }),
        transmittal({ id: "live", transmittal_number: "T-001", status: "sent", date_sent: "2026-08-01", drawingIds: ["d1"] }),
      ],
      expected: { s1: { id: "live" } },
    },
    {
      name: "a set carried only by a voided transmittal is not sent yet, and the void's unmatched items make nothing Unknown",
      transmittals: [transmittal({ id: "void", status: "void", drawingIds: ["d1", "ghost"] })],
      expected: { s1: "none", s2: "none" },
    },
    {
      name: "a set carried only by a voided transmittal is Unknown while another transmittal's item is unmatched",
      transmittals: [
        transmittal({ id: "void", status: "void", drawingIds: ["d4"] }),
        transmittal({ id: "live", status: "sent", drawingIds: ["d1", "ghost"] }),
      ],
      expected: { s1: { id: "live" }, s2: { unknown: 1 } },
    },
    {
      name: "acknowledged and a dated draft (Rev.2's own inserts land as draft) count as sent",
      transmittals: [
        transmittal({ id: "ack", status: "acknowledged", drawingIds: ["d1"] }),
        transmittal({ id: "draft", status: "draft", drawingIds: ["d4"] }),
      ],
      expected: { s1: { id: "ack" }, s2: { id: "draft" } },
    },
    {
      name: "an undated draft still carried its set: placed as undated, never Not sent yet",
      transmittals: [transmittal({ id: "undated-draft", status: "draft", date_sent: null, drawingIds: ["d1"] })],
      expected: { s1: { undated: "undated-draft" } },
    },
    {
      name: "no outgoing transmittals: Not sent yet everywhere",
      transmittals: [],
      expected: { s1: "none", s2: "none", s3: "none" },
    },
  ];

  it.each(CASES)("$name", ({ transmittals, current = CURRENT, drawings = DRAWINGS, expected }) => {
    const packages = buildSetPackages(drawings as any, SETS as any, []);
    const rollup = buildLastOutgoingBySet(transmittals, packages, current);
    for (const [setId, want] of Object.entries(expected)) {
      expect(lastSentForSet(rollup, setId), setId).toMatchObject(asLastSent(want));
    }
  });

  it("reports the number, the entered day as written, the trimmed recipient and every count", () => {
    const { packages } = enrich([]);
    const rollup = buildLastOutgoingBySet([
      transmittal({ id: "t-9", transmittal_number: "T-009", date_sent: "2026-08-03T00:00:00+00:00", sent_to: "  EOR  ", drawingIds: ["d1", "d2", "d3"] }),
    ], packages, currentWith({ d1: "rev-d1-B", d2: null }));
    expect(lastSentForSet(rollup, "s1")).toEqual({
      kind: "sent",
      possiblyTruncated: false,
      transmittal: {
        id: "t-9",
        number: "T-009",
        dateSent: "2026-08-03",
        sentTo: "EOR",
        sheetCount: 3,
        revisedSinceSent: 1, // d1
        supersededNow: 1, // d3, still at the revision sent
        uncheckedSheets: 1, // d2
      },
    });
    expect(rollup.unresolvedItems).toBe(0);
    expect(rollup.possiblyTruncated).toBe(false);
    expect(rollup.undatedBySet.size).toBe(0);
  });

  it("drops a blank recipient rather than showing 'to '", () => {
    const { packages } = enrich([]);
    const rollup = buildLastOutgoingBySet([transmittal({ id: "t", sent_to: "   ", drawingIds: ["d1"] })], packages, CURRENT);
    expect(rollup.bySet.get("s1")?.sentTo).toBeNull();
  });

  it("is attached by enrichApprovalMatrixRows, beside #334's either-direction Last Transmittal", () => {
    const transmittals = [
      transmittal({ id: "out", transmittal_number: "T-001", date_sent: "2026-08-01", drawingIds: ["d1"] }),
      transmittal({ id: "in", transmittal_number: "T-002", direction: "incoming", date_sent: null, date_received: "2026-08-05", received_from: "EOR", drawingIds: ["d2"] }),
    ];
    const { rows } = enrich([], { transmittals, current: CURRENT });
    // #334's column still shows the newer INCOMING one; Last sent shows what went out.
    expect(byId(rows, "s1").lastTransmittal?.id).toBe("in");
    expect(byId(rows, "s1").lastSent).toMatchObject({ kind: "sent", transmittal: { id: "out", sheetCount: 1, revisedSinceSent: 0, uncheckedSheets: 0 } });
    expect(byId(rows, "s2").lastSent).toEqual({ kind: "none" });

    // Without the revision map nothing can be checked, so nothing is called unrevised.
    const unchecked = enrich([], { transmittals });
    expect(byId(unchecked.rows, "s1").lastSent).toMatchObject({ kind: "sent", transmittal: { revisedSinceSent: 0, uncheckedSheets: 1 } });
  });

  it("carries a cut-off log's flag through enrichApprovalMatrixRows", () => {
    const { rows } = enrich([], { transmittals: truncatedLog([transmittal({ id: "out", drawingIds: ["d1"] })]), current: CURRENT });
    expect(byId(rows, "s1").lastSent).toMatchObject({ kind: "sent", possiblyTruncated: true, transmittal: { id: "out" } });
    expect(byId(rows, "s2").lastSent).toEqual({ kind: "unknown", unresolvedItems: 0, possiblyTruncated: true });
  });

  it("carries a cut-off log's flag onto a set's own transmittal, dated or not: its counts are lower bounds", () => {
    const { packages } = enrich([]);
    const cutOff = buildLastOutgoingBySet(truncatedLog([
      transmittal({ id: "t", drawingIds: ["d1"] }),
      transmittal({ id: "no-date", date_sent: null, drawingIds: ["d4"] }),
    ]), packages, CURRENT);
    expect(lastSentForSet(cutOff, "s1")).toMatchObject({ kind: "sent", possiblyTruncated: true, transmittal: { id: "t" } });
    expect(lastSentForSet(cutOff, "s2")).toMatchObject({ kind: "undated", possiblyTruncated: true, transmittal: { id: "no-date" } });

    const whole = buildLastOutgoingBySet([
      transmittal({ id: "t", drawingIds: ["d1"] }),
      transmittal({ id: "no-date", date_sent: null, drawingIds: ["d4"] }),
    ], packages, CURRENT);
    expect(lastSentForSet(whole, "s1")).toMatchObject({ kind: "sent", possiblyTruncated: false });
    expect(lastSentForSet(whole, "s2")).toMatchObject({ kind: "undated", possiblyTruncated: false });
  });

  it("marks an undated draft as a draft, and an undated row with no status as not one", () => {
    const { packages } = enrich([]);
    const rollup = buildLastOutgoingBySet([
      transmittal({ id: "draft", status: "draft", date_sent: null, drawingIds: ["d1"] }),
      transmittal({ id: "legacy", date_sent: null, drawingIds: ["d4"] }),
    ], packages, CURRENT);
    expect(rollup.undatedBySet.get("s1")).toEqual({ id: "draft", number: "T-001", draft: true });
    expect(rollup.undatedBySet.get("s2")).toEqual({ id: "legacy", number: "T-001", draft: false });
  });
});

describe("matchesMatrixFilter — every pill's count equals the rows its filter shows", () => {
  const sets = [
    { id: "s1", set_name: "A" }, { id: "s2", set_name: "B" }, { id: "s3", set_name: "C" },
    { id: "s4", set_name: "D" }, { id: "s5", set_name: "E" }, { id: "s6", set_name: "F" },
  ];
  const drawings = [
    { id: "d1", drawing_set_id: "s1" }, { id: "d2", drawing_set_id: "s2" }, { id: "d6", drawing_set_id: "s6" },
  ];
  const submittals = [
    { id: "late", drawing_set_ids: ["s1"], status: "Submitted", submitted_date: "2026-01-05", required_date: "2000-01-01", submittal_number: "1" },
    { id: "ok", drawing_set_ids: ["s2"], status: "Approved", submitted_date: "2026-01-05", returned_date: "2026-01-09", submittal_number: "2" },
    { id: "rr", drawing_set_ids: ["s3"], status: "Revise and Resubmit", submitted_date: "2026-01-05", submittal_number: "3" },
    { id: "eor", drawing_set_ids: ["s4"], status: "Under Review", submitted_date: "2026-01-05", submittal_number: "4", approver_notes: [{ id: "n", note: "Confirm camber?", response: "" }] },
    { id: "void", drawing_set_ids: ["s5"], status: "Void", submittal_number: "5" },
  ];
  const { rows } = enrich(submittals, { sets, drawings, holds: [hold("d1"), hold("d6")] });
  const summary = summarizeApprovalMatrix(rows);
  const coverage = summarizeMatrixCoverage(rows);
  const expected: Record<(typeof MATRIX_FILTERS)[number], number> = {
    overdue: summary.overdue,
    pending: summary.pending,
    action: summary.rejected,
    approved: summary.approved,
    eor: summary.pendingEor,
    nosub: summary.noSubmittal,
    hold: coverage.setsOnHold,
  };

  it.each(MATRIX_FILTERS.map((f) => [f]))("%s", (filter) => {
    const shown = rows.filter((row) => matchesMatrixFilter(row, filter)).length;
    expect(shown).toBe(expected[filter]);
    expect(shown).toBeGreaterThan(0); // the fixture exercises every bucket
  });

  it("no filter shows every row", () => {
    expect(rows.filter((row) => matchesMatrixFilter(row, null))).toHaveLength(rows.length);
  });

  it("never files a Void submittal under pending", () => {
    expect(matchesMatrixFilter(byId(rows, "s5"), "pending")).toBe(false);
  });

  it("summarizes holds and released coverage", () => {
    expect(coverage).toEqual({ setsOnHold: 2, sheetsOnHold: 2, released: 0 });
  });
});

describe("parseMatrixFilter", () => {
  it("round-trips every filter and rejects anything else", () => {
    for (const f of MATRIX_FILTERS) expect(parseMatrixFilter(f)).toBe(f);
    expect(parseMatrixFilter(null)).toBeNull();
    expect(parseMatrixFilter("")).toBeNull();
    expect(parseMatrixFilter("OVERDUE")).toBeNull();
    expect(parseMatrixFilter("constructor")).toBeNull();
  });
});

describe("hub deep links", () => {
  it("are absolute in-hub ?hub_tab= links the receiving tab consumes", () => {
    expect(submittalHref("sub-1")).toBe("/DrawingSubmittalHub?hub_tab=submittals&recordId=sub-1");
    expect(createSubmittalForSetHref("set 1")).toBe("/DrawingSubmittalHub?hub_tab=submittals&targetSetId=set+1");
    expect(transmittalHref("t-1")).toBe("/DrawingSubmittalHub?hub_tab=transmittals&transmittal=t-1");
  });
});
