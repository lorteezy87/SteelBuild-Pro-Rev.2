import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Piece Register command theme", () => {
  it("uses the command skin and Piece Control scoped stylesheet", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../PieceRegister.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain('import "@/styles/command.css"');
    expect(source).toContain('import "@/styles/piece-control-command.css"');
    expect(source).toContain("useCommandSkin()");
    expect(source).toContain('className="piece-control-command"');
    expect(source).not.toContain("min-h-screen bg-[radial-gradient");
  });

  it("keeps Piece Control pill spacing scoped to Piece Control surfaces", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../../styles/piece-control-command.css", import.meta.url),
      ),
      "utf8",
    );

    expect(source).not.toMatch(/\[data-skin="command"\]\s+\.cmd-pill\s*\{/);
    expect(source).toContain(".piece-import-workspace .cmd-pill");
    expect(source).toContain(".piece-relationships .cmd-pill");
  });

  it("keeps Dashboard, rollout, table, and responsive styles in the Piece Control skin", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../../styles/piece-control-command.css", import.meta.url),
      ),
      "utf8",
    );

    expect(source).toContain(
      '[data-skin="command"] .piece-dashboard-panel',
    );
    expect(source).toContain(
      '[data-skin="command"] .piece-rollout-confirmation',
    );
    expect(source).toMatch(
      /\.piece-register-table__wrap\s*\{[^}]*overflow-x:\s*auto/s,
    );
    expect(source).toContain("@media (max-width: 1100px)");
    expect(source).toContain("@media (max-width: 680px)");
  });

  it("keeps the Overview shipment CTA compact", () => {
    const pageSource = readFileSync(
      fileURLToPath(new URL("../../PieceRegister.tsx", import.meta.url)),
      "utf8",
    );
    const styleSource = readFileSync(
      fileURLToPath(
        new URL("../../../styles/piece-control-command.css", import.meta.url),
      ),
      "utf8",
    );

    expect(pageSource).toContain(
      'className="piece-command-empty piece-register-overview__empty-action"',
    );
    expect(styleSource).toMatch(
      /\.piece-register-overview__empty-action\s*\{[^}]*display:\s*flex[^}]*padding:\s*12px/s,
    );
    const compactRule = styleSource.match(
      /\.piece-register-overview__empty-action\s*\{([^}]*)\}/s,
    )?.[1];
    expect(compactRule).not.toContain("min-height");
  });
});
