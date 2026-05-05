/**
 * setupTests.ts — additional setup for jsdom-environment component tests.
 *
 * Loaded by vitest only when a test file opts into jsdom via the
 *   `// @vitest-environment jsdom`
 * pragma. Pure helper tests (the existing 488) keep using the default
 * `node` environment with `vitest.setup.js`, which is unchanged.
 *
 * Polyfills here cover globals that real components touch but jsdom
 * doesn't ship — IntersectionObserver, ResizeObserver, matchMedia.
 * Without these, libraries like radix and recharts crash on first
 * render under jsdom.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    // @ts-expect-error - test-only polyfill
    window.matchMedia = (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    });
  }

  if (!window.ResizeObserver) {
    // @ts-expect-error - test-only polyfill
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  if (!window.IntersectionObserver) {
    // @ts-expect-error - test-only polyfill
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds = [];
    };
  }
}
