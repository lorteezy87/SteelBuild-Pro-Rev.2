/**
 * Tests for drawingHub/signoffs.js — listSignoffs, createSignoff, voidSignoff.
 *
 * The mocked supabase records every insert/update payload so we can
 * assert column shape (stamped_by_id, is_voided, etc.) without going to
 * the real database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

let store = []; // drawing_signoffs rows
let lastInsert = null;
let lastUpdate = null;
let lastFilter = null;

function builder() {
  const state = { filters: [], op: "select", payload: null, order: null };
  const api = {
    select: () => api,
    insert: (payload) => { state.op = "insert"; state.payload = payload; lastInsert = payload; return api; },
    update: (payload) => { state.op = "update"; state.payload = payload; lastUpdate = payload; return api; },
    eq: (col, val) => { state.filters.push([col, val]); return api; },
    in: () => api,
    is: () => api,
    or: () => api,
    order: (col, opts) => { state.order = { col, ...opts }; return api; },
    limit: () => api,
    maybeSingle: async () => ({ data: query(state)[0] || null, error: null }),
    single: async () => {
      if (state.op === "insert") {
        // Mirror DB defaults so listSignoffs's eq("is_voided", false)
        // matches freshly inserted rows.
        const row = {
          id: `sg-${store.length + 1}`,
          is_voided: false,
          stamped_at: new Date().toISOString(),
          ...state.payload,
        };
        store.push(row);
        return { data: row, error: null };
      }
      if (state.op === "update") {
        const matches = query(state);
        const updated = matches.map((r) => ({ ...r, ...state.payload }));
        store = store.map((r) => updated.find((u) => u.id === r.id) || r);
        return { data: updated[0] || null, error: null };
      }
      const rows = query(state);
      return { data: rows[0] || null, error: rows[0] ? null : { message: "not found" } };
    },
    then: (resolve, reject) => {
      lastFilter = state;
      try {
        return Promise.resolve({ data: query(state), error: null }).then(resolve, reject);
      } catch (err) {
        return Promise.reject(err).then(resolve, reject);
      }
    },
  };
  return api;
}

function query(state) {
  let rows = store;
  for (const [col, val] of state.filters) rows = rows.filter((r) => r[col] === val);
  if (state.order) {
    const { col, ascending } = state.order;
    rows = [...rows].sort((a, b) => {
      const av = a[col]; const bv = b[col];
      if (av === bv) return 0;
      return ascending ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }
  return rows;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => builder(),
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "u-stamper",
            email: "stamper@example.com",
            user_metadata: { full_name: "Stamper Person" },
          },
        },
      }),
    },
  },
}));

import { listSignoffs, createSignoff, voidSignoff, SIGNOFF_STAMP_TYPES } from "../signoffs.js";

beforeEach(() => {
  store = [];
  lastInsert = null;
  lastUpdate = null;
  lastFilter = null;
});

describe("createSignoff", () => {
  it("requires projectId, drawingId, drawingRevisionId, stampType", async () => {
    await expect(createSignoff({})).rejects.toThrow(/projectId required/);
    await expect(createSignoff({ projectId: "p" })).rejects.toThrow(/drawingId required/);
    await expect(createSignoff({ projectId: "p", drawingId: "d" })).rejects.toThrow(/drawingRevisionId required/);
    await expect(createSignoff({
      projectId: "p", drawingId: "d", drawingRevisionId: "r",
    })).rejects.toThrow(/stampType/);
  });

  it("rejects unknown stampType", async () => {
    await expect(createSignoff({
      projectId: "p", drawingId: "d", drawingRevisionId: "r", stampType: "bogus",
    })).rejects.toThrow(/stampType "bogus" not one of/);
  });

  it("accepts every value in SIGNOFF_STAMP_TYPES", async () => {
    for (const t of SIGNOFF_STAMP_TYPES) {
      // eslint-disable-next-line no-await-in-loop
      const row = await createSignoff({
        projectId: "p", drawingId: "d", drawingRevisionId: "r", stampType: t,
      });
      expect(row.stamp_type).toBe(t);
    }
    expect(store.length).toBe(SIGNOFF_STAMP_TYPES.length);
  });

  it("stamps stamped_by_id from the auth session and stamped_by_name from metadata", async () => {
    await createSignoff({
      projectId: "p", drawingId: "d", drawingRevisionId: "r",
      stampType: "approved_for_fabrication",
    });
    expect(lastInsert.stamped_by_id).toBe("u-stamper");
    expect(lastInsert.stamped_by_name).toBe("Stamper Person");
  });

  it("honours an explicit stampedByName override", async () => {
    await createSignoff({
      projectId: "p", drawingId: "d", drawingRevisionId: "r",
      stampType: "reviewed",
      stampedByName: "Override Name",
    });
    expect(lastInsert.stamped_by_name).toBe("Override Name");
  });

  it("truncates very long notes", async () => {
    await createSignoff({
      projectId: "p", drawingId: "d", drawingRevisionId: "r",
      stampType: "reviewed",
      notes: "x".repeat(5000),
    });
    expect(lastInsert.notes.length).toBe(4000);
  });
});

describe("voidSignoff", () => {
  it("requires id", async () => {
    await expect(voidSignoff({})).rejects.toThrow(/id required/);
  });
  it("flips is_voided=true with audit columns", async () => {
    const row = await createSignoff({
      projectId: "p", drawingId: "d", drawingRevisionId: "r", stampType: "reviewed",
    });
    await voidSignoff({ id: row.id, reason: "wrong revision" });
    expect(lastUpdate.is_voided).toBe(true);
    expect(lastUpdate.voided_reason).toBe("wrong revision");
    expect(lastUpdate.voided_by).toBe("u-stamper");
    expect(lastUpdate.voided_at).toBeTruthy();
  });
});

describe("listSignoffs", () => {
  it("requires drawingId or drawingRevisionId", async () => {
    await expect(listSignoffs({})).rejects.toThrow(/required/);
  });

  it("filters out voided rows by default", async () => {
    await createSignoff({ projectId: "p", drawingId: "d", drawingRevisionId: "r", stampType: "reviewed" });
    const row2 = await createSignoff({ projectId: "p", drawingId: "d", drawingRevisionId: "r", stampType: "rejected" });
    await voidSignoff({ id: row2.id });

    const visible = await listSignoffs({ drawingId: "d" });
    expect(visible.length).toBe(1);
    expect(visible[0].is_voided).toBe(false);
  });

  it("includeVoided returns voided rows too", async () => {
    const r1 = await createSignoff({ projectId: "p", drawingId: "d", drawingRevisionId: "r", stampType: "reviewed" });
    await voidSignoff({ id: r1.id });
    const all = await listSignoffs({ drawingId: "d", includeVoided: true });
    expect(all.length).toBe(1);
    expect(all[0].is_voided).toBe(true);
  });

  it("scopes by drawing_revision_id when both are passed", async () => {
    await createSignoff({ projectId: "p", drawingId: "d", drawingRevisionId: "rA", stampType: "reviewed" });
    await createSignoff({ projectId: "p", drawingId: "d", drawingRevisionId: "rB", stampType: "reviewed" });
    const a = await listSignoffs({ drawingId: "d", drawingRevisionId: "rA" });
    expect(a.length).toBe(1);
    expect(a[0].drawing_revision_id).toBe("rA");
  });
});
