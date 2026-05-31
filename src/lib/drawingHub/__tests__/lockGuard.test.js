/**
 * Lock-guard integration tests for zones / links / dependencies.
 *
 * The unit-level lock predicate is covered in setLock.test.js. This file
 * verifies that every public write entry-point on the service layer
 * actually consults the guard and refuses to proceed when the parent
 * drawing's set is locked.
 *
 * Strategy: intercept supabase.from() to satisfy the assertSetUnlocked
 * lookup with a locked set, and assert each write throws an error tagged
 * with code === "DRAWING_SET_LOCKED" before reaching any insert/update
 * statement. We do NOT exercise the happy-path write here — that is
 * already covered by the existing zones / links suites.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const lockedSet = {
  id: "set-locked",
  is_locked: true,
  set_name: "Locked Set",
  locked_reason: "Auto-locked on approval",
};

const drawings = {
  "draw-locked": { id: "draw-locked", drawing_set_id: "set-locked" },
};

const zones = {
  "zone-1": { id: "zone-1", drawing_id: "draw-locked" },
};

const links = {
  "link-1": { id: "link-1", drawing_id: "draw-locked" },
};

const deps = {
  "dep-1": { id: "dep-1", source_zone_id: "zone-1" },
};

let writeAttempted = false;

function builder(table) {
  const state = { table, filters: [], op: "select", payload: null };
  const api = {
    select: () => api,
    insert: (payload) => { state.op = "insert"; state.payload = payload; return api; },
    update: (payload) => { state.op = "update"; state.payload = payload; return api; },
    eq: (col, val) => { state.filters.push([col, val]); return api; },
    in: () => api,
    is: () => api,
    or: () => api,
    order: () => api,
    limit: () => api,
    maybeSingle: async () => ({ data: read(state)[0] || null, error: null }),
    single: async () => {
      // For lookups during the lock guard
      if (state.op === "select") return { data: read(state)[0] || null, error: null };
      // For write paths — should never reach here in the guarded test cases
      writeAttempted = true;
      return { data: null, error: null };
    },
  };
  return api;
}

function read(state) {
  if (state.table === "drawings") {
    return Object.values(drawings).filter((r) =>
      state.filters.every(([c, v]) => r[c] === v),
    );
  }
  if (state.table === "drawing_sets") {
    const id = state.filters.find(([c]) => c === "id")?.[1];
    return id === lockedSet.id ? [lockedSet] : [];
  }
  if (state.table === "drawing_zones") {
    return Object.values(zones).filter((r) =>
      state.filters.every(([c, v]) => r[c] === v),
    );
  }
  if (state.table === "drawing_links") {
    return Object.values(links).filter((r) =>
      state.filters.every(([c, v]) => r[c] === v),
    );
  }
  if (state.table === "drawing_zone_dependencies") {
    return Object.values(deps).filter((r) =>
      state.filters.every(([c, v]) => r[c] === v),
    );
  }
  return [];
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (t) => builder(t),
    auth: {
      getUser: async () => ({ data: { user: { id: "u-test" } } }),
    },
  },
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {},
}));

import {
  createZone, updateZone, deleteZone,
} from "../zones.js";
import { createLink, removeLink } from "../links.js";
import { addZoneDependency, removeZoneDependency } from "../dependencies.js";

beforeEach(() => {
  writeAttempted = false;
});

const expectLockRejection = async (fn) => {
  try {
    await fn();
    throw new Error("expected rejection but call resolved");
  } catch (err) {
    expect(err.code).toBe("DRAWING_SET_LOCKED");
    expect(err.message).toMatch(/Locked Set/);
    expect(err.message).toMatch(/Auto-locked on approval/);
  }
};

describe("zones lock guard", () => {
  it("createZone refuses when the set is locked", async () => {
    await expectLockRejection(() =>
      createZone({
        projectId: "p1", drawingId: "draw-locked", revisionId: "r1", userId: "u",
        xMin: 0.1, yMin: 0.1, xMax: 0.5, yMax: 0.5,
      })
    );
  });
  it("updateZone refuses when the set is locked", async () => {
    await expectLockRejection(() =>
      updateZone("zone-1", { label: "renamed" })
    );
  });
  it("deleteZone refuses when the set is locked", async () => {
    await expectLockRejection(() => deleteZone("zone-1"));
  });
});

describe("links lock guard", () => {
  it("createLink refuses when the set is locked", async () => {
    await expectLockRejection(() =>
      createLink({
        projectId: "p1",
        zone: { id: "zone-1", drawing_id: "draw-locked", drawing_revision_id: "r1" },
        recordType: "rfi",
        recordId: "rec-1",
      })
    );
  });
  it("removeLink refuses when the set is locked", async () => {
    await expectLockRejection(() => removeLink({ linkId: "link-1", userId: "u" }));
  });
});

describe("dependencies lock guard", () => {
  it("addZoneDependency refuses when the source zone's set is locked", async () => {
    await expectLockRejection(() =>
      addZoneDependency({
        projectId: "p1",
        sourceZoneId: "zone-1",
        targetZoneId: "zone-2",
        relationship: "blocks",
      })
    );
  });
  it("removeZoneDependency refuses when the source zone's set is locked", async () => {
    await expectLockRejection(() => removeZoneDependency("dep-1"));
  });
});
