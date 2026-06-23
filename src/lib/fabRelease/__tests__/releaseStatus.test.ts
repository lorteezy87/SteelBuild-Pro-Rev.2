import { describe, expect, it, vi } from "vitest";
import {
  FabReleaseBlockedError,
  deriveReleaseStatus,
  isFabReleaseBlocked,
  parseBlockedRfiNumbers,
  recordFabRelease,
} from "../releaseStatus";

// Minimal supabase mock: from(...).insert(...).select().single() -> {data,error}.
function mockSupabase(result: { data?: any; error?: any }) {
  const single = vi.fn(async () => result);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as any, from, insert };
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

describe("recordFabRelease", () => {
  const baseInput = {
    projectId: "p1",
    packageKind: "fab_release" as const,
    packageName: "Main Steel - IFC",
    drawingIds: ["d1", "", "d2", null as unknown as string],
  };

  it("inserts a clean release and returns the server record", async () => {
    const record = { id: "r1", project_id: "p1", drawing_ids: ["d1", "d2"], blocking_rfi_numbers: [] as string[], override_reason: null as string | null };
    const { client, from, insert } = mockSupabase({ data: record, error: null });
    const out = await recordFabRelease(client, baseInput);
    expect(out).toBe(record);
    expect(from).toHaveBeenCalledWith("fab_release_log");
    // falsy drawing ids filtered; drawing_count derived; clean → override_reason null.
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

  it("trims a provided override reason (whitespace-only → null)", async () => {
    const { client, insert } = mockSupabase({ data: { id: "r2" }, error: null });
    await recordFabRelease(client, { ...baseInput, overrideReason: "  accept rework risk  " });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ override_reason: "accept rework risk" }));

    const m2 = mockSupabase({ data: { id: "r3" }, error: null });
    await recordFabRelease(m2.client, { ...baseInput, overrideReason: "   " });
    expect(m2.insert).toHaveBeenCalledWith(expect.objectContaining({ override_reason: null }));
  });

  it("throws FabReleaseBlockedError (with parsed RFIs) when the gate refuses", async () => {
    const { client } = mockSupabase({
      data: null,
      error: { message: "FAB_RELEASE_BLOCKED: 2 open RFI(s) reference sheets in this package (RFI-001, RFI-002). Resolve them or release with an override reason." },
    });
    await expect(recordFabRelease(client, baseInput)).rejects.toBeInstanceOf(FabReleaseBlockedError);
    try {
      await recordFabRelease(client, baseInput);
    } catch (err) {
      expect((err as FabReleaseBlockedError).blockingRfiNumbers).toEqual(["RFI-001", "RFI-002"]);
    }
  });

  it("rethrows non-gate errors unchanged (e.g. an RLS role denial)", async () => {
    const rlsErr = { message: "new row violates row-level security policy for table \"fab_release_log\"" };
    const { client } = mockSupabase({ data: null, error: rlsErr });
    await expect(recordFabRelease(client, baseInput)).rejects.not.toBeInstanceOf(FabReleaseBlockedError);
    await expect(recordFabRelease(client, baseInput)).rejects.toBe(rlsErr);
  });
});
