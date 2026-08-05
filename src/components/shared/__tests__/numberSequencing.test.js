import { describe, it, expect, vi, beforeEach } from "vitest";

// The whole point of numberSequencing is that official record numbers come from
// the atomic server-side RPC (get_next_sequence_number), never from a
// client-side derivation. These tests pin that contract: every allocated number
// comes from the RPC (which serializes concurrent callers into DISTINCT values).
// When a sequence trails existing records, the client RE-ALLOCATES from the RPC
// until it clears the existing max — it never floors with a client-side Math.max
// (that reintroduced duplicates under concurrency) and never invents a number.
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
  it("formats the RPC value directly when the sequence is ahead of existing records", async () => {
    entities.RFI = { filter: vi.fn().mockResolvedValue([]) };
    supabase.rpc.mockResolvedValue({ data: 5, error: null });

    const result = await getNextFormattedNumber({
      projectId: "p",
      recordType: "RFI",
      entityName: "RFI",
      fieldName: "rfi_number",
      prefix: "RFI-",
      padLength: 3,
    });

    expect(result).toBe("RFI-005");
    expect(supabase.rpc).toHaveBeenCalledTimes(1); // ahead of records → no re-allocation
    expect(supabase.from).not.toHaveBeenCalled();  // never writes a number client-side
  });

  it("re-allocates from the atomic RPC past existing record numbers (no client-side floor / self-heal write)", async () => {
    entities.RFI = {
      filter: vi.fn().mockResolvedValue([{ rfi_number: "RFI-010" }, { rfi_number: "RFI-007" }]),
    };
    // Sequence trails the data: the atomic RPC hands out 5,6,7,… — each distinct.
    let seq = 4;
    supabase.rpc.mockImplementation(() => Promise.resolve({ data: ++seq, error: null }));
    stubUpdateChain(); // lets the old client-Math.max path run to completion for a clean assertion

    const result = await getNextFormattedNumber({
      projectId: "p",
      recordType: "RFI",
      entityName: "RFI",
      fieldName: "rfi_number",
      prefix: "RFI-",
      padLength: 3,
    });

    expect(result).toBe("RFI-011"); // first RPC value that clears the existing max of 10
    expect(supabase.from).not.toHaveBeenCalled(); // no client-side Math.max / self-heal write
  });

  it("issues DISTINCT numbers to concurrent callers even when the sequence is behind the data", async () => {
    entities.RFI = { filter: vi.fn().mockResolvedValue([{ rfi_number: "RFI-010" }]) };
    let seq = 0;
    supabase.rpc.mockImplementation(() => Promise.resolve({ data: ++seq, error: null }));
    stubUpdateChain(); // lets the old (buggy) client-Math.max path run to completion

    const a = await getNextFormattedNumber({
      projectId: "p", recordType: "RFI", entityName: "RFI", fieldName: "rfi_number", prefix: "RFI-",
    });
    const b = await getNextFormattedNumber({
      projectId: "p", recordType: "RFI", entityName: "RFI", fieldName: "rfi_number", prefix: "RFI-",
    });

    // The removed client-side Math.max floored BOTH callers to RFI-011 — a
    // duplicate official number. The atomic RPC is now the sole allocator, so
    // every allocation is distinct.
    expect(a).not.toBe(b);
    expect(a).toBe("RFI-011"); // first caller burns the stale 1..10, lands on 11
    expect(b).toBe("RFI-012"); // second caller gets the next distinct RPC value
  });

  it("fails closed when the RPC is unavailable (never invents a client-side number)", async () => {
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
    ).rejects.toThrow(/Failed to allocate sequence number for RFI/);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("accepts positional args and validates required fields", async () => {
    await expect(
      getNextFormattedNumber({ recordType: "RFI", entityName: "RFI", fieldName: "n", prefix: "R-" }),
    ).rejects.toThrow("projectId is required");

    entities.RFI = { filter: vi.fn().mockResolvedValue([]) };
    supabase.rpc.mockResolvedValue({ data: 2, error: null });

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
