/**
 * Pure preference catalogs for ThemeContext.
 */
import { THEME_STORAGE_KEY } from "@/lib/themeResolution";

export const THEME_PREF_KEYS = {
  theme: THEME_STORAGE_KEY,
  accent: "sbp-accent",
  fontScale: "sbp-font-scale",
  contrast: "sbp-contrast",
  motion: "sbp-motion",
} as const;

export const THEME_DEFAULTS = {
  theme: "dark",
  accent: "gold",
  fontScale: "md",
  contrast: "normal",
  motion: "auto",
} as const;

export const THEME_ALLOWED = {
  theme: new Set(["dark", "light"]),
  accent: new Set(["gold", "teal", "blue", "amber", "slate"]),
  fontScale: new Set(["sm", "md", "lg"]),
  contrast: new Set(["normal", "high"]),
  motion: new Set(["auto", "reduced"]),
} as const;

export const FONT_SCALE_VALUE = { sm: 0.94, md: 1.0, lg: 1.12 } as const;
