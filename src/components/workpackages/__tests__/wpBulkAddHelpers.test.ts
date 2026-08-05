import { describe, expect, it } from "vitest";
import {
  parseBlock,
  buildExistingWpNumberSet,
  flagDuplicateWpRows,
} from "../wpBulkAddHelpers";

describe("parseBlock", () => {
  it("parses TSV with header", () => {
    const raw = `WP #\tName\tPhase\tStatus\tTonnage
WP-001\tMain Steel\tFabrication\tNot Started\t42.5
WP-002\tMisc\tDetailing\tIn Progress\t10`;
    const { rows, headerDetected } = parseBlock(raw);
    expect(headerDetected).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("Main Steel");
    expect(rows[0].phase).toBe("Fabrication");
    expect(rows[0].tonnage).toBe(42.5);
  });

  it("returns empty for blank input", () => {
    expect(parseBlock("").rows).toEqual([]);
  });

  it("flags missing name as error", () => {
    const { rows } = parseBlock(`WP #\tName\tPhase
WP-1\t\tDetailing`);
    expect(rows[0].errors.name).toBe("Required");
  });
});

describe("flagDuplicateWpRows", () => {
  it("marks existing numbers", () => {
    const set = buildExistingWpNumberSet([{ wp_number: "WP-001" }]);
    const flagged = flagDuplicateWpRows(
      [{ wp_number: "WP-001", name: "A" }, { wp_number: "WP-002", name: "B" }],
      set,
    );
    expect(flagged[0].isDuplicate).toBeTruthy();
    expect(flagged[1].isDuplicate).toBeFalsy();
  });
});
