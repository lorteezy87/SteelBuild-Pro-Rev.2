import { describe, it, expect, vi, beforeEach } from "vitest";

// The whole point of numberSequencing is that official record numbers come from
// the atomic server-side RPC (get_next_sequence_number), never from a
// client-side derivation. These tests pin that contract: the happy path MUST
// call the RPC, and Math.max only ever acts as a self-heal floor alongside it.
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));
vi.mock("@/api/supabaseClient", () => ({
  entities: {},
}));

import { supabase } from "@/lib/supabase";
import { entities } from "@/api/supabaseClient";
import {
  getNextNumber,
  getNextFormattedNumber,
  previewNextNumber,
  previewNextFormattedNumber,
  displayNumber,
} from "../numberSequencing";

// Chainable stub for the self-heal write:
//   supabase.from('number_sequences').update({...}).eq(..).eq(..).lt(..)
function stubUpdateChain() {
  const lt = vi.fn().mockResolvedValue({ data: null, error: null });
  const eqRecord = vi.fn(() => ({ lt }));
  const eqProject = vi.fn(() => ({ eq: eqRecord }));
  const update = vi.fn(() => ({ eq: eqProject }));
  supabase.from.mockReturnValue({ update });
  return { update, eqProject, eqRecord, lt };
}

// Chainable stub for the non-mutating preview read:
//   supabase.from('number_sequences').select('next_value').eq(..).eq(..).single()
function stubSelectChain(nextValue) {
  const single = vi.fn().mockResolvedValue({ data: nextValue == null ? null : { next_value: nextValue }, error: null });
  const eqRecord = vi.fn(() => ({ single }));
  const eqProject = vi.fn(() => ({ eq: eqRecord }));
  const select = vi.fn(() => ({ eq: eqProject }));
  supabase.from.mockReturnValue({ select });
  return { select, single };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  for (const key of Object.keys(entities)) delete entities[key];
});

describe("getNextNumber", () => {
  it("allocates via the atomic get_next_sequence_number RPC (never client-side)", async () => {
    supabase.rpc.mockResolvedValue({ data: 7, error: null });

    const n = await getNextNumber("proj-1", "RFI");

    expect(n).toBe(7);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("get_next_sequence_number", {
      p_project_id: "proj-1",
      p_record_type: "RFI",
    });
  });

  it("retries a transient RPC error, then returns the server number", async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "timeout" } })
      .mockResolvedValueOnce({ data: 3, error: null });

    vi.useFakeTimers();
    const assertion = expect(getNextNumber("p", "RFI")).resolves.toBe(3);
    await vi.runAllTimersAsync();
    await assertion;

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed after 3 attempts, surfacing the last error (never invents a number)", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    vi.useFakeTimers();
    const assertion = expect(getNextNumber("p", "RFI")).rejects.toThrow(
      /Failed to allocate sequence number for RFI after 3 retries: boom/,
    );
    await vi.runAllTimersAsync();
    await assertion;

    expect(supabase.rpc).toHaveBeenCalledTimes(3);
  });

  it("validates required args before hitting the network", async () => {
    await expect(getNextNumber()).rejects.toThrow("projectId is required");
    await expect(getNextNumber("p")).rejects.toThrow("recordType is required");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("getNextFormattedNumber", () => {
  it("formats the RPC value and does NOT self-heal when the sequence is ahead", async () => {
    entities.RFI = { filter: vi.fn().mockResolvedValue([]) };
    supabase.rpc.mockResolvedValue({ data: 5, error: null });
    const { update } = stubUpdateChain();

    const result = await getNextFormattedNumber({
      projectId: "p",
      recordType: "RFI",
      entityName: "RFI",
      fieldName: "rfi_number",
      prefix: "RFI-",
      padLength: 3,
    });

    expect(result).toBe("RFI-005");
    expect(update).not.toHaveBeenCalled(); // 5 == max(5, 0+1), nothing to fast-forward
  });

  it("self-heals the sequence forward when existing records are ahead of the RPC", async () => {
    entities.RFI = {
      filter: vi.fn().mockResolvedValue([{ rfi_number: "RFI-010" }, { rfi_number: "RFI-007" }]),
    };
    supabase.rpc.mockResolvedValue({ data: 5, error: null });
    const { update } = stubUpdateChain();

    const result = await getNextFormattedNumber({
      projectId: "p",
      recordType: "RFI",
      entityName: "RFI",
      fieldName: "rfi_number",
      prefix: "RFI-",
      padLength: 3,
    });

    expect(result).toBe("RFI-011"); // max(5, 10 + 1)
    expect(supabase.from).toHaveBeenCalledWith("number_sequences");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ next_value: 12 }));
  });

  it("falls back to the record scan when sequence allocation fails", async () => {
    entities.RFI = { filter: vi.fn().mockResolvedValue([{ rfi_number: "RFI-004" }]) };
    supabase.rpc.mockResolvedValue({ data: null, error: { message: "down" } });

    vi.useFakeTimers();
    const assertion = expect(
      getNextFormattedNumber({
        projectId: "p",
        recordType: "RFI",
        entityName: "RFI",
        fieldName: "rfi_number",
        prefix: "RFI-",
      }),
    ).resolves.toBe("RFI-005"); // maxFromRecords(4) + 1, padLength defaults to 3
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("accepts positional args and validates required fields", async () => {
    await expect(
      getNextFormattedNumber({ recordType: "RFI", entityName: "RFI", fieldName: "n", prefix: "R-" }),
    ).rejects.toThrow("projectId is required");

    entities.RFI = { filter: vi.fn().mockResolvedValue([]) };
    supabase.rpc.mockResolvedValue({ data: 2, error: null });
    stubUpdateChain();

    const result = await getNextFormattedNumber("p", "RFI", "RFI", "rfi_number", "RFI-", 3);
    expect(result).toBe("RFI-002");
  });
});

describe("previewNextNumber", () => {
  it("reads next_value without allocating (no RPC call)", async () => {
    stubSelectChain(9);

    const v = await previewNextNumber("p", "RFI");

    expect(v).toBe(9);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("defaults to 1 when the sequence row is missing", async () => {
    stubSelectChain(null);
    expect(await previewNextNumber("p", "RFI")).toBe(1);
  });

  it("returns null when project or recordType is missing", async () => {
    expect(await previewNextNumber()).toBeNull();
    expect(await previewNextNumber("p")).toBeNull();
  });
});

describe("previewNextFormattedNumber", () => {
  it("formats the previewed sequence value", async () => {
    stubSelectChain(12);

    const result = await previewNextFormattedNumber({
      projectId: "p",
      recordType: "RFI",
      entityName: "RFI",
      fieldName: "rfi_number",
      prefix: "RFI-",
    });

    expect(result).toBe("RFI-012");
  });

  it("returns null when a required field is missing", async () => {
    expect(
      await previewNextFormattedNumber({ projectId: "p", recordType: "RFI", entityName: "RFI", fieldName: "n" }),
    ).toBeNull();
  });
});

describe("displayNumber", () => {
  it("returns an empty string for a falsy number", () => {
    expect(displayNumber("", { name: "Henderson Plant" })).toBe("");
    expect(displayNumber(null, { name: "Henderson Plant" })).toBe("");
  });

  it("returns the bare number when omitProject or no project", () => {
    expect(displayNumber("RFI-001", { name: "Henderson Plant" }, true)).toBe("RFI-001");
    expect(displayNumber("RFI-001", null)).toBe("RFI-001");
  });

  it("appends the project short name", () => {
    expect(displayNumber("RFI-001", { name: "Henderson Plant Expansion" })).toBe("RFI-001 · Henderson");
  });
});
