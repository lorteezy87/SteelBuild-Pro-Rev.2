/**
 * The static-route mount check must be CAPABLE of failing.
 *
 * It used to read `!ALL_ROUTE_PATHS.includes(path)` where `path` came from
 * STATIC_ROUTE_METADATA — and ALL_ROUTE_PATHS is the union of the registry and
 * STATIC_ROUTE_METADATA's own keys. Comparing a set against itself is a
 * tautology: a `kind: "entry"` path pointing at no mounted route would 404 in
 * production and the validator would report nothing.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_ROUTE_PATHS,
  ROUTE_LIFECYCLES,
  STATIC_ROUTE_LIFECYCLES,
  STATIC_ROUTE_METADATA,
  mountedRoutePaths,
  validateRoutes,
} from "@/config/routes";

/**
 * STATIC_ROUTE_METADATA is a plain object literal, so TypeScript infers a
 * union in which only the redirect members carry `target`. These tests are
 * ABOUT the redirect members, so widen once here rather than narrowing at
 * every call site.
 */
interface StaticRouteMeta {
  lifecycle: string;
  kind: string;
  target?: string;
}
const staticEntries = (): [string, StaticRouteMeta][] =>
  Object.entries(STATIC_ROUTE_METADATA as Record<string, StaticRouteMeta>);

describe("mountedRoutePaths", () => {
  it("is not the set the old check compared against", () => {
    // Every static path is in ALL_ROUTE_PATHS by construction — that is the bug.
    for (const path of Object.keys(STATIC_ROUTE_METADATA)) {
      expect(ALL_ROUTE_PATHS).toContain(path);
    }
    // The mounted set is derived from what the router mounts, so it can reject.
    expect(mountedRoutePaths().has("/NotAMountedRoute")).toBe(false);
  });

  it("mounts the index, the standalone pages and every registered page", () => {
    const mounted = mountedRoutePaths();
    for (const path of ["/", "/Landing", "/ProjectDetail", "/DesktopConnect"]) {
      expect(mounted.has(path)).toBe(true);
    }
  });
});

describe("lifecycle vocabularies are separate on purpose", () => {
  it("allows legacy for a static redirect but never for a registered page", () => {
    expect(STATIC_ROUTE_LIFECYCLES).toContain("legacy");
    expect(ROUTE_LIFECYCLES).not.toContain("legacy");
  });

  it("every static entry declares a lifecycle from the static allowlist", () => {
    const bad = Object.entries(STATIC_ROUTE_METADATA)
      .filter(([, meta]) => !STATIC_ROUTE_LIFECYCLES.includes(meta.lifecycle))
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });
});

describe("the live registry", () => {
  it("passes the strengthened validator with zero issues", async () => {
    await expect(validateRoutes()).resolves.toEqual([]);
  });

  it("has no redirect pointing at itself", () => {
    const selfies = staticEntries()
      .filter(([path, meta]) => meta.kind === "redirect" && meta.target === path)
      .map(([path]) => path);
    expect(selfies).toEqual([]);
  });

  it("has no redirect without a target", () => {
    const targetless = staticEntries()
      .filter(([, meta]) => meta.kind === "redirect" && !meta.target)
      .map(([path]) => path);
    expect(targetless).toEqual([]);
  });
});
