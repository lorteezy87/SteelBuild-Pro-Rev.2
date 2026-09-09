import { describe, expect, it, afterEach, vi } from "vitest";
import {
  compareRfisByNumber, extractRfiSequence,
  loadDensity, loadInsightsCollapsed, buildRfiCounts, filterAndSortRfis, buildProjectNameMap,
  isClosed, isOverdue,
} from "../utils";

function localIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

describe("isClosed / isOverdue", () => {
  afterEach(() => vi.useRealTimers());

  it("treats Answered, Closed and Void as closed (chk_rfis_status terminal set)", () => {
    expect(isClosed({ status: "Answered" })).toBe(true);
    expect(isClosed({ status: "Closed" })).toBe(true);
    expect(isClosed({ status: "Void" })).toBe(true);
    expect(isClosed({ status: "Open" })).toBe(false);
    expect(isClosed({ status: "Under Review" })).toBe(false);
    expect(isClosed({ status: "Incomplete Response" })).toBe(false);
  });

  it("is overdue only when date_required is strictly before local today", () => {
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    expect(isOverdue({ status: "Open", date_required: localIso(yesterday) })).toBe(true);
    expect(isOverdue({ status: "Open", date_required: localIso(now) })).toBe(false);
    expect(isOverdue({ status: "Open", date_required: localIso(tomorrow) })).toBe(false);
    expect(isOverdue({ status: "Open", date_required: null })).toBe(false);
    expect(isOverdue({ status: "Void", date_required: localIso(yesterday) })).toBe(false);
  });

  it("does not flip an RFI due today to overdue in the afternoon (date-only shim parses as local noon)", () => {
    vi.useFakeTimers();
    const afternoon = new Date();
    afternoon.setHours(16, 30, 0, 0);
    vi.setSystemTime(afternoon);
    expect(isOverdue({ status: "Open", date_required: localIso(afternoon) })).toBe(false);
  });
});

describe("RFI numeric ordering", () => {
  it("extracts numbers from app-created, imported, and vendor RFI formats", () => {
    expect(extractRfiSequence("RFI #058")).toBe(58);
    expect(extractRfiSequence("058")).toBe(58);
    expect(extractRfiSequence("RFI-058")).toBe(58);
    expect(extractRfiSequence("RFI 058")).toBe(58);
    expect(extractRfiSequence("No number")).toBeNull();
  });

  it("sorts RFI rows by numeric sequence regardless of formatting", () => {
    const sorted = [
      { id: "058", rfi_number: "058" },
      { id: "059", rfi_number: "059" },
      { id: "057", rfi_number: "057" },
      { id: "056", rfi_number: "056" },
      { id: "055", rfi_number: "055" },
      { id: "053", rfi_number: "053" },
      { id: "054", rfi_number: "054" },
    ].sort(compareRfisByNumber);

    expect(sorted.map((rfi) => rfi.rfi_number)).toEqual(["053", "054", "055", "056", "057", "058", "059"]);
  });

  it("keeps unnumbered RFIs after numbered RFIs with deterministic tie breaks", () => {
    const sorted = [
      { id: "late", rfi_number: "Pending RFI", created_date: "2026-05-02T00:00:00Z" },
      { id: "ten", rfi_number: "RFI #010", created_date: "2026-05-01T00:00:00Z" },
      { id: "one", rfi_number: "RFI-001", created_date: "2026-05-01T00:00:00Z" },
      { id: "early", rfi_number: "", created_date: "2026-05-01T00:00:00Z" },
    ].sort(compareRfisByNumber);

    expect(sorted.map((rfi) => rfi.id)).toEqual(["one", "ten", "early", "late"]);
  });
});

// ─── RFI page derivations (extracted from RFIs.jsx) ─────────────────────────

describe("loadDensity / loadInsightsCollapsed", () => {
  const realLS = globalThis.localStorage;
  afterEach(() => { globalThis.localStorage = realLS; });

  it("loadDensity returns a valid stored preset, else 'normal'", () => {
    globalThis.localStorage = { getItem: () => "compact" };
    expect(loadDensity()).toBe("compact");
    globalThis.localStorage = { getItem: () => "bogus" };
    expect(loadDensity()).toBe("normal");
    globalThis.localStorage = { getItem: () => null };
    expect(loadDensity()).toBe("normal");
  });

  it("loadDensity returns 'normal' when localStorage is unavailable", () => {
    globalThis.localStorage = undefined;
    expect(loadDensity()).toBe("normal");
  });

  it("loadInsightsCollapsed reads the '1' flag", () => {
    globalThis.localStorage = { getItem: () => "1" };
    expect(loadInsightsCollapsed()).toBe(true);
    globalThis.localStorage = { getItem: () => "0" };
    expect(loadInsightsCollapsed()).toBe(false);
    globalThis.localStorage = undefined;
    expect(loadInsightsCollapsed()).toBe(false);
  });
});

describe("buildRfiCounts", () => {
  it("tallies by status, overdue, and critical", () => {
    const rfis = [
      { status: "Open", priority: "Critical" },
      { status: "Under Review" },
      { status: "Incomplete Response" },
      { status: "Answered" },
      { status: "Closed" },
      { status: "Open", date_required: "2020-01-01" }, // past + not closed → overdue
    ];
    const c = buildRfiCounts(rfis);
    expect(c).toEqual({
      all: 6, open: 2, review: 1, incomplete: 1, answered: 1, closed: 1, critical: 1, overdue: 1,
      // Void gained a bucket, and liveOpen/liveClosed roll the per-status
      // counts up to the open-vs-closed split the register groups on.
      void: 0, liveOpen: 4, liveClosed: 2,
    });
  });

  it("keeps the per-status buckets reconciling against the total", () => {
    const rfis = [
      { status: "Open" },
      { status: "Under Review" },
      { status: "Incomplete Response" },
      { status: "Answered" },
      { status: "Closed" },
      { status: "Void" },
    ];
    const c = buildRfiCounts(rfis);
    expect(c.open + c.review + c.incomplete + c.answered + c.closed + c.void).toBe(c.all);
    expect(c.liveOpen + c.liveClosed).toBe(c.all);
  });
});

describe("filterAndSortRfis", () => {
  const matchAll = () => true;
  const rfis = [
    { id: "1", rfi_number: "RFI-002", status: "Open", discipline: "Structural", title: "Beam", priority: "High" },
    { id: "2", rfi_number: "RFI-001", status: "Closed", discipline: "Connections", title: "Weld", priority: "Critical" },
    { id: "3", rfi_number: "RFI-003", status: "Open", discipline: "Structural", title: "Column", priority: "Low", date_required: "2020-01-01" },
  ];
  const base = { filter: "all", disciplineFilter: "All", seqFilter: null, search: "" };

  it("returns all rows sorted by RFI number when no filters", () => {
    expect(filterAndSortRfis(rfis, base, matchAll).map((r) => r.rfi_number)).toEqual(["RFI-001", "RFI-002", "RFI-003"]);
  });
  it("filters by status and by overdue", () => {
    expect(filterAndSortRfis(rfis, { ...base, filter: "open" }, matchAll).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterAndSortRfis(rfis, { ...base, filter: "overdue" }, matchAll).map((r) => r.id)).toEqual(["3"]);
  });
  it("filters by discipline (case/space-insensitive)", () => {
    expect(filterAndSortRfis(rfis, { ...base, disciplineFilter: "structural" }, matchAll).map((r) => r.id)).toEqual(["1", "3"]);
  });
  it("filters by free-text search across number/title", () => {
    expect(filterAndSortRfis(rfis, { ...base, search: "weld" }, matchAll).map((r) => r.id)).toEqual(["2"]);
  });
  it("applies the injected sequence predicate", () => {
    expect(filterAndSortRfis(rfis, base, (r) => r.id === "3").map((r) => r.id)).toEqual(["3"]);
  });
});

describe("buildProjectNameMap", () => {
  it("maps id → name, blank when missing", () => {
    expect(buildProjectNameMap([{ id: "a", name: "Alpha" }, { id: "b" }])).toEqual({ a: "Alpha", b: "" });
  });
});
