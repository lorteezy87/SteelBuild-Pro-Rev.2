import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const baseCss = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");
const brandCss = readFileSync(resolve(process.cwd(), "src/styles/brand-theme.css"), "utf8");
const globalsCss = readFileSync(resolve(process.cwd(), "src/globals.css"), "utf8");

describe("SteelBuild brand tokens", () => {
  it("defines the approved orange brand contract in the final theme layer", () => {
    expect(brandCss).toContain("--brand-orange:              #FF5A1F");
    expect(brandCss).toContain("--accent:                   var(--brand-orange)");
    expect(globalsCss).toContain("@import './styles/brand-theme.css';");
  });

  it("keeps semantic success/error colors separate from the brand accent", () => {
    expect(baseCss).toContain("--status-success:");
    expect(baseCss).toContain("--status-error:");
    expect(brandCss).not.toContain("--status-error:             #FF5A1F");
  });

  it("contains explicit dark and light theme surface contracts", () => {
    expect(brandCss).toContain("[data-theme=\"dark\"]");
    expect(brandCss).toContain("[data-theme=\"light\"]");
    expect(brandCss).toContain("#0C0F12");
    expect(brandCss).toContain("#F2F4F5");
  });
});
