import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

describe("SteelBuild brand tokens", () => {
  it("defines the approved orange brand contract", () => {
    expect(css).toContain("--brand-orange:              #FF5A1F");
    expect(css).toContain("--accent:                   var(--brand-orange)");
  });

  it("keeps semantic success/error colors separate from the brand accent", () => {
    expect(css).toContain("--status-success:");
    expect(css).toContain("--status-error:");
    expect(css).not.toContain("--status-error:             #FF5A1F");
  });

  it("contains explicit dark and light theme surface contracts", () => {
    expect(css).toContain("[data-theme=\"dark\"]");
    expect(css).toContain("[data-theme=\"light\"]");
    expect(css).toContain("#0C0F12");
    expect(css).toContain("#F2F4F5");
  });
});
