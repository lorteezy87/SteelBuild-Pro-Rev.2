/**
 * Board Report theme — the Document Control design system's own palette.
 *
 * WHY HEX LIVES HERE AND NOT IN COMPONENTS
 * CLAUDE.md's rule is "colors: CSS variables only, never hardcode surface /
 * text / border hex in components". This file is the same exemption the public
 * Landing page takes, and for the same reason: the Board Report is a fixed,
 * self-contained visual system handed over at high fidelity, with exact oklch
 * values that carry meaning (a status badge's hue IS the status). Routing it
 * through `--bg-*` / `--text-*` would either repaint the app or silently drift
 * the design. The rule's intent — no loose hex scattered through JSX — is kept:
 * every value is named once, here, and components only ever read a token.
 *
 * The one thing that is NOT a token is the company name in the masthead. The
 * design comps show a literal; see BoardReportMasthead for why it is read from
 * the signed-in organization instead.
 */

/** Light surfaces, text and lines — the default Board Report skin. */
export const DC_LIGHT = {
  pageBg: "#FAFAF8",
  text: "#17191C",
  textSecondary: "#45494D",
  textMuted: "#6B6F73",
  textFaint: "#8A8D90",
  rankNumber: "#9A9DA0",

  paneBg: "#FFFFFF",
  paneBorder: "#DEDCD6",
  rowBorder: "#E8E6E0",
  rowHover: "#F1EFEA",
  rowSelectedBg: "#FFFFFF",
  headerRule: "#17191C",

  track: "#ECEAE5",
  hairline: "#EFEDE8",
  wellBg: "#F4F3EF",
  wellBorder: "#E2E0DA",
  controlBorder: "#CFCCC5",
  badgeNeutralBg: "#ECEAE5",
  badgeNeutralFg: "#55595D",
  badgeNeutralBorder: "#DEDBD4",
  dashed: "#CFCCC5",
  dashedFg: "#A3A6A9",

  chipActiveBg: "#17191C",
  chipActiveFg: "#FAFAF8",
  chipIdleBg: "#FFFFFF",
  chipIdleFg: "#45494D",
  chipIdleBorder: "#DEDCD6",

  btnPrimaryBg: "#17191C",
  btnPrimaryFg: "#FAFAF8",
  btnSecondaryBorder: "#CFCCC5",
} as const;

/** Dark surfaces — screen 2e. Same system, different skin. */
export const DC_DARK = {
  pageBg: "#0C0F12",
  text: "#F2F4F5",
  textSecondary: "#A7B0B8",
  textMuted: "#7D8892",
  textFaint: "#7D8892",
  rankNumber: "#5B656E",

  paneBg: "#141A1F",
  paneBorder: "#222A31",
  rowBorder: "#1C2329",
  rowHover: "#151D23",
  rowSelectedBg: "#182027",
  headerRule: "#303942",

  track: "#222A31",
  hairline: "#1C2329",
  wellBg: "#141A1F",
  wellBorder: "#222A31",
  controlBorder: "#303942",
  badgeNeutralBg: "#222A31",
  badgeNeutralFg: "#A7B0B8",
  badgeNeutralBorder: "#303942",
  dashed: "#303942",
  dashedFg: "#7D8892",

  chipActiveBg: "#F2F4F5",
  chipActiveFg: "#0C0F12",
  chipIdleBg: "#141A1F",
  chipIdleFg: "#A7B0B8",
  chipIdleBorder: "#303942",

  btnPrimaryBg: "#FF5A1F",
  btnPrimaryFg: "#111417",
  btnSecondaryBorder: "#303942",
} as const;

/** The shape both skins share. Keyed off DC_LIGHT so a new token must be added to both. */
export type DcSkin = Record<keyof typeof DC_LIGHT, string>;

/** The masthead is the same dark band in both skins — it is the brand bar. */
export const DC_MASTHEAD = {
  bg: "#141618",
  fg: "#F2F4F5",
  muted: "#A7B0B8",
  mono: "#7D8892",
  divider: "#46515B",
  border: "#303942",
} as const;

/**
 * Signal colors. These are the design's own oklch values — a status badge's
 * hue is the status, so they are not interchangeable with the app's
 * semantic status tokens.
 */
export const DC_SIGNAL = {
  accent: "#FF5A1F",
  accentLight: "#FF7442",
  onAccent: "#111417",
  green: "oklch(0.62 0.13 150)",
  blue: "oklch(0.62 0.11 245)",
  amber: "oklch(0.76 0.14 75)",
  red: "oklch(0.6 0.18 28)",
  redText: "oklch(0.5 0.18 28)",
  metricLate: "oklch(0.72 0.16 28)",
  metricRr: "oklch(0.82 0.13 80)",
} as const;

export const DC_FONT = {
  /**
   * Archivo carries a width axis (62–125) and the design leans on it —
   * font-stretch 80% on metric numbers, 85% on the wordmark, 92% on the
   * sentence. No face already in the app has that axis, so substituting one
   * would not be the same design. Registered in index.html.
   */
  ui: "'Archivo', system-ui, -apple-system, sans-serif",
  /** Already in the app's stack. Every document number, date and count. */
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
} as const;
