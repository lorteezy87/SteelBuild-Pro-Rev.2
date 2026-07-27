// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/components/shared/ThemeContext";
import { THEME_STORAGE_KEY } from "@/lib/themeResolution";

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initialMatches;
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((_type: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn(() => mediaQueryList),
  });

  return {
    emit(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches: nextMatches, media: mediaQueryList.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

function ThemeProbe() {
  const { theme, toggleTheme, setTheme, applyPreferences } = useTheme() as {
    theme: "dark" | "light";
    toggleTheme: () => void;
    setTheme: (next: "dark" | "light") => void;
    applyPreferences: (preferences: { theme: "dark" | "light" }) => void;
  };
  return (
    <div>
      <span>theme:{theme}</span>
      <button type="button" onClick={toggleTheme}>Toggle</button>
      <button type="button" onClick={() => setTheme("light")}>Set light</button>
      <button type="button" onClick={() => applyPreferences({ theme: "dark" })}>Apply dark</button>
    </div>
  );
}

describe("ThemeContext", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.className = "";
    vi.restoreAllMocks();
  });

  it("uses system theme without persisting until the user chooses a theme", async () => {
    const systemTheme = installMatchMedia(true);

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(await screen.findByText("theme:dark")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

    systemTheme.emit(false);

    expect(await screen.findByText("theme:light")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "light"));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByText("Apply dark"));

    expect(await screen.findByText("theme:dark")).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark"));

    systemTheme.emit(false);

    expect(screen.getByText("theme:dark")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });
});
