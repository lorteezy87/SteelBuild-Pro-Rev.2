import { describe, it, expect } from "vitest";
import {
  parseCsvToAoa,
  aoaToRows,
  canonicalizeHeader,
  suggestCostCode,
  buildSovStaged,
} from "../importSovSpreadsheet";

// The 14 default steel cost codes seeded into every project (migration 086).
const COST_CODES = [
  { cost_code_number: "01", description: "Detailing" },
  { cost_code_number: "02", description: "Anchor Bolts/Embeds" },
  { cost_code_number: "03", description: "Joist" },
  { cost_code_number: "04", description: "Deck" },
  { cost_code_number: "05", description: "Raw Material" },
  { cost_code_number: "06", description: "Shop Labor and Fabrication" },
  { cost_code_number: "07", description: "Field Labor - Structural" },
  { cost_code_number: "08", description: "Field Labor - Misc." },
  { cost_code_number: "09", description: "Equipment" },
  { cost_code_number: "10", description: "Shipping" },
  { cost_code_number: "11", description: "Deck Install" },
  { cost_code_number: "12", description: "Special Coatings" },
  { cost_code_number: "13", description: "Misc." },
  { cost_code_number: "14", description: "PM/Admin" },
];
const BOM = String.fromCharCode(0xfeff);

describe("parseCsvToAoa", () => {
  it("parses simple rows", () => {
    expect(parseCsvToAoa("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("handles quoted fields with embedded commas and escaped quotes", () => {
    const csv = 'description,scheduled_value\n"Steel, fabricated",1000\n"He said ""hi""",5';
    expect(parseCsvToAoa(csv)).toEqual([
      ["description", "scheduled_value"],
      ["Steel, fabricated", "1000"],
      ['He said "hi"', "5"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsvToAoa("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("strips a leading UTF-8 BOM so the first header is clean", () => {
    const aoa = parseCsvToAoa(`${BOM}line_item_number,description\n1,Mobilization`);
    expect(aoa[0][0]).toBe("line_item_number");
  });
});

describe("canonicalizeHeader / aoaToRows", () => {
  it("canonicalizes aliased headers", () => {
    expect(canonicalizeHeader("Scheduled Value")).toBe("scheduled_value");
    expect(canonicalizeHeader("Line #")).toBe("line_item_number");
    expect(canonicalizeHeader("% Complete")).toBe("current_percent_complete");
    expect(canonicalizeHeader("Cost Code")).toBe("cost_code");
  });

  it("builds canonical row objects and drops blank rows", () => {
    const aoa = [
      ["Line #", "Description", "Value"],
      ["1", "Mobilization", "25000"],
      ["", "", ""],
    ];
    expect(aoaToRows(aoa)).toEqual([
      { line_item_number: "1", description: "Mobilization", scheduled_value: "25000" },
    ]);
  });
});

describe("suggestCostCode", () => {
  const cases = [
    ["Structural Steel - Fabrication", "06"],
    ["Structural Steel - Erection", "07"],
    ["Detailing - Bldg. 1", "01"],
    ["Anchor Bolts & Embeds", "02"],
    ["Bar Joist supply", "03"],
    ["Metal Deck Install", "11"],
    ["Metal Deck", "04"],
    ["Galvanizing / Special Coatings", "12"],
    ["Raw Material - wide flange", "05"],
    ["Crane & Equipment rental", "09"],
    ["Shipping & Freight", "10"],
    ["Mobilization", "14"],
  ];
  it.each(cases)("maps %s -> %s", (description, expectedNumber) => {
    expect(suggestCostCode(description, COST_CODES)?.cost_code).toBe(expectedNumber);
  });

  it("returns the matched code's name alongside the number", () => {
    expect(suggestCostCode("Shop fabrication", COST_CODES)).toEqual({
      cost_code: "06",
      cost_code_name: "Shop Labor and Fabrication",
    });
  });

  it("returns null when no keyword matches (so the row surfaces for review)", () => {
    expect(suggestCostCode("Site Preparation", COST_CODES)).toBeNull();
    expect(suggestCostCode("", COST_CODES)).toBeNull();
  });

  it("returns null when the project has no code with the matched name", () => {
    expect(suggestCostCode("Detailing", [{ cost_code_number: "99", description: "Other" }])).toBeNull();
  });
});

describe("buildSovStaged", () => {
  const project = { id: "p1", name: "Skyport" };

  it("maps rows, flags validity, and auto-maps cost codes", () => {
    const rows = [
      { line_item_number: "1", description: "Structural Steel - Fabrication", scheduled_value: "180000" },
      { line_item_number: "2", description: "", scheduled_value: "100" }, // invalid: no description
      { line_item_number: "3", description: "Misc work", scheduled_value: "0" }, // invalid: value 0
    ];
    const staged = buildSovStaged(rows, { project, costCodes: COST_CODES, existingCount: 0 });

    expect(staged[0].valid).toBe(true);
    expect(staged[0].autoMapped).toBe(true);
    expect(staged[0].record.cost_code).toBe("06");
    expect(staged[0].record.cost_code_name).toBe("Shop Labor and Fabrication");
    expect(staged[0].record.project_id).toBe("p1");
    expect(staged[0].record.scheduled_value).toBe(180000);

    expect(staged[1].valid).toBe(false);
    expect(staged[1].reason).toMatch(/description/i);
    expect(staged[2].valid).toBe(false);
    expect(staged[2].reason).toMatch(/value/i);
  });

  it("prefers an explicit cost_code column over auto-mapping and resolves its name", () => {
    const rows = [{ description: "Structural Steel - Fabrication", scheduled_value: "100", cost_code: "13" }];
    const staged = buildSovStaged(rows, { project, costCodes: COST_CODES });
    expect(staged[0].record.cost_code).toBe("13");
    expect(staged[0].record.cost_code_name).toBe("Misc.");
    expect(staged[0].autoMapped).toBe(false);
  });

  it("defaults retainage to 10 when blank and falls back to sequential line numbers", () => {
    const rows = [{ description: "Mobilization", scheduled_value: "100" }];
    const staged = buildSovStaged(rows, { project, costCodes: COST_CODES, existingCount: 4 });
    expect(staged[0].record.retainage_percent).toBe(10);
    expect(staged[0].record.line_item_number).toBe(5);
    expect(staged[0].record.sov_id).toBe("SOV-005");
  });
});
