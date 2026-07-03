import { describe, expect, it, afterEach } from "vitest";
import {
  compareRfisByNumber, extractRfiSequence,
  loadDensity, loadInsightsCollapsed, buildRfiCounts, filterAndSortRfis, buildProjectNameMap,
} from "../utils";

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
    });
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
