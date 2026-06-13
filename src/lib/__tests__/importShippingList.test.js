import { describe, it, expect } from "vitest";
import { parseShippingList, parseShipDate, parseWeight, classifyLoads } from "../importShippingList";

// Build a 22-wide row with values at the given column indices (mirrors the real
// FabSuite Master Shipping List layout, including the merged "Quantity" offset).
const R = (pairs) => {
  const a = Array(22).fill("");
  for (const [i, v] of pairs) a[i] = v;
  return a;
};
const LOAD_HDR = R([[0, "Job #"], [4, "Load #"], [7, "Trailer #"], [9, "Carrier"], [14, "Qty"], [16, "Weight"], [17, "Ship Date"], [19, "TBR"], [21, "Ready Date"]]);
const PIECE_HDR = R([[1, "Quantity"], [4, "Mark"], [8, "Sequence"], [10, "Dimensions"], [15, "Length"], [18, "Grade"], [21, "Finish"]]);

const ROWS = [
  R([[1, "Master Shipping List w/ Pieces"]]),
  R([[0, "Destination: AZZ Galvanizing"]]),
  LOAD_HDR, PIECE_HDR,
  R([[0, "25372"], [4, "8"], [14, "5"], [16, "697#"], [17, "10/6/2025"], [19, "No"], [21, "10/13/2025"]]),
  R([[2, "5"], [4, "105EM104"], [8, "1"], [10, "L 4 x 4 x 1/4"], [15, "20'-0"], [18, "A36"], [21, "G"]]),
  R([[0, "Total shipped to AZZ Galvanizing:"], [12, "5"], [16, "697#"]]),
  R([[0, "Destination: Jobsite"]]),
  LOAD_HDR, PIECE_HDR,
  R([[0, "25372"], [4, "1"], [7, "FB25"], [9, "S&H Steel"], [14, "24"], [16, "3,454#"], [17, "10/14/2025"]]),
  R([[2, "3"], [4, "105C101"], [8, "1"], [10, "HSS 5 x 5 x 1/4"], [15, "10'-9 3/4"], [18, "A500-C"], [21, "P"]]),
  R([[2, "6"], [4, "105EM101"], [8, "1"], [10, "PL 1/4 x 12"], [15, "1'-2"], [18, "A36"], [21, "NP"]]),
  R([[16, "Page 2 of 14"]]),
  R([[0, "Destination: Jobsite - Continued"]]),
  LOAD_HDR, PIECE_HDR,
  R([[0, "25372"], [4, "2"], [14, "13"], [16, "165#"], [17, "10/14/2025"]]),
  R([[2, "7"], [4, "105TP101"], [8, "1"], [10, "PL 12ga x 13"], [15, "1'-1"], [18, "A36"], [21, "NP"]]),
];

describe("parseShipDate / parseWeight", () => {
  it("parses M/D/YYYY + ISO; rejects junk", () => {
    expect(parseShipDate("10/6/2025")).toBe("2025-10-06");
    expect(parseShipDate("2025-10-06")).toBe("2025-10-06");
    expect(parseShipDate("")).toBeNull();
  });
  it("strips # and commas from weight", () => {
    expect(parseWeight("3,454#")).toBe(3454);
    expect(parseWeight("697#")).toBe(697);
    expect(parseWeight("")).toBeNull();
  });
});

describe("parseShippingList", () => {
  const r = parseShippingList(ROWS);

  it("extracts loads grouped by destination, skipping banners/totals/headers", () => {
    expect(r.ok).toBe(true);
    expect(r.stats.loads).toBe(3);
    expect(r.stats.pieces).toBe(4);
    expect([...new Set(r.loads.map((l) => l.destination))]).toEqual(["AZZ Galvanizing", "Jobsite"]);
  });

  it("maps the load header (number, carrier, trailer, qty, weight, ship + ready dates)", () => {
    const l8 = r.loads.find((l) => l.load_number === "8");
    expect(l8).toMatchObject({
      job_number: "25372", destination: "AZZ Galvanizing", total_qty: 5,
      total_weight_lbs: 697, ship_date: "2025-10-06", ready_date: "2025-10-13", tbr: "No",
    });
    const l1 = r.loads.find((l) => l.load_number === "1");
    expect(l1).toMatchObject({ destination: "Jobsite", carrier: "S&H Steel", trailer: "FB25", total_qty: 24, total_weight_lbs: 3454, ready_date: null });
  });

  it("reads piece rows (qty at the merged offset, mark, dimensions, grade, finish)", () => {
    const l8 = r.loads.find((l) => l.load_number === "8");
    expect(l8.pieces).toHaveLength(1);
    expect(l8.pieces[0]).toEqual({ mark: "105EM104", quantity: 5, sequence: "1", dimensions: "L 4 x 4 x 1/4", length: "20'-0", grade: "A36", finish: "G" });
    expect(r.loads.find((l) => l.load_number === "1").pieces).toHaveLength(2);
  });

  it("normalizes 'Continued' destinations and keeps later loads", () => {
    const l2 = r.loads.find((l) => l.load_number === "2");
    expect(l2.destination).toBe("Jobsite");
    expect(l2.pieces).toHaveLength(1);
  });

  it("rejects a non-shipping sheet (no Mark column)", () => {
    expect(parseShippingList([["Foo", "Bar"], [1, 2]]).ok).toBe(false);
  });
});

describe("classifyLoads", () => {
  it("skips loads already imported (matched by load# + ship date)", () => {
    const { loads } = parseShippingList(ROWS);
    const { rows, stats } = classifyLoads(loads, [
      { id: "d1", load_number: "8", actual_date: "2025-10-06", is_deleted: false },
    ]);
    expect(stats).toEqual({ create: 2, exists: 1 });
    expect(rows.find((l) => l.load_number === "8")).toMatchObject({ action: "exists", existing_id: "d1" });
    expect(rows.find((l) => l.load_number === "1").action).toBe("create");
  });

  it("ignores soft-deleted deliveries", () => {
    const { loads } = parseShippingList(ROWS);
    const { stats } = classifyLoads(loads, [{ id: "d1", load_number: "8", actual_date: "2025-10-06", is_deleted: true }]);
    expect(stats.exists).toBe(0);
  });
});
