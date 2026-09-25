import { describe, it, expect, vi, beforeEach } from "vitest";

// Stable mock object — the engine captures `supabase` once at import, then
// reads `.from` / `.functions.invoke` off it at call time, so per-test we just
// repoint those two members.
const env = vi.hoisted(() => ({ supabase: { from: null, rpc: null, functions: { invoke: null } } }));
vi.mock("@/lib/supabase", () => ({ supabase: env.supabase }));

import {
  normalizeDeltaType,
  normalizeSeverity,
  coerceDeltas,
  buildDiffMessages,
  sortDeltasBySeverity,
  generateRevisionDiff,
  recordVisualRevisionReview,
} from "@/lib/revisionSnapshotDiff";

// ── pure helpers ──────────────────────────────────────────────────────────

describe("normalizeDeltaType", () => {
  it("passes canonical values straight through", () => {
    expect(normalizeDeltaType("connection_change")).toBe("connection_change");
    expect(normalizeDeltaType("material_change")).toBe("material_change");
  });
  it("coerces loose AI phrasing into the CHECK-constrained set", () => {
    expect(normalizeDeltaType("Connection Change")).toBe("connection_change");
    expect(normalizeDeltaType("grid shift")).toBe("grid_shift");
    expect(normalizeDeltaType("dimension")).toBe("dimension_change");
    expect(normalizeDeltaType("material")).toBe("material_change");
    expect(normalizeDeltaType("elevation")).toBe("elevation_change");
    expect(normalizeDeltaType("sheet added")).toBe("sheet_added");
    expect(normalizeDeltaType("callout add")).toBe("callout_added");
    expect(normalizeDeltaType("callout")).toBe("callout_removed");
  });
  it("falls back to 'other' for empty / unknown", () => {
    expect(normalizeDeltaType("")).toBe("other");
    expect(normalizeDeltaType(undefined)).toBe("other");
    expect(normalizeDeltaType("something weird")).toBe("other");
  });
});

describe("normalizeSeverity", () => {
  it("passes canonical values through and coerces prefixes", () => {
    expect(normalizeSeverity("critical")).toBe("critical");
    expect(normalizeSeverity("Crit")).toBe("critical");
    expect(normalizeSeverity("HIGH")).toBe("high");
    expect(normalizeSeverity("med")).toBe("medium");
    expect(normalizeSeverity("lo")).toBe("low");
  });
  it("falls back to 'info' for empty / unknown", () => {
    expect(normalizeSeverity("")).toBe("info");
    expect(normalizeSeverity(undefined)).toBe("info");
    expect(normalizeSeverity("banana")).toBe("info");
  });
});

describe("coerceDeltas", () => {
  it("drops empty-description deltas and normalizes type/severity", () => {
    const rows = coerceDeltas({
      deltas: [
        { sheet_number: "S2.1", delta_type: "Material Change", severity: "Critical", description: "W24x76 -> W24x94" },
        { sheet_number: "S2.1", delta_type: "noise", severity: "x", description: "   " }, // dropped: blank description
        { delta_type: "grid", severity: "hi", description: "Grid B moved 6\"" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ sheet_number: "S2.1", delta_type: "material_change", severity: "critical" });
    expect(rows[1]).toMatchObject({ delta_type: "grid_shift", severity: "high" });
  });
  it("clamps oversized fields and tolerates a missing deltas array", () => {
    const long = "x".repeat(5000);
    const [row] = coerceDeltas({ deltas: [{ delta_type: "other", severity: "low", description: long, recommended_action: long, sheet_number: long }] });
    expect(row.description.length).toBe(2000);
    expect(row.recommended_action.length).toBe(1000);
    expect(row.sheet_number.length).toBe(64);
    expect(coerceDeltas({})).toEqual([]);
    expect(coerceDeltas(null)).toEqual([]);
  });
});

describe("buildDiffMessages", () => {
  it("emits one user message: text + two base64 image blocks in FROM→TO order", () => {
    const msgs = buildDiffMessages({
      fromImageB64: "AAAA", toImageB64: "BBBB",
      fromLabel: "Rev 2", toLabel: "Rev 3", sheetNumber: "S2.1",
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    const images = msgs[0].content.filter((b) => b.type === "image");
    expect(images).toHaveLength(2);
    // The gateway's OpenAI adapter keys on exactly this block shape.
    expect(images[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } });
    expect(images[1].source.data).toBe("BBBB");
    expect(msgs[0].content[0].text).toContain("S2.1");
  });
});

describe("sortDeltasBySeverity", () => {
  it("orders critical → info, stable within a severity", () => {
    const out = sortDeltasBySeverity([
      { id: "a", severity: "low", created_at: "2026-01-01" },
      { id: "b", severity: "critical", created_at: "2026-01-02" },
      { id: "c", severity: "high", created_at: "2026-01-01" },
      { id: "d", severity: "critical", created_at: "2026-01-01" },
    ]);
    expect(out.map((d) => d.id)).toEqual(["d", "b", "c", "a"]);
  });
});

// ── orchestration (tight Supabase mock) ─────────────────────────────────────

/** One shared builder per table so calls accumulate across repeated from(table). */
function makeBuilder(resolved) {
  const calls = { insert: [], update: [], delete: 0 };
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    insert: (rows) => { calls.insert.push(rows); return builder; },
    update: (patch) => { calls.update.push(patch); return builder; },
    delete: () => { calls.delete += 1; return builder; },
    maybeSingle: () => Promise.resolve({ data: resolved.maybeSingle ?? null, error: null }),
    single: () => Promise.resolve({ data: resolved.single ?? null, error: null }),
    then: (res) => res({ data: resolved.list ?? null, error: null }),
  };
  builder._calls = calls;
  return builder;
}

/**
 * The comparison tables reject direct writes — a guard trigger routes every
 * status/delta write through create_revision_comparison() and
 * record_revision_comparison(). The default rpc mock mirrors that contract so a
 * regression back to `.insert()` / `.update()` fails here instead of shipping a
 * 403 that reads as "the review found nothing".
 */
function makeRpc(overrides = {}) {
  const rpc = vi.fn((fn, args) => {
    if (fn === "create_revision_comparison") {
      return Promise.resolve({ data: overrides.created ?? { id: "c1", compare_status: "processing" }, error: null });
    }
    if (fn === "record_revision_comparison") {
      return Promise.resolve({
        data: overrides.recorded ?? { id: "c1", compare_status: args?.p_status, ai_summary: args?.p_summary ?? null },
        error: overrides.recordError ?? null,
      });
    }
    return Promise.resolve({ data: null, error: { message: `unexpected rpc: ${fn}` } });
  });
  return rpc;
}

function wireSupabase({ comparisons, deltas, invoke, rpc }) {
  const builders = {
    drawing_revision_comparisons: makeBuilder(comparisons),
    drawing_revision_deltas: makeBuilder(deltas),
  };
  env.supabase.from = (table) => builders[table] || makeBuilder({});
  env.supabase.rpc = rpc || makeRpc();
  env.supabase.functions.invoke = invoke;
  return builders;
}

describe("generateRevisionDiff", () => {
  beforeEach(() => {
    env.supabase.from = null;
    env.supabase.rpc = null;
    env.supabase.functions.invoke = null;
  });

  it("returns the cached diff without calling the LLM when the pair is already complete", async () => {
    const invoke = vi.fn();
    wireSupabase({
      comparisons: { maybeSingle: { id: "c1", compare_status: "complete", ai_summary: "Two members upsized." } },
      deltas: { list: [{ id: "d1", severity: "high" }, { id: "d2", severity: "critical" }] },
      invoke,
    });

    const res = await generateRevisionDiff({
      projectId: "p1", drawingId: "dw1", fromRevisionId: "r1", toRevisionId: "r2",
      // No images supplied on purpose — the cached path must short-circuit first.
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(res.cached).toBe(true);
    expect(res.deltas.map((d) => d.id)).toEqual(["d2", "d1"]); // severity-sorted
  });

  it("opens and records the comparison through the RPCs, never writing the tables directly", async () => {
    const invoke = vi.fn(() => Promise.resolve({
      data: {
        tool_use: { input: { summary: "Beam upsized.", deltas: [
          { sheet_number: "S2.1", delta_type: "Material Change", severity: "Critical", description: "Beam at B/2: W24x76 -> W24x94", recommended_action: "Re-cut" },
        ] } },
        raw: {},
      },
      error: null,
    }));
    const rpc = makeRpc();
    const builders = wireSupabase({
      comparisons: { maybeSingle: null },
      deltas: { list: [{ id: "d1", severity: "critical", delta_type: "material_change", dismissed: false }] },
      invoke,
      rpc,
    });

    const res = await generateRevisionDiff({
      projectId: "p1", drawingId: "dw1", fromRevisionId: "r1", toRevisionId: "r2",
      fromImageB64: "AAAA", toImageB64: "BBBB", sheetNumber: "S2.1",
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    const [fnName, { body }] = invoke.mock.calls[0];
    expect(fnName).toBe("llm-proxy");
    expect(body).toMatchObject({ useCase: "revision-compare", provider: "openai", model: "gpt-4o" });
    expect(body.messages[0].content.filter((b) => b.type === "image")).toHaveLength(2);

    // The comparison is opened by RPC, with the sheet + revision pair only —
    // project_id and the requester are stamped server-side.
    expect(rpc).toHaveBeenCalledWith("create_revision_comparison", {
      p_drawing_id: "dw1", p_from_revision_id: "r1", p_to_revision_id: "r2",
    });

    // Results go back through record_revision_comparison(), which inserts the
    // deltas itself. The AI's loose "Material Change"/"Critical" is coerced to
    // the CHECK set before it is handed over.
    const record = rpc.mock.calls.find(([fn]) => fn === "record_revision_comparison");
    expect(record).toBeTruthy();
    expect(record[1]).toMatchObject({ p_comparison_id: "c1", p_status: "complete", p_model: "gpt-4o" });
    expect(record[1].p_deltas[0]).toMatchObject({ delta_type: "material_change", severity: "critical" });

    // The guard trigger rejects these outright — the client must never try.
    expect(builders.drawing_revision_deltas._calls.insert).toHaveLength(0);
    expect(builders.drawing_revision_deltas._calls.delete).toBe(0);
    expect(builders.drawing_revision_comparisons._calls.update).toHaveLength(0);
    expect(res.cached).toBe(false);
  });

  it("rejects a self-comparison before any DB work", async () => {
    const invoke = vi.fn();
    wireSupabase({ comparisons: {}, deltas: {}, invoke });
    await expect(generateRevisionDiff({ drawingId: "dw1", fromRevisionId: "r1", toRevisionId: "r1" }))
      .rejects.toThrow(/different revisions/i);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("recordVisualRevisionReview", () => {
  beforeEach(() => {
    env.supabase.from = null;
    env.supabase.rpc = null;
    env.supabase.functions.invoke = null;
  });

  it("records visual review without invoking the LLM", async () => {
    const invoke = vi.fn();
    const rpc = makeRpc();
    wireSupabase({ comparisons: { maybeSingle: null }, deltas: {}, invoke, rpc });

    await recordVisualRevisionReview({ drawingId: "d1", fromRevisionId: "r1", toRevisionId: "r2" });

    expect(invoke).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "record_revision_comparison",
      expect.objectContaining({ p_comparison_id: "c1", p_status: "complete", p_model: "visual-review" }),
    );
  });
});
