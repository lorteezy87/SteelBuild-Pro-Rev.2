/**
 * ThemeContext — global UI customisation preferences.
 *
 * Backs five user-facing settings that take effect immediately when
 * the user changes them in Settings → Display:
 *
 *   theme        "dark" | "light"
 *   accent       "gold" | "teal" | "blue" | "amber" | "slate"
 *                — overrides --accent + the muted/border tints. The
 *                project's industrial palette excludes purple/pink so
 *                presets stay inside the warm/cool earth ranges only.
 *   fontScale    "sm" | "md" | "lg"  (94% / 100% / 112% of base font)
 *   contrast     "normal" | "high"   (high lifts text + border to AAA)
 *   motion       "auto" | "reduced"  ("reduced" disables all CSS
 *                transitions/animations regardless of OS pref)
 *
 * Theme initializes from the saved `sbp-theme` user choice when present;
 * otherwise it follows the OS color-scheme preference until the user chooses
 * a theme. User-selected preferences persist to localStorage so the chosen
 * look is restored on the next page load before React mounts. The values are
 * applied to `document.documentElement` via:
 *   - data-theme attribute       (theme)
 *   - data-accent attribute      (accent)
 *   - data-contrast attribute    (contrast)
 *   - data-motion attribute      (motion)
 *   - --font-scale CSS variable  (fontScale)
 *
 * `tokens.css` reads those attributes / variables and switches the
 * underlying values, so consumers don't have to subscribe to context.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  resolveInitialTheme,
  shouldPersistTheme,
  THEME_STORAGE_KEY,
} from "@/lib/themeResolution";

const KEY = {
  theme:     THEME_STORAGE_KEY,
  accent:    "sbp-accent",
  fontScale: "sbp-font-scale",
  contrast:  "sbp-contrast",
  motion:    "sbp-motion",
};

const DEFAULTS = {
  theme:     "dark",
  accent:    "gold",
  fontScale: "md",
  contrast:  "normal",
  motion:    "auto",
};

const ALLOWED = {
  theme:     new Set(["dark", "light"]),
  accent:    new Set(["gold", "teal", "blue", "amber", "slate"]),
  fontScale: new Set(["sm", "md", "lg"]),
  contrast:  new Set(["normal", "high"]),
  motion:    new Set(["auto", "reduced"]),
};

const FONT_SCALE_VALUE = { sm: 0.94, md: 1.0, lg: 1.12 };

const ThemeContext = createContext({
  theme: "dark",
  accent: "gold",
  fontScale: "md",
  contrast: "normal",
  motion: "auto",
  toggleTheme: () => {},
  setTheme: () => {},
  setAccent: () => {},
  setFontScale: () => {},
  setContrast: () => {},
  setMotion: () => {},
  applyPreferences: () => {},
});

function readPersisted(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v && ALLOWED[name(key)]?.has(v)) return v;
  } catch {}
  return fallback;
}
// Map a localStorage key back to a preference name.
function name(key) {
  if (key === KEY.theme)     return "theme";
  if (key === KEY.accent)    return "accent";
  if (key === KEY.fontScale) return "fontScale";
  if (key === KEY.contrast)  return "contrast";
  if (key === KEY.motion)    return "motion";
  return null;
}

export function ThemeProvider({ children }) {
  const [initial] = useState(() => resolveInitialTheme({
    storage: typeof localStorage !== "undefined" ? localStorage : { getItem: () => null },
    matchMedia: typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined,
  }));
  const [theme,     setThemeState]     = useState(initial.theme);
  const [themeSource, setThemeSource]  = useState(initial.source);
  const [accent,    setAccentState]    = useState(() => readPersisted(KEY.accent,    DEFAULTS.accent));
  const [fontScale, setFontScaleState] = useState(() => readPersisted(KEY.fontScale, DEFAULTS.fontScale));
  const [contrast,  setContrastState]  = useState(() => readPersisted(KEY.contrast,  DEFAULTS.contrast));
  const [motion,    setMotionState]    = useState(() => readPersisted(KEY.motion,    DEFAULTS.motion));

  // Apply attributes / CSS variables to <html> whenever any pref
  // changes. Runs synchronously so the new style is in place by the
  // next paint frame.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-accent", accent);
    root.setAttribute("data-contrast", contrast);
    root.setAttribute("data-motion", motion);
    root.style.setProperty("--font-scale", String(FONT_SCALE_VALUE[fontScale] ?? 1));
    // SteelBuild Dark is intentionally scoped. Light mode must not carry
    // the dark overlay class or it inherits the frosted dark palette.
    if (theme === "dark") root.classList.add("steelbuild-dark");
    else root.classList.remove("steelbuild-dark");
    try {
      if (shouldPersistTheme(themeSource)) {
        localStorage.setItem(KEY.theme, theme);
      }
      localStorage.setItem(KEY.accent,    accent);
      localStorage.setItem(KEY.fontScale, fontScale);
      localStorage.setItem(KEY.contrast,  contrast);
      localStorage.setItem(KEY.motion,    motion);
    } catch {}
  }, [theme, themeSource, accent, fontScale, contrast, motion]);

  // Follow OS color-scheme changes only while no user theme is stored.
  useEffect(() => {
    if (themeSource !== "system" || typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event) => setThemeState(event.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themeSource]);

  const guarded = (kind, setter) => (next) => {
    if (!ALLOWED[kind].has(next)) return;
    setter(next);
  };
  const setTheme     = useCallback((next) => {
    if (!ALLOWED.theme.has(next)) return;
    setThemeSource("user");
    setThemeState(next);
  }, []);
  const setAccent    = useCallback(guarded("accent",    setAccentState),    []);
  const setFontScale = useCallback(guarded("fontScale", setFontScaleState), []);
  const setContrast  = useCallback(guarded("contrast",  setContrastState),  []);
  const setMotion    = useCallback(guarded("motion",    setMotionState),    []);
  const toggleTheme  = useCallback(() => {
    setThemeSource("user");
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  /**
   * Bulk-apply a `{ theme, accent, font_scale, contrast, motion }`
   * payload — what a fresh fetch from the user-prefs row looks like.
   * Silently skips any key whose value isn't in ALLOWED.
   */
  const applyPreferences = useCallback((p) => {
    if (!p || typeof p !== "object") return;
    if (p.theme && ALLOWED.theme.has(p.theme)) {
      setThemeSource("user");
      setThemeState(p.theme);
    }
    if (p.accent_color && ALLOWED.accent.has(p.accent_color)) setAccentState(p.accent_color);
    if (p.font_scale && ALLOWED.fontScale.has(p.font_scale))  setFontScaleState(p.font_scale);
    if (p.contrast_mode && ALLOWED.contrast.has(p.contrast_mode)) setContrastState(p.contrast_mode);
    if (p.motion_mode && ALLOWED.motion.has(p.motion_mode))   setMotionState(p.motion_mode);
  }, []);

  return (
    <ThemeContext.Provider value={{
      theme, accent, fontScale, contrast, motion,
      toggleTheme, setTheme, setAccent, setFontScale, setContrast, setMotion,
      applyPreferences,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
