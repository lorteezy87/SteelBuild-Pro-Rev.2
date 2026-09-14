import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("dark theme Tailwind remaps", () => {
  const compat = readFileSync(
    fileURLToPath(new URL("../tailwind-compat.css", import.meta.url)),
    "utf8",
  );

  it("remaps light pastel fills and slate-950 text used by Piece Control", () => {
    expect(compat).toContain(".bg-amber-50");
    expect(compat).toContain(".bg-rose-50");
    expect(compat).toContain(".bg-emerald-50");
    expect(compat).toContain(".text-slate-950");
    expect(compat).toContain(".border-slate-300");
    expect(compat).toContain("var(--warning-muted)");
    expect(compat).toContain("var(--danger-muted)");
    expect(compat).toContain("var(--success-muted)");
  });
});

describe("CanonicalFabReleasePanel theme tokens", () => {
  it("does not hardcode light Tailwind surfaces", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../components/pieceControl/CanonicalFabReleasePanel.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/\bbg-white\b/);
    expect(source).not.toMatch(/\bbg-amber-50\b/);
    expect(source).not.toMatch(/\bbg-rose-50\b/);
    expect(source).not.toMatch(/\btext-slate-950\b/);
    expect(source).toContain("var(--cmd-surface");
    expect(source).toContain("var(--cmd-border");
  });
});

describe("Piece Register archive dialog theme tokens", () => {
  it("uses command/app tokens instead of light Tailwind dialog chrome", () => {
    // Dialog lives in PieceRegisterArchiveDialog (extracted from the page).
    const source = readFileSync(
      fileURLToPath(
        new URL("../../pages/pieceRegister/PieceRegisterArchiveDialog.tsx", import.meta.url),
      ),
      "utf8",
    );
    expect(source).toContain('id="archive-piece-title"');
    expect(source).not.toMatch(/archive-piece-title[\s\S]{0,200}bg-white/);
    expect(source).toContain("var(--cmd-surface, var(--bg-surface))");
    expect(source).toContain("var(--cmd-danger, var(--status-error))");
    // Page still mounts the extracted dialog.
    const page = readFileSync(
      fileURLToPath(new URL("../../pages/PieceRegister.tsx", import.meta.url)),
      "utf8",
    );
    expect(page).toContain("PieceRegisterArchiveDialog");
  });
});
