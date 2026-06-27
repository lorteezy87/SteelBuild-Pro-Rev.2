/**
 * telemetry.test.js — verifies error/event logging shim never throws and
 * preserves a bounded ring buffer for post-mortem inspection.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { logError, logEvent, _drainBuffer } from "../lib/telemetry";

describe("telemetry", () => {
  beforeEach(() => {
    _drainBuffer();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("captures Error instances with name + message + stack", () => {
    logError(new Error("kaboom"), { boundary: "test" });
    const buf = _drainBuffer();
    expect(buf).toHaveLength(1);
    expect(buf[0].error.name).toBe("Error");
    expect(buf[0].error.message).toBe("kaboom");
    expect(buf[0].error.stack).toBeDefined();
    expect(buf[0].context.boundary).toBe("test");
  });

  it("captures string and primitive errors without throwing", () => {
    expect(() => logError("plain string error")).not.toThrow();
    expect(() => logError(42)).not.toThrow();
    expect(() => logError(null)).not.toThrow();
    expect(_drainBuffer()).toHaveLength(3);
  });

  it("logEvent records breadcrumbs without an error payload", () => {
    logEvent("page-view", { page: "Drawings" });
    const buf = _drainBuffer();
    expect(buf).toHaveLength(1);
    expect(buf[0].event.name).toBe("page-view");
    expect(buf[0].event.data.page).toBe("Drawings");
  });

  it("buffers no more than MAX_BUFFER (50) entries", () => {
    for (let i = 0; i < 60; i++) logError(new Error(`e${i}`));
    const buf = _drainBuffer();
    expect(buf.length).toBeLessThanOrEqual(50);
    // Oldest entries dropped — last error should be e59
    expect(buf[buf.length - 1].error.message).toBe("e59");
  });

  it("never throws even when given a circular object as context", () => {
    const a = {};
    a.self = a;
    expect(() => logError(new Error("ref"), a)).not.toThrow();
  });
});
