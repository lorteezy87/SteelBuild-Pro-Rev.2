import { describe, expect, it, vi } from "vitest";
import {
  FabReleaseBlockedError,
  deriveReleaseStatus,
  evaluateFabReleasePackage,
  isFabReleaseBlocked,
  parseBlockedRfiNumbers,
  recordFabRelease,
} from "../releaseStatus";

// Minimal supabase mock: from(...).insert(...).select().single() + rpc().
function mockSupabase(
  result: { data?: any; error?: any },
  rpcResult: { data?: any; error?: any } = { data: [], error: null },
) {
  const single = vi.fn(async () => result);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  const rpc = vi.fn(async () => rpcResult);
  return { client: { from, rpc } as any, from, insert, rpc };
}

describe("parseBlockedRfiNumbers", () => {
  it("extracts the RFI numbers from the server message", () => {
    expect(
      parseBlockedRfiNumbers(
        "FAB_RELEASE_BLOCKED: 2 open RFI(s) reference sheets in this package (RFI-001, RFI #002). Resolve them or release with an override reason.",
      ),
    ).toEqual(["RFI-001", "RFI #002"]);
  });
  it("returns [] when there is no parenthetical", () => {
    expect(parseBlockedRfiNumbers("nope")).toEqual([]);
    expect(parseBlockedRfiNumbers("")).toEqual([]);
  });
});

describe("isFabReleaseBlocked", () => {
  it("matches the gate exception by message / details / hint", () => {
    expect(isFabReleaseBlocked({ message: "FAB_RELEASE_BLOCKED: 1 open RFI(s)…" })).toBe(true);
    expect(isFabReleaseBlocked({ details: "FAB_RELEASE_BLOCKED: x" })).toBe(true);
  });
  it("is false for other errors", () => {
    expect(isFabReleaseBlocked({ message: "new row violates row-level security policy" })).toBe(false);
    expect(isFabReleaseBlocked(null)).toBe(false);
    expect(isFabReleaseBlocked(new Error("network"))).toBe(false);
  });
});

describe("deriveReleaseStatus", () => {
  it("clean when not blocked, regardless of override", () => {
    expect(deriveReleaseStatus({ blocked: false }, false)).toBe("clean");
    expect(deriveReleaseStatus({ blocked: false }, true)).toBe("clean");
    expect(deriveReleaseStatus(null, false)).toBe("clean");
  });
  it("blocked vs overridden when blocked", () => {
    expect(deriveReleaseStatus({ blocked: true }, false)).toBe("blocked");
    expect(deriveReleaseStatus({ blocked: true }, true)).toBe("overridden");
  });
});

describe("evaluateFabReleasePackage", () => {
  it("returns structured blockers from the RPC", async () => {
    const { client, rpc } = mockSupabase(
      { data: null, error: null },
      {
        data: [
          {
            kind: "revision_conflict",
            title: "1 sheet(s) with a superseded revision",
            sheet_numbers: ["S-101"],
            rfi_numbers: [],
          },
        ],
        error: null,
      },
    );
    const blockers = await evaluateFabReleasePackage(client, ["d1", "d2"]);
    expect(rpc).toHaveBeenCalledWith("evaluate_fab_release_package", {
      p_drawing_ids: ["d1", "d2"],
    });
    expect(blockers).toHaveLength(1);
    expect(blockers[0].kind).toBe("revision_conflict");
  });

  it("fails closed when the RPC errors", async () => {
    const { client } = mockSupabase(
      { data: null, error: null },
      { data: null, error: { message: "rpc unavailable" } },
    );
    await expect(evaluateFabReleasePackage(client, ["d1"])).rejects.toThrow(/rpc unavailable|Could not evaluate/i);
  });
});

describe("recordFabRelease", () => {
  const baseInput = {
    projectId: "p1",
    packageKind: "fab_release" as const,
    packageName: "Main Steel - IFC",
    drawingIds: ["d1", "", "d2", null as unknown as string],
  };

  it("inserts a clean release and returns the server record", async () => {
    const record = { id: "r1", project_id: "p1", drawing_ids: ["d1", "d2"], blocking_rfi_numbers: [] as string[], override_reason: null as string | null };
    const { client, from, insert, rpc } = mockSupabase({ data: record, error: null });
    const out = await recordFabRelease(client, baseInput);
    expect(out).toBe(record);
    expect(rpc).toHaveBeenCalledWith("evaluate_fab_release_package", {
      p_drawing_ids: ["d1", "d2"],
    });
    expect(from).toHaveBeenCalledWith("fab_release_log");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "p1",
        package_kind: "fab_release",
        package_name: "Main Steel - IFC",
        drawing_ids: ["d1", "d2"],
        drawing_count: 2,
        override_reason: null,
      }),
    );
  });

  it("evaluates packageDrawingIds when provided (sibling supersession path)", async () => {
    const { client, rpc, insert } = mockSupabase({ data: { id: "r1" }, error: null });
    await recordFabRelease(client, {
      ...baseInput,
      packageDrawingIds: ["pkg-1", "pkg-2", "pkg-3"],
    });
    expect(rpc).toHaveBeenCalledWith("evaluate_fab_release_package", {
      p_drawing_ids: ["pkg-1", "pkg-2", "pkg-3"],
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ drawing_ids: ["d1", "d2"] }));
  });

  it("blocks before insert when package preflight returns blockers", async () => {
    const { client, insert } = mockSupabase(
      { data: null, error: null },
      {
        data: [
          {
            kind: "rejected_sheets",
            title: "1 rejected / revise-and-resubmit sheet(s)",
            sheet_numbers: ["S-200"],
            rfi_numbers: [],
          },
        ],
        error: null,
      },
    );
    await expect(recordFabRelease(client, baseInput)).rejects.toBeInstanceOf(FabReleaseBlockedError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("skips package preflight when an override reason is supplied", async () => {
    const { client, rpc, insert } = mockSupabase({ data: { id: "r2" }, error: null });
    await recordFabRelease(client, { ...baseInput, overrideReason: "  accept rework risk  " });
    expect(rpc).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ override_reason: "accept rework risk" }));

    const m2 = mockSupabase({ data: { id: "r3" }, error: null });
    await recordFabRelease(m2.client, { ...baseInput, overrideReason: "   " });
    expect(m2.rpc).toHaveBeenCalled();
    expect(m2.insert).toHaveBeenCalledWith(expect.objectContaining({ override_reason: null }));
  });

  it("throws FabReleaseBlockedError (with parsed RFIs) when the insert trigger refuses", async () => {
    const { client } = mockSupabase({
      data: null,
      error: { message: "FAB_RELEASE_BLOCKED: 2 open RFI(s) reference sheets in this package (RFI-001, RFI-002). Resolve them or release with an override reason." },
    });
    await expect(recordFabRelease(client, { ...baseInput, overrideReason: "force" })).rejects.toBeInstanceOf(
      FabReleaseBlockedError,
    );
    try {
      await recordFabRelease(client, { ...baseInput, overrideReason: "force" });
    } catch (err) {
      expect((err as FabReleaseBlockedError).blockingRfiNumbers).toEqual(["RFI-001", "RFI-002"]);
    }
  });

  it("rethrows non-gate errors unchanged (e.g. an RLS role denial)", async () => {
    const rlsErr = { message: "new row violates row-level security policy for table \"fab_release_log\"" };
    const { client } = mockSupabase({ data: null, error: rlsErr });
    await expect(recordFabRelease(client, { ...baseInput, overrideReason: "force" })).rejects.not.toBeInstanceOf(
      FabReleaseBlockedError,
    );
    await expect(recordFabRelease(client, { ...baseInput, overrideReason: "force" })).rejects.toBe(rlsErr);
  });
});
