/**
 * palette — the one place a board colour name becomes a CSS value.
 *
 * Boards persist colour as a semantic name ("danger"), never a hex. This module
 * resolves those names to the `--cmd-*` custom properties the command skin
 * defines, so a board drawn in light mode reads correctly in SteelBuild Dark
 * without rewriting a single stored record.
 *
 * Components must call these helpers rather than inlining `var(--cmd-…)`: it
 * keeps the set of colours a board can use closed, which is what lets the
 * palette be re-themed later without auditing every canvas component.
 */

import type { BoardColor } from "./types";

/** Stroke / text colour for a board colour. */
export function boardStroke(color: BoardColor): string {
  switch (color) {
    case "gold":
      return "var(--cmd-gold)";
    case "good":
      return "var(--cmd-good)";
    case "warn":
      return "var(--cmd-warn)";
    case "danger":
      return "var(--cmd-danger)";
    case "info":
      return "var(--cmd-info)";
    case "review":
      return "var(--cmd-review)";
    case "neutral":
    default:
      return "var(--cmd-text-muted)";
  }
}

/**
 * Card fill for a board colour.
 *
 * The chip washes, not the vivid hues — a wall of saturated cards is unreadable
 * at board zoom, and the chip backgrounds are the tones the design system
 * already pairs with `--cmd-*-text` at AA contrast.
 */
export function boardFill(color: BoardColor): string {
  switch (color) {
    case "gold":
      return "var(--cmd-icon-wash)";
    case "good":
      return "var(--cmd-chip-good-bg)";
    case "warn":
      return "var(--cmd-chip-warn-bg)";
    case "danger":
      return "var(--cmd-chip-danger-bg)";
    case "info":
      return "var(--cmd-chip-info-bg)";
    case "review":
      return "var(--cmd-chip-bg)";
    case "neutral":
    default:
      return "var(--cmd-surface)";
  }
}

/** Text colour that meets contrast on {@link boardFill} of the same colour. */
export function boardText(color: BoardColor): string {
  switch (color) {
    case "good":
      return "var(--cmd-good-text)";
    case "warn":
      return "var(--cmd-warn-text)";
    case "danger":
      return "var(--cmd-danger-text)";
    case "info":
      return "var(--cmd-info-text)";
    case "review":
      return "var(--cmd-review-text)";
    case "gold":
    case "neutral":
    default:
      return "var(--cmd-text)";
  }
}
