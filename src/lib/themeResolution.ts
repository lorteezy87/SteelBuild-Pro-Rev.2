export const THEME_STORAGE_KEY = "sbp-theme";
export type ThemeMode = "dark" | "light";
export type ThemePreference = ThemeMode | "system";
export type ThemeSource = "user" | "system";

const ALLOWED = new Set<ThemePreference>(["dark", "light", "system"]);

export type ThemeStorage = {
  getItem(key: string): string | null;
};

export function readStoredTheme(storage: ThemeStorage): ThemePreference | null {
  try {
    const v = storage.getItem(THEME_STORAGE_KEY);
    if (v && ALLOWED.has(v as ThemePreference)) return v as ThemePreference;
  } catch {
    /* ignore */
  }
  return null;
}

export function readSystemTheme(
  matchMediaFn?: typeof window.matchMedia,
  fallback: ThemeMode = "dark",
): ThemeMode {
  try {
    const mq = matchMediaFn ?? (typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined);
    if (!mq) return fallback;
    return mq("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return fallback;
  }
}

export function resolveInitialTheme(opts: {
  storage: ThemeStorage;
  matchMedia?: typeof window.matchMedia;
  fallback?: ThemeMode;
}): { theme: ThemeMode; source: ThemeSource } {
  const stored = readStoredTheme(opts.storage);
  if (stored && stored !== "system") return { theme: stored, source: "user" };
  return {
    theme: readSystemTheme(opts.matchMedia, opts.fallback ?? "dark"),
    source: "system",
  };
}

export function shouldPersistTheme(source: ThemeSource): boolean {
  return source === "user";
}
