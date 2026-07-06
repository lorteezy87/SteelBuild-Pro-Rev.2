import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bucketByStage,
  buildBoardItems,
  filterItems,
  summarizeBoard,
} from "../processBoard.derive";

// STAGE_ORDER used by the panel; mirrored here so bucket tests don't import UI config.
const STAGE_ORDER = ["Not Started", "IFA", "OFA", "BFA", "OFS", "IFC", "Released"];

function isoDaysFromNow(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

const setPackage: any = {
  key: "id:set-1",
  setId: "set-1",
  name: "Anchor Bolts - OFA",
  parent: {
    id: "set-1",
    set_name: "Anchor Bolts - OFA",
    drawing_set_number: "AB-1",
    discipline: "Structural",
  },
  sheets: [
    { id: "d1", drawing_set_id: "set-1", stage: "OFA", due_date: isoDaysFromNow(5) },
    { id: "d2", drawing_set_id: "set-1", stage: "OFA", due_date: isoDaysFromNow(6) },
  ],
  submittals: [
    {
      id: "sub-1",
      submittal_number: "05-1000",
      title: "Anchor bolts",
      status: "Submitted",
      ball_in_court: "EOR",
      submitted_date: isoDaysFromNow(-2),
      required_date: isoDaysFromNow(5),
      drawing_set_ids: ["set-1"],
    },
  ],
};

// The overdue unlinked resubmittal. Its `required_date` is a FIXED past date and
// the assertions that depend on overdue-ness pin the machine clock (below), so
// the overdue signal is deterministic regardless of the runner's timezone (a
// bare relative `isoDaysFromNow(-1)` is tz-fragile in MST — the toISOString UTC
// shift can round a "yesterday" back to today).
const unlinkedSubmittal: any = {
  id: "sub-2",
  submittal_number: "05-2000",
  title: "Embed plates",
  status: "Revise and Resubmit",
  ball_in_court: "Detailer",
  required_date: "2026-07-03", // Fri, one working/calendar day before the pinned Mon Jul 6
  drawing_set_ids: [],
};

// Pinned "today" = Monday Jul 6 2026, used by the overdue-dependent blocks so the
// fixed required_date above reads as overdue no matter the host timezone.
const PINNED_TODAY = new Date("2026-07-06T12:00:00");

afterEach(() => {
  vi.useRealTimers();
});

describe("buildBoardItems", () => {
  it("maps a linked drawing-set package to its derived submittal stage", () => {
    const items = buildBoardItems([setPackage], [...setPackage.submittals, unlinkedSubmittal]);
    const pkg = items.find((i) => i.id === "set-id:set-1");
    expect(pkg).toBeTruthy();
    expect(pkg!.kind).toBe("Drawing Set");
    expect(pkg!.title).toBe("Anchor Bolts - OFA");
    expect(pkg!.stage).toBe("OFA");
    expect(pkg!.submittalNumber).toBe("05-1000");
    expect(pkg!.linked).toBe(true);
  });

  it("surfaces an unlinked resubmittal as its own action item", () => {
    vi.useFakeTimers();
    vi.setSystemTime(PINNED_TODAY);
    const items = buildBoardItems([setPackage], [...setPackage.submittals, unlinkedSubmittal]);
    const sub = items.find((i) => i.id === "submittal-sub-2");
    expect(sub).toBeTruthy();
    expect(sub!.kind).toBe("Unlinked Submittal");
    expect(sub!.title).toBe("05-2000 - Embed plates");
    expect(sub!.linked).toBe(false);
    expect(sub!.needsAction).toBe(true);
    expect(sub!.isRR).toBe(true);
    expect(sub!.due.overdue).toBe(true); // required_date (Jul 3) is before pinned today (Jul 6)
  });

  it("does not double-count a submittal that is linked to a package", () => {
    const items = buildBoardItems([setPackage], [...setPackage.submittals, unlinkedSubmittal]);
    // sub-1 is inside the package, so it must NOT appear as an unlinked item.
    expect(items.some((i) => i.id === "submittal-sub-1")).toBe(false);
    expect(items).toHaveLength(2); // the package + the unlinked sub
  });

  it("sorts overdue items ahead of on-time items", () => {
    vi.useFakeTimers();
    vi.setSystemTime(PINNED_TODAY);
    const items = buildBoardItems([setPackage], [...setPackage.submittals, unlinkedSubmittal]);
    expect(items[0].due.overdue).toBe(true); // the overdue unlinked sub sorts first
  });
});

describe("working-day due display (submittal_workday_dues)", () => {
  // No injectable `today` in dueInfoFor here (it reads the clock), so pin the
  // machine clock to a known Monday to make the working-day span deterministic.
  it("counts a submittal-governed due in WORKING days when useWorkdays is on", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00")); // Monday
    const pkgMon: any = {
      key: "k",
      name: "WD set",
      parent: { id: "s", discipline: "S" },
      sheets: [],
      submittals: [
        { id: "wd", submittal_number: "X", status: "Submitted", ball_in_court: "EOR", required_date: "2026-07-13" },
      ],
    };
    const calendar = buildBoardItems([pkgMon], [], false);
    const workday = buildBoardItems([pkgMon], [], true);
    // Mon Jul 6 → Mon Jul 13 = 7 calendar days, 5 working days.
    expect(calendar[0].due.days).toBe(7);
    expect(workday[0].due.days).toBe(5);
  });

  it("keeps a sheet-only (drawing) due calendar-day even when useWorkdays is on", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00")); // Monday
    const pkgSheetOnly: any = {
      key: "k2",
      name: "Sheet-only set",
      parent: { id: "s2", discipline: "S" },
      // No governing submittal → due comes from the sheet date, must stay calendar-day.
      sheets: [{ id: "d", drawing_set_id: "s2", stage: "IFA", due_date: "2026-07-13" }],
      submittals: [],
    };
    const workday = buildBoardItems([pkgSheetOnly], [], true);
    expect(workday[0].due.days).toBe(7); // calendar, NOT the 5-working-day count
  });
});

describe("filterItems", () => {
  const items = buildBoardItems([setPackage], [...setPackage.submittals, unlinkedSubmittal]);

  it("returns everything for 'all' with no search", () => {
    expect(filterItems(items, "all", "")).toHaveLength(items.length);
  });

  it("filters to overdue only", () => {
    const overdue = filterItems(items, "overdue", "");
    expect(overdue.every((i) => i.due.overdue)).toBe(true);
    expect(overdue.length).toBeGreaterThan(0);
  });

  it("filters to unlinked only", () => {
    const unlinked = filterItems(items, "unlinked", "");
    expect(unlinked.every((i) => !i.linked)).toBe(true);
  });

  it("matches search across title / owner / number", () => {
    expect(filterItems(items, "all", "embed").some((i) => i.title.includes("Embed"))).toBe(true);
    expect(filterItems(items, "all", "05-1000").length).toBe(1);
    expect(filterItems(items, "all", "detailer").some((i) => i.owner === "Detailer")).toBe(true);
  });
});

describe("bucketByStage", () => {
  it("groups items into their stage columns, unknown stages → Not Started", () => {
    const items = buildBoardItems([setPackage], [...setPackage.submittals, unlinkedSubmittal]);
    const buckets = bucketByStage(items, STAGE_ORDER);
    // Every stage key exists.
    for (const stage of STAGE_ORDER) expect(buckets[stage]).toBeDefined();
    // The linked package derived to OFA.
    expect(buckets.OFA.some((i) => i.id === "set-id:set-1")).toBe(true);
  });
});

describe("summarizeBoard", () => {
  it("counts totals / overdue / needsAction / unlinked over the unfiltered list", () => {
    const items = buildBoardItems([setPackage], [...setPackage.submittals, unlinkedSubmittal]);
    const summary = summarizeBoard(items);
    expect(summary.total).toBe(2);
    expect(summary.unlinked).toBe(1);
    expect(summary.needsAction).toBe(1);
    expect(summary.overdue).toBeGreaterThanOrEqual(1);
  });
});
