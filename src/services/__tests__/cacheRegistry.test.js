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
    expect(families.length).toBeGreaterThanOrEqual(10);
    // Must include the nav counter
    expect(families).toContainEqual(["deliveries-nav-count", "proj-1"]);
    // Must include cost dashboard key
    expect(families).toContainEqual(["deliveries-cost", "proj-1"]);
    // Must include portfolio key
    expect(families).toContainEqual(["all-deliveries-portfolio"]);
    // Must include procurement
    expect(families).toContainEqual(["procurement", "proj-1"]);
    // Must include detail view key
    expect(families).toContainEqual(["del-detail", "proj-1"]);
  });

  it("returns all change_order query keys (includes projects)", () => {
    const families = getQueryFamilies("change_order", "proj-1");
    expect(families).toContainEqual(["projects"]);
    // Must include all variant keys
    expect(families).toContainEqual(["cos-all"]);
    expect(families).toContainEqual(["all-cos-portfolio"]);
    expect(families).toContainEqual(["change-orders-global"]);
    expect(families).toContainEqual(["change-orders-dash", "proj-1"]);
    expect(families).toContainEqual(["modal-cos", "proj-1"]);
  });

  it("returns all cost_code query keys", () => {
    const families = getQueryFamilies("cost_code", "proj-1");
    expect(families).toContainEqual(["cost-codes", "proj-1"]);
    expect(families).toContainEqual(["codes-all"]);
    expect(families).toContainEqual(["all-codes-portfolio"]);
    expect(families).toContainEqual(["cost-codes-global"]);
    expect(families).toContainEqual(["cost-codes-dash", "proj-1"]);
    expect(families).toContainEqual(["modal-codes", "proj-1"]);
  });

  it("returns all work_package query keys", () => {
    const families = getQueryFamilies("work_package", "proj-1");
    expect(families).toContainEqual(["work-packages", "proj-1"]);
    expect(families).toContainEqual(["wps-all"]);
    expect(families).toContainEqual(["work-packages-all"]);
    expect(families).toContainEqual(["all-wps-portfolio"]);
    expect(families).toContainEqual(["work-packages-global"]);
    expect(families).toContainEqual(["wps-fab", "proj-1"]);
  });

  it("returns all rfi query keys", () => {
    const families = getQueryFamilies("rfi", "proj-1");
    expect(families).toContainEqual(["rfis", "proj-1"]);
    expect(families).toContainEqual(["rfis", "hub"]);
    expect(families).toContainEqual(["rfis-nav-count", "proj-1"]);
    expect(families).toContainEqual(["pill-rfis-quick"]);
    expect(families).toContainEqual(["modal-rfis", "proj-1"]);
  });

  it("includes the Doc Control register key for drawing, drawing_revision, and drawingSet", () => {
    // The register grid (useDrawingRegister) reads drawing_register_view under
    // ["drawing-register", projectId]. Every drawing/revision/set mutation must
    // fan out to it so a revised upload advances the register without a reload.
    expect(getQueryFamilies("drawing", "proj-1")).toContainEqual(["drawing-register", "proj-1"]);
    expect(getQueryFamilies("drawing_revision", "proj-1")).toContainEqual(["drawing-register", "proj-1"]);
    expect(getQueryFamilies("drawingSet", "proj-1")).toContainEqual(["drawing-register", "proj-1"]);
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
    expect(calls).toContainEqual(["drawings-nav-count", "proj-1"]);
    expect(calls).toContainEqual(["draw-detail", "proj-1"]);
    // Doc Control register view — a drawing mutation must refresh it (a revised
    // upload showed a stale current revision until manual reload without this).
    expect(calls).toContainEqual(["drawing-register", "proj-1"]);
  });

  it("invalidates the Doc Control register on a revision mutation", async () => {
    await invalidateEntity(qc, "drawing_revision", "proj-1");
    const calls = qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey);

    expect(calls).toContainEqual(["drawing-revisions", "proj-1"]);
    expect(calls).toContainEqual(["drawings", "proj-1"]);
    expect(calls).toContainEqual(["drawing-register", "proj-1"]);
  });

  it("invalidates the Doc Control register on a drawing-set mutation", async () => {
    await invalidateEntity(qc, "drawingSet", "proj-1");
    const calls = qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey);

    expect(calls).toContainEqual(["drawing-register", "proj-1"]);
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
    // Original entities
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
    // Newly registered entities
    expect(entities).toContain("action_item");
    expect(entities).toContain("daily_log");
    expect(entities).toContain("contact");
    expect(entities).toContain("meeting");
    expect(entities).toContain("inspection");
    expect(entities).toContain("safety_incident");
    expect(entities).toContain("photo");
    expect(entities).toContain("resource");
    expect(entities).toContain("vendor");
    expect(entities).toContain("punchlist");
    expect(entities).toContain("qc_record");
    expect(entities).toContain("closeout");
    expect(entities).toContain("scope_item");
    expect(entities).toContain("production_note");
    expect(entities).toContain("warranty");
    expect(entities).toContain("constraint");
    expect(entities).toContain("procurement");
    expect(entities).toContain("user");
    expect(entities).toContain("decision");
    expect(entities).toContain("assumption");
    expect(entities).toContain("activity");
    expect(entities).toContain("document");
    expect(entities).toContain("change_request");
    expect(entities).toContain("user_settings");
    expect(entities.length).toBeGreaterThanOrEqual(34);
  });
});
