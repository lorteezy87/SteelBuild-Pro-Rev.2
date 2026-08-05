import { describe, expect, it } from "vitest";
import { COST_CODE_RULES } from "@/lib/importSovSpreadsheet";
import { SENSITIVE_KEYS } from "@/lib/telemetry";
import {
  SECTION_MARKERS,
  MAX_PSR_FILE_BYTES,
  PSR_HISTORY_LIMIT,
} from "@/lib/importPsrSpreadsheet";
import { STOPWORDS } from "@/lib/rfiDedup";
import { PART_TYPES } from "@/lib/ifc/extractIfcRoster";
import { NOISE_TOKENS } from "@/lib/pieceControl/wpAutoAssign";
import { TYPE_TO_ENTITY } from "@/lib/drawingHub/links";
import { LOWER_LOOKUP } from "@/lib/reviewerColors";
import { CLASSIFIERS } from "@/lib/wbsBuilder";

describe("residual catalog atoms batch AI", () => {
  it("cost code rules and telemetry sensitive keys", () => {
    expect(Array.isArray(COST_CODE_RULES)).toBe(true);
    expect(COST_CODE_RULES.length).toBeGreaterThan(5);
    expect(COST_CODE_RULES[0][1]).toBe("Detailing");
    expect(SENSITIVE_KEYS.has("password")).toBe(true);
    expect(SENSITIVE_KEYS.has("amount")).toBe(true);
  });

  it("PSR markers, RFI stopwords, IFC part types", () => {
    expect(SECTION_MARKERS).toContain("DESIGN REVISION");
    expect(MAX_PSR_FILE_BYTES).toBeGreaterThan(0);
    expect(PSR_HISTORY_LIMIT).toBe(10);
    expect(STOPWORDS.has("please")).toBe(true);
    expect(STOPWORDS.has("rfi")).toBe(true);
    expect(PART_TYPES).toContain("IFCBEAM");
  });

  it("piece noise tokens, link type map, reviewer lookup, WBS classifiers", () => {
    expect(NOISE_TOKENS.has("ifc")).toBe(true);
    expect(TYPE_TO_ENTITY.rfi.table).toBe("rfis");
    expect(TYPE_TO_ENTITY.drawing.table).toBe("drawings");
    expect(typeof LOWER_LOOKUP).toBe("object");
    expect(Array.isArray(CLASSIFIERS)).toBe(true);
    expect(CLASSIFIERS.length).toBeGreaterThan(0);
    expect(CLASSIFIERS[0]).toHaveProperty("type");
  });
});
