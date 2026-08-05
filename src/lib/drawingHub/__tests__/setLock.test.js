/**
 * Tests for drawingHub/setLock.js — assertSetUnlocked is the gate that
 * every write path leans on, so we exercise it independently of the
 * write paths themselves.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory fake of the supabase tables we touch. The `select` and
// `update` calls on supabase.from(table) return a builder that ends with
// a thenable when chained; the helper below mimics just enough of that
// API to drive the module under test without forcing every test to
// wire up a full mock per call.
const tables = {
  drawings:     [],
  drawing_sets: [],
};

let pendingPayload = null; // captures update() body for assertion in tests

function builder(tableName) {
  const state = {
    table: tableName,
    filters: [],
    op: "select",
    payload: null,
  };
  const api = {
    select: () => api,
    update: (payload) => { state.op = "update"; state.payload = payload; return api; },
    eq: (col, val) => { state.filters.push([col, val]); return api; },
    in: (col, vals) => { state.filters.push([col, vals]); return api; },
    is: (col, val) => { state.filters.push([col, val]); return api; },
    or:  () => api,
    order: () => api,
    limit: () => api,
    maybeSingle: async () => ({ data: runQuery(state)[0] || null, error: null }),
    single: async () => {
      const rows = runQuery(state);
      if (rows.length === 0) return { data: null, error: { message: "not found" } };
      return { data: rows[0], error: null };
    },
    then: undefined,
  };
  return api;
}

function runQuery(state) {
  let rows = tables[state.table] || [];
  for (const [col, val] of state.filters) {
    if (Array.isArray(val)) rows = rows.filter((r) => val.includes(r[col]));
    else                    rows = rows.filter((r) => r[col] === val);
  }
  if (state.op === "update") {
    pendingPayload = state.payload;
    rows = rows.map((r) => ({ ...r, ...state.payload }));
    // Persist back so subsequent reads see the change.
    tables[state.table] = (tables[state.table] || []).map((r) =>
      rows.find((u) => u.id === r.id) || r,
    );
  }
  return rows;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (t) => builder(t),
    auth: {
      getUser: async () => ({ data: { user: { id: "u-test", email: "t@example.com" } } }),
    },
  },
}));

import { lockSet, unlockSet, isSetLocked, assertSetUnlocked } from "../setLock.js";

beforeEach(() => {
  tables.drawings = [
    { id: "d1", drawing_set_id: "s1" },
    { id: "d2", drawing_set_id: null },
    { id: "d3", drawing_set_id: "s2" },
  ];
  tables.drawing_sets = [
    { id: "s1", is_locked: false, set_name: "Set One", locked_reason: null },
    { id: "s2", is_locked: true,  set_name: "Set Two", locked_reason: "approved" },
  ];
  pendingPayload = null;
});

describe("isSetLocked", () => {
  it("returns false for null/undefined", () => {
    expect(isSetLocked(null)).toBe(false);
    expect(isSetLocked(undefined)).toBe(false);
  });
  it("returns false for unlocked rows", () => {
    expect(isSetLocked({ is_locked: false })).toBe(false);
  });
  it("returns true only when is_locked === true", () => {
    expect(isSetLocked({ is_locked: true })).toBe(true);
    expect(isSetLocked({ is_locked: "true" })).toBe(false);
  });
});

describe("assertSetUnlocked", () => {
  it("no-ops when drawingId is empty", async () => {
    await expect(assertSetUnlocked(null)).resolves.toBeUndefined();
    await expect(assertSetUnlocked("")).resolves.toBeUndefined();
  });

  it("no-ops when the drawing has no parent set", async () => {
    await expect(assertSetUnlocked("d2")).resolves.toBeUndefined();
  });

  it("returns silently when the parent set is unlocked", async () => {
    await expect(assertSetUnlocked("d1")).resolves.toBeUndefined();
  });

  it("throws DRAWING_SET_LOCKED when the set is locked", async () => {
    await expect(assertSetUnlocked("d3")).rejects.toThrowError(/DRAWING_SET_LOCKED/);
    try {
      await assertSetUnlocked("d3");
    } catch (err) {
      expect(err.code).toBe("DRAWING_SET_LOCKED");
      expect(err.drawingSetId).toBe("s2");
    }
  });

  it("includes set_name and reason in the error message when present", async () => {
    try {
      await assertSetUnlocked("d3");
    } catch (err) {
      expect(err.message).toMatch(/Set Two/);
      expect(err.message).toMatch(/approved/);
    }
  });
});

describe("lockSet / unlockSet", () => {
  it("lockSet writes is_locked=true with timestamp + reason", async () => {
    await lockSet({ setId: "s1", reason: "Auto-locked on approval", userId: "u-1" });
    expect(pendingPayload.is_locked).toBe(true);
    expect(pendingPayload.locked_reason).toBe("Auto-locked on approval");
    expect(pendingPayload.locked_by).toBe("u-1");
    expect(pendingPayload.locked_at).toBeTruthy();
  });

  it("lockSet rejects missing setId", async () => {
    await expect(lockSet({ setId: null })).rejects.toThrow(/setId required/);
  });

  it("unlockSet clears all the lock columns", async () => {
    await unlockSet({ setId: "s2", reason: "Scope change approved by PM" });
    expect(pendingPayload.is_locked).toBe(false);
    expect(pendingPayload.locked_at).toBeNull();
    expect(pendingPayload.locked_by).toBeNull();
    expect(pendingPayload.locked_reason).toBeNull();
  });

  it("unlockSet rejects missing setId", async () => {
    await expect(unlockSet({ setId: undefined, reason: "x" })).rejects.toThrow(/setId required/);
  });

  it("unlockSet rejects a missing/blank reason (admin override must be justified)", async () => {
    await expect(unlockSet({ setId: "s2" })).rejects.toThrow(/reason required/);
    await expect(unlockSet({ setId: "s2", reason: "   " })).rejects.toThrow(/reason required/);
  });

  it("lockSet truncates very long reasons", async () => {
    const longReason = "x".repeat(3000);
    await lockSet({ setId: "s1", reason: longReason });
    expect(pendingPayload.locked_reason.length).toBe(2000);
  });
});
