import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Regression: nested data-skin="command" (Piece Register, Dashboard CC,
 * WorkPackageDetailModal) re-declared light --cmd-* tokens and overrode the
 * dark remap on <html>, leaving whole pages stuck light under SteelBuild Dark.
 */
describe("command dark theme covers nested data-skin", () => {
  const commandCss = readFileSync(
    fileURLToPath(new URL("../command.css", import.meta.url)),
    "utf8",
  );
  const baseCss = readFileSync(
    fileURLToPath(new URL("../base.css", import.meta.url)),
    "utf8",
  );

  it("remaps --cmd-* for descendant [data-skin=command] under steelbuild-dark", () => {
    expect(commandCss).toContain("html.steelbuild-dark [data-skin=\"command\"]");
    expect(commandCss).toContain(".steelbuild-dark [data-skin=\"command\"]");
    expect(commandCss).toContain("[data-theme=\"dark\"] [data-skin=\"command\"]");
    // Solid page canvas — not translucent sbd glass alone
    expect(commandCss).toMatch(/--cmd-bg:\s*var\(--sbd-bg-page/);
    expect(commandCss).toMatch(/--cmd-surface:\s*color-mix/);
  });

  it("styles select options under nested command skins in dark mode", () => {
    expect(baseCss).toContain('html.steelbuild-dark [data-skin="command"] select option');
    expect(baseCss).toContain('[data-theme="dark"] [data-skin="command"] select option');
  });
});

describe("Piece Register still mounts command skin", () => {
  it("keeps useCommandSkin + piece-control-command wrapper", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../pages/PieceRegister.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("useCommandSkin()");
    expect(source).toContain('className="piece-control-command"');
    expect(source).toContain('import "@/styles/command.css"');
    expect(source).toContain('import "@/styles/piece-control-command.css"');
  });
});
