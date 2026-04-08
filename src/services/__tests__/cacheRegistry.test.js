/**
 * cacheRegistry.test.js — Tests for centralized cache invalidation.
 *
 * Verifies that invalidateEntity hits ALL query keys for an entity,
 * not just the primary one.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  invalidateEntity,
  invalidateEntities,
  getQueryKey,
  getQueryFamilies,
  getRegisteredEntities,
} from "../cacheRegistry";

// Mock QueryClient
function createMockQC() {
  return {
    invalidateQueries: vi.fn(() => Promise.resolve()),
  };
}

describe("getQueryKey", () => {
  it("returns primary key for delivery", () => {
    expect(getQueryKey("delivery", "proj-1")).toEqual(["deliveries", "proj-1"]);
  });

  it("returns primary key for drawing", () => {
    expect(getQueryKey("drawing", "proj-1")).toEqual(["drawings", "proj-1"]);
  });

  it("returns fallback for unknown entity", () => {
    expect(getQueryKey("unknown", "proj-1")).toEqual(["unknown", "proj-1"]);
  });
});

describe("getQueryFamilies", () => {
  it("returns all delivery query keys", () => {
    const families = getQueryFamilies("delivery", "proj-1");
    expect(families.length).toBeGreaterThanOrEqual(8);
    // Must include the nav counter
    expect(families).toContainEqual(["deliveries-nav-count", "proj-1"]);
    // Must include cost dashboard key
    expect(families).toContainEqual(["deliveries-cost", "proj-1"]);
    // Must include portfolio key
    expect(families).toContainEqual(["all-deliveries-portfolio"]);
    // Must include procurement
    expect(families).toContainEqual(["procurement", "proj-1"]);
  });

  it("returns all change_order query keys (includes projects)", () => {
    const families = getQueryFamilies("change_order", "proj-1");
    expect(families).toContainEqual(["projects"]);
  });
});

describe("invalidateEntity", () => {
  let qc;

  beforeEach(() => {
    qc = createMockQC();
  });

  it("invalidates ALL delivery cache keys", async () => {
    await invalidateEntity(qc, "delivery", "proj-1");
    const calls = qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey);

    expect(calls).toContainEqual(["deliveries", "proj-1"]);
    expect(calls).toContainEqual(["deliveries"]);
    expect(calls).toContainEqual(["deliveries-all"]);
    expect(calls).toContainEqual(["deliveries-nav-count", "proj-1"]);
    expect(calls).toContainEqual(["deliveries-cost", "proj-1"]);
    expect(calls).toContainEqual(["all-deliveries-portfolio"]);
    expect(calls).toContainEqual(["procurement", "proj-1"]);
  });

  it("invalidates ALL drawing cache keys", async () => {
    await invalidateEntity(qc, "drawing", "proj-1");
    const calls = qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey);

    expect(calls).toContainEqual(["drawings", "proj-1"]);
    expect(calls).toContainEqual(["drawings"]);
    expect(calls).toContainEqual(["drawings-all"]);
  });

  it("falls back for unknown entity", async () => {
    await invalidateEntity(qc, "spaceship", "proj-1");
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["spaceship"] });
  });
});

describe("invalidateEntities", () => {
  it("invalidates multiple entities at once", async () => {
    const qc = createMockQC();
    await invalidateEntities(qc, ["drawing", "schedule_task"], "proj-1");

    const calls = qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(calls).toContainEqual(["drawings", "proj-1"]);
    expect(calls).toContainEqual(["schedule-tasks", "proj-1"]);
  });
});

describe("getRegisteredEntities", () => {
  it("returns all registered entity names", () => {
    const entities = getRegisteredEntities();
    expect(entities).toContain("drawing");
    expect(entities).toContain("delivery");
    expect(entities).toContain("expense");
    expect(entities).toContain("change_order");
    expect(entities).toContain("rfi");
    expect(entities).toContain("work_package");
    expect(entities).toContain("schedule_task");
    expect(entities).toContain("sov_item");
    expect(entities).toContain("alert");
    expect(entities).toContain("project");
  });
});
