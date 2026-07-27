import { describe, expect, it, vi } from "vitest";
import {
  readStoredTheme,
  readSystemTheme,
  resolveInitialTheme,
  shouldPersistTheme,
  THEME_STORAGE_KEY,
} from "@/lib/themeResolution";

function memoryStorage(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

describe("themeResolution", () => {
  it("readStoredTheme returns null when unset", () => {
    expect(readStoredTheme(memoryStorage())).toBeNull();
  });

  it("readStoredTheme returns dark/light when valid", () => {
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: "dark" }))).toBe("dark");
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: "light" }))).toBe("light");
  });

  it("readStoredTheme ignores invalid values", () => {
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: "purple" }))).toBeNull();
  });

  it("readSystemTheme follows prefers-color-scheme", () => {
    const darkMq = vi.fn(() => ({ matches: true }));
    const lightMq = vi.fn(() => ({ matches: false }));
    expect(readSystemTheme(darkMq as unknown as typeof window.matchMedia)).toBe("dark");
    expect(readSystemTheme(lightMq as unknown as typeof window.matchMedia)).toBe("light");
  });

  it("resolveInitialTheme prefers stored over system", () => {
    const r = resolveInitialTheme({
      storage: memoryStorage({ [THEME_STORAGE_KEY]: "light" }),
      matchMedia: (() => ({ matches: true })) as unknown as typeof window.matchMedia,
    });
    expect(r).toEqual({ theme: "light", source: "user" });
  });

  it("resolveInitialTheme uses system when unset", () => {
    const r = resolveInitialTheme({
      storage: memoryStorage(),
      matchMedia: (() => ({ matches: true })) as unknown as typeof window.matchMedia,
    });
    expect(r).toEqual({ theme: "dark", source: "system" });
  });

  it("shouldPersistTheme only for user source", () => {
    expect(shouldPersistTheme("user")).toBe(true);
    expect(shouldPersistTheme("system")).toBe(false);
  });
});
