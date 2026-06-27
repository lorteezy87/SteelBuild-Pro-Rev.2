import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerRoutePrefetcher,
  prefetchRoute,
  prefetchRoutesOnIdle,
  _resetRoutePrefetch,
} from "@/lib/routePrefetch";

beforeEach(() => { _resetRoutePrefetch(); });

describe("routePrefetch", () => {
  it("no-ops when no importer is registered", () => {
    // Should not throw for unknown pages
    expect(() => prefetchRoute("UnknownPage")).not.toThrow();
  });

  it("invokes the registered importer exactly once", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: () => null }));
    registerRoutePrefetcher("TestPage", importer);

    prefetchRoute("TestPage");
    prefetchRoute("TestPage");
    prefetchRoute("TestPage");

    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("re-warms after the importer rejects", async () => {
    let call = 0;
    const importer = vi.fn(() => {
      call++;
      return call === 1 ? Promise.reject(new Error("net")) : Promise.resolve({});
    });
    registerRoutePrefetcher("FlakyPage", importer);

    prefetchRoute("FlakyPage");
    // Let the promise rejection propagate through the microtask queue
    await Promise.resolve();
    await Promise.resolve();

    prefetchRoute("FlakyPage");
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("swallows synchronous errors from the importer", () => {
    registerRoutePrefetcher("BoomPage", () => { throw new Error("boom"); });
    expect(() => prefetchRoute("BoomPage")).not.toThrow();

    // And it should remain re-warmable after a sync throw
    const importer = vi.fn(() => Promise.resolve({}));
    registerRoutePrefetcher("BoomPage", importer);
    prefetchRoute("BoomPage");
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("batches idle prefetching through requestIdleCallback", async () => {
    const importer = vi.fn(() => Promise.resolve({}));
    registerRoutePrefetcher("A", importer);
    registerRoutePrefetcher("B", importer);

    prefetchRoutesOnIdle(["A", "B", "MissingC"]);
    // our stub runs requestIdleCallback via setTimeout(fn, 0)
    await new Promise((r) => setTimeout(r, 5));

    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("ignores invalid registrations", () => {
    expect(() => registerRoutePrefetcher("", () => {})).not.toThrow();
    expect(() => registerRoutePrefetcher("X", null)).not.toThrow();
    expect(() => prefetchRoute("X")).not.toThrow();
  });
});
