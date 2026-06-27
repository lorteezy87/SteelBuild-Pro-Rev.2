import { describe, it, expect, beforeEach } from "vitest";
import { _internals } from "@/lib/featureFlags";

const { DEFAULT_FLAGS, STORAGE_KEY, readStored, readQueryString } = _internals;

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  // Reset the location stub
  window.location = { href: "http://localhost/", origin: "http://localhost", search: "" };
});

describe("featureFlags internals", () => {
  it("exposes immutable DEFAULT_FLAGS", () => {
    expect(Object.isFrozen(DEFAULT_FLAGS)).toBe(true);
    expect(typeof DEFAULT_FLAGS.modelViewerEdgesOverlay).toBe("boolean");
  });

  it("readStored returns empty object when storage is empty", () => {
    expect(readStored()).toEqual({});
  });

  it("readStored parses a valid JSON blob", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ aiDraftingAssistant: true }));
    expect(readStored()).toEqual({ aiDraftingAssistant: true });
  });

  it("readStored tolerates corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readStored()).toEqual({});
  });

  it("readStored tolerates non-object payloads", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
    // Arrays are objects in JS — current impl keeps them; just check it doesn't throw
    expect(() => readStored()).not.toThrow();
  });

  it("readQueryString returns empty when search is blank", () => {
    window.location.search = "";
    expect(readQueryString()).toEqual({});
  });

  it("readQueryString parses ff_ prefixed keys and coerces 0/false", () => {
    window.location.search = "?ff_betaGanttLayout=1&ff_aiDraftingAssistant=0&unrelated=x";
    expect(readQueryString()).toEqual({
      betaGanttLayout: true,
      aiDraftingAssistant: false,
    });
  });

  it("readQueryString ignores params without the ff_ prefix", () => {
    window.location.search = "?betaGanttLayout=1";
    expect(readQueryString()).toEqual({});
  });
});
