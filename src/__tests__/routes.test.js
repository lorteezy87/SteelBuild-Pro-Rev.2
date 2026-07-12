/**
 * routes.test.js — smoke tests for the route metadata source-of-truth.
 *
 * These don't render React; they just verify the data shape so that an
 * accidental rename in pages.config.js or routes.js trips CI before it
 * reaches production.
 */

import { describe, it, expect } from "vitest";
import {
  ALL_ROUTE_PATHS,
  PAGE_LABELS,
  PAGE_LIFECYCLES,
  PROJECT_SCOPED_PAGES,
  ROUTE_LIFECYCLES,
  STATIC_ROUTE_METADATA,
  routeLabel,
} from "../routes";

describe("routes — page registry", () => {
  it("exposes a route path for every labeled page", () => {
    for (const key of Object.keys(PAGE_LABELS)) {
      expect(ALL_ROUTE_PATHS).toContain(`/${key}`);
    }
  });

  it("includes the supported static routes", () => {
    expect(ALL_ROUTE_PATHS).toContain("/");
    expect(ALL_ROUTE_PATHS).toContain("/Landing");
    expect(ALL_ROUTE_PATHS).toContain("/RFIHub");
    expect(ALL_ROUTE_PATHS).toContain("/ProjectDetail");
  });

  it("has no duplicate route paths", () => {
    const seen = new Set();
    for (const path of ALL_ROUTE_PATHS) {
      expect(seen.has(path)).toBe(false);
      seen.add(path);
    }
  });

  it("requires lifecycle metadata for labeled registry pages", () => {
    for (const key of Object.keys(PAGE_LABELS)) {
      const lifecycle = PAGE_LIFECYCLES[key];
      expect(lifecycle, `Registry page ${key} missing lifecycle`).toBeDefined();
      expect(ROUTE_LIFECYCLES.includes(lifecycle), `Invalid lifecycle "${lifecycle}" for ${key}`).toBe(true);
    }
  });

  it("marks privileged operations as internal", () => {
    ["FeatureFlagsAdmin", "UsersManagement", "DataExchange"].forEach((page) => {
      expect(PAGE_LIFECYCLES[page], `${page} should be registered`).toBe("internal");
    });
  });

  it("includes compatibility metadata paths and validates redirect targets", () => {
    for (const [path, meta] of Object.entries(STATIC_ROUTE_METADATA)) {
      expect(ALL_ROUTE_PATHS, `Static path ${path} should be mounted`).toContain(path);

      if (meta.kind === "redirect") {
        expect(meta.lifecycle, `Compatibility redirect ${path} should be legacy`).toBe("legacy");
        expect(ALL_ROUTE_PATHS, `Redirect target ${meta.target} should be mounted`).toContain(meta.target);
      }
    }

    expect(ALL_ROUTE_PATHS).toContain("/GanttChart");
  });
});

describe("routeLabel", () => {
  it("returns the explicit label when present", () => {
    expect(routeLabel("Dashboard")).toBe("Dashboard");
    expect(routeLabel("Submittals")).toBe("Submittal Register");
  });

  it("falls back to a spaced version for unknown pages", () => {
    expect(routeLabel("SomeNewPage")).toBe("Some New Page");
  });

  it("never throws for null/undefined/empty input", () => {
    expect(routeLabel(null)).toBe("Page");
    expect(routeLabel(undefined)).toBe("Page");
    expect(routeLabel("")).toBe("Page");
  });
});

describe("PROJECT_SCOPED_PAGES", () => {
  it("contains pages that genuinely depend on an active project", () => {
    expect(PROJECT_SCOPED_PAGES.has("Drawings")).toBe(true);
    expect(PROJECT_SCOPED_PAGES.has("Schedule")).toBe(true);
    expect(PROJECT_SCOPED_PAGES.has("RFIs")).toBe(true);
  });

  it("contains operational pages that read the active project context", () => {
    [
      "Documents",
      "LEMs",
      "LookAheadSchedule",
      "FieldPlan",
      "ContractManagement",
      "ChangeRequests",
      "ProjectCloseout",
      "Warranty",
      "JobStatusReport",
    ].forEach((page) => {
      expect(PROJECT_SCOPED_PAGES.has(page), `${page} should require an active project`).toBe(true);
    });
  });

  it("excludes admin pages that are project-agnostic", () => {
    expect(PROJECT_SCOPED_PAGES.has("Settings")).toBe(false);
    expect(PROJECT_SCOPED_PAGES.has("UsersManagement")).toBe(false);
    expect(PROJECT_SCOPED_PAGES.has("Vendors")).toBe(false);
  });

  it("only references pages that have a label entry", () => {
    for (const page of PROJECT_SCOPED_PAGES) {
      expect(PAGE_LABELS[page], `Project-scoped page "${page}" has no label`).toBeDefined();
    }
  });
});
