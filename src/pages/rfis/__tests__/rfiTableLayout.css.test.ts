import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ratchet: the register column ribbon must stay in normal document flow.
 * A sticky header at a fixed top offset previously painted over the first RFI.
 */
describe("RFI table layout CSS", () => {
  const css = readFileSync(
    resolve(process.cwd(), "src/pages/rfis/RFIs.css"),
    "utf8",
  );

  it("forces the column header out of sticky/absolute stacking", () => {
    const headerBlock = css.match(/\.rfi-table-header\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(headerBlock).toMatch(/position:\s*static\s*!important/);
    expect(headerBlock).not.toMatch(/position:\s*sticky/);
    expect(headerBlock).not.toMatch(/top:\s*\d+px/);
  });

  it("does not sticky-pin the filter wrapper over the register", () => {
    const pinBlock = css.match(/\.rfi-register-pin\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(pinBlock).toMatch(/position:\s*static\s*!important/);
    expect(pinBlock).not.toMatch(/position:\s*sticky/);
  });
});
