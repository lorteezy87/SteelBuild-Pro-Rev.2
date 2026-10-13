import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import {
  fetchEffectiveFlags,
  mapEffectiveFlags,
  type EffectiveFeatureFlagRow,
} from "../useFeatureFlag";

const rows: EffectiveFeatureFlagRow[] = [
  { flag_key: "global_on", enabled: true },
  { flag_key: "global_off", enabled: false },
  { flag_key: "null_is_off", enabled: null },
];

describe("mapEffectiveFlags", () => {
  it("maps caller-effective rows without accepting override metadata", () => {
    expect([...mapEffectiveFlags(rows)]).toEqual([
      ["global_on", true],
      ["global_off", false],
      ["null_is_off", false],
    ]);
  });

  it("skips malformed keys", () => {
    const malformed = [
      ...rows,
      { enabled: true },
      { flag_key: "", enabled: true },
    ] as EffectiveFeatureFlagRow[];

    expect(mapEffectiveFlags(malformed).size).toBe(rows.length);
  });
});

describe("fetchEffectiveFlags", () => {
  beforeEach(() => rpc.mockReset());

  it("uses the caller-scoped RPC instead of reading feature_flags", async () => {
    rpc.mockResolvedValue({ data: rows, error: null });

    await expect(fetchEffectiveFlags()).resolves.toEqual(mapEffectiveFlags(rows));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_my_feature_flags");
  });

  it("fails closed when the RPC fails", async () => {
    const error = new Error("feature flags unavailable");
    rpc.mockResolvedValue({ data: null, error });

    await expect(fetchEffectiveFlags()).rejects.toBe(error);
  });
});
