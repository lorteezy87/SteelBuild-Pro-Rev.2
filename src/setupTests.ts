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
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // jsdom ships no PointerEvent, so fireEvent.pointerDown() silently degrades
  // to a bare Event: pointerId / pointerType / pressure are dropped and
  // clientX/clientY arrive as NaN. Any component driven by pointer events
  // (the Notes ink canvas, drawing markup) is then untestable — handlers run,
  // but every pointer discriminator reads undefined. Extending MouseEvent
  // keeps clientX/clientY/buttons behaving correctly.
  // NOTE: `typeof window !== "undefined"` is NOT a reliable "running in jsdom"
  // check here — under the default node environment a bare `window` object
  // exists with almost no DOM hung off it. Anything touching a DOM constructor
  // has to prove that constructor exists first, or it throws at module load and
  // takes every node-environment suite down with it.
  const hasDom = typeof MouseEvent !== "undefined" && typeof window.Element === "function";

  if (hasDom && !window.PointerEvent) {
    class PointerEventPolyfill extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      readonly pressure: number;
      readonly width: number;
      readonly height: number;
      readonly tiltX: number;
      readonly tiltY: number;
      readonly isPrimary: boolean;

      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
        this.pointerType = params.pointerType ?? "";
        this.pressure = params.pressure ?? 0;
        this.width = params.width ?? 1;
        this.height = params.height ?? 1;
        this.tiltX = params.tiltX ?? 0;
        this.tiltY = params.tiltY ?? 0;
        this.isPrimary = params.isPrimary ?? true;
      }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof window.PointerEvent;
  }

  // Pointer capture is part of the pointer-events contract and jsdom omits it.
  // Callers guard with try/catch, but stubbing it keeps capture-dependent code
  // on its real path instead of the error branch.
  if (hasDom && !window.Element.prototype.setPointerCapture) {
    window.Element.prototype.setPointerCapture = function setPointerCapture() {};
    window.Element.prototype.releasePointerCapture = function releasePointerCapture() {};
    window.Element.prototype.hasPointerCapture = function hasPointerCapture() {
      return false;
    };
  }

  if (!window.IntersectionObserver) {
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      root: Element | null = null;
      rootMargin = "";
      thresholds: number[] = [];
    };
  }
}
