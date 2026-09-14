/**
 * The 3D viewer's HUD must stay legible on its canvas.
 *
 * Field report: hovering a piece showed the piece mark, but it was unreadable.
 * Cause: `scene.background` is hard-set to #0d1117 in BOTH app themes, while the
 * overlays drawn on top took their colour from `--text-*`, which flips with the
 * theme. In light mode the hover tip rendered #020617 (slate-950) on that
 * near-black canvas — 1.07:1, i.e. invisible exactly when a detailer hovered a
 * piece to read its mark. The same applied to the status line, the Fit-view
 * button, and both role="alert" overlays.
 *
 * These tests pin the two halves of the rule: the palette is legible, and the
 * component does not reach for theme tokens on this single-theme surface.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VIEWER_CANVAS_BG, VIEWER_HUD } from "../IfcModelViewer";

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const parts = hex.replace("#", "").match(/../g);
  if (!parts) throw new Error(`bad hex: ${hex}`);
  const [r, g, b] = parts
    .map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../IfcModelViewer.jsx"),
  "utf8",
);

describe("3D viewer HUD legibility", () => {
  it("renders the hover piece mark at full readability on the canvas", () => {
    // The reported bug, as a number: this was 1.07:1.
    expect(contrast(VIEWER_HUD.text, VIEWER_CANVAS_BG)).toBeGreaterThan(12);
  });

  it("keeps every HUD foreground above the WCAG AA 4.5:1 body-text floor", () => {
    for (const key of ["text", "textDim", "textFaint"] as const) {
      expect(contrast(VIEWER_HUD[key], VIEWER_CANVAS_BG), key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("orders the palette from strongest to faintest", () => {
    const c = (k: "text" | "textDim" | "textFaint") => contrast(VIEWER_HUD[k], VIEWER_CANVAS_BG);
    expect(c("text")).toBeGreaterThan(c("textDim"));
    expect(c("textDim")).toBeGreaterThan(c("textFaint"));
  });

  it("never takes a foreground colour from a theme token", () => {
    // The canvas does NOT follow the app theme, so --text-* / --border-* are
    // guaranteed to disagree with it in one theme or the other. Fonts
    // (--font-mono) are fine: they carry no colour.
    const offenders = source
      .split(/\r?\n/)
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /var\(--(?:text|border|bg|cmd|sbd)-/.test(line));
    expect(offenders.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });

  it("derives the HUD palette from the same canvas colour the scene paints", () => {
    // Guards a copy-paste drift where the scene changes but the palette doesn't.
    expect(source).toMatch(/scene\.background = new THREE\.Color\(VIEWER_CANVAS_BG\)/);
    expect(VIEWER_HUD.canvas).toBe(VIEWER_CANVAS_BG);
  });
});
