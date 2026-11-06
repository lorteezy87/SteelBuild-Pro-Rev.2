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

/** Light surfaces, text and lines — the default "Blueline" vellum skin. */
export const DC_LIGHT = {
  pageBg: "#F7F6F2",
  text: "#141B22",
  textSecondary: "#3B4652",
  textMuted: "#5F6974",
  textFaint: "#848C95",
  rankNumber: "#959CA4",

  paneBg: "#FFFFFF",
  paneBorder: "#DFDBD3",
  rowBorder: "#E9E6E0",
  rowHover: "#F3F1EC",
  rowSelectedBg: "#FFFFFF",
  headerRule: "#141B22",

  track: "#EFEDE7",
  hairline: "#EFEDE7",
  wellBg: "#F3F1EC",
  wellBorder: "#E3DFD8",
  controlBorder: "#CBC6BC",
  badgeNeutralBg: "#EFEDE7",
  badgeNeutralFg: "#4E5965",
  badgeNeutralBorder: "#DFDBD3",
  dashed: "#CBC6BC",
  dashedFg: "#959CA4",

  chipActiveBg: "#141B22",
  chipActiveFg: "#F7F6F2",
  chipIdleBg: "#FFFFFF",
  chipIdleFg: "#3B4652",
  chipIdleBorder: "#DFDBD3",

  btnPrimaryBg: "#141B22",
  btnPrimaryFg: "#F7F6F2",
  btnSecondaryBorder: "#CBC6BC",
} as const;

/** Dark surfaces — night drafting table. Same system, different skin. */
export const DC_DARK = {
  pageBg: "#0A1118",
  text: "#ECF0F3",
  textSecondary: "#A8B5C1",
  textMuted: "#7F8E9C",
  textFaint: "#7F8E9C",
  rankNumber: "#566676",

  paneBg: "#111B25",
  paneBorder: "#1D2A37",
  rowBorder: "#18242F",
  rowHover: "#142030",
  rowSelectedBg: "#16222E",
  headerRule: "#2A3A4A",

  track: "#1D2A37",
  hairline: "#18242F",
  wellBg: "#111B25",
  wellBorder: "#1D2A37",
  controlBorder: "#2A3A4A",
  badgeNeutralBg: "#1D2A37",
  badgeNeutralFg: "#A8B5C1",
  badgeNeutralBorder: "#2A3A4A",
  dashed: "#2A3A4A",
  dashedFg: "#7F8E9C",

  chipActiveBg: "#ECF0F3",
  chipActiveFg: "#0A1118",
  chipIdleBg: "#111B25",
  chipIdleFg: "#A8B5C1",
  chipIdleBorder: "#2A3A4A",

  btnPrimaryBg: "#CC4E17",
  btnPrimaryFg: "#FFFFFF",
  btnSecondaryBorder: "#2A3A4A",
} as const;

/** The shape both skins share. Keyed off DC_LIGHT so a new token must be added to both. */
export type DcSkin = Record<keyof typeof DC_LIGHT, string>;

/** The masthead is the same blueprint-navy band in both skins — it is the brand bar. */
export const DC_MASTHEAD = {
  bg: "#0E1824",
  fg: "#EEF2F6",
  muted: "#B3C0CC",
  mono: "#8698AA",
  divider: "#36506A",
  border: "#26384B",
} as const;

/**
 * Signal colors. A status badge's hue is the status, so these are not
 * interchangeable with the accent. Desaturated from the v2 set so a register
 * full of status reads as information, and red sits well clear of primer.
 */
export const DC_SIGNAL = {
  /** Primer — shop-primed steel. The one accent. White text holds 4.5:1. */
  accent: "#CC4E17",
  accentLight: "#E36A2C",
  /** Primer text on light vellum — 5.9:1. */
  accentInk: "#A63C12",
  onAccent: "#FFFFFF",
  green: "oklch(0.58 0.11 152)",
  blue: "oklch(0.55 0.10 252)",
  amber: "oklch(0.74 0.13 78)",
  red: "oklch(0.56 0.18 22)",
  redText: "oklch(0.48 0.17 22)",
  metricLate: "oklch(0.70 0.15 22)",
  metricRr: "oklch(0.80 0.12 82)",
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
