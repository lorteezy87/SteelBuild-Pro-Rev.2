import { describe, expect, it, vi } from "vitest";
import {
  assertProjectId,
  invalidateAfterMutation,
  toUserErrorMessage,
  type MutationResult,
} from "../standardMutation";

describe("assertProjectId", () => {
  it("accepts a non-empty string", () => {
    expect(() => assertProjectId("proj-1")).not.toThrow();
  });

  it("rejects null, undefined, and blank values", () => {
    expect(() => assertProjectId(null)).toThrow(/Select a project first/);
    expect(() => assertProjectId(undefined)).toThrow(/Select a project first/);
    expect(() => assertProjectId("   ")).toThrow(/Select a project first/);
  });

  it("uses a custom label in the error message", () => {
    expect(() => assertProjectId("", "workspace")).toThrow(/Select a workspace first/);
  });
});

describe("toUserErrorMessage", () => {
  it("reads Error.message and plain strings", () => {
    expect(toUserErrorMessage(new Error("boom"))).toBe("boom");
    expect(toUserErrorMessage("Nope")).toBe("Nope");
  });

  it("falls back when the value has no usable message", () => {
    expect(toUserErrorMessage(null)).toBe("Something went wrong");
    expect(toUserErrorMessage({ code: 42 }, "Retry later")).toBe("Retry later");
  });
});

describe("invalidateAfterMutation", () => {
  it("invalidates a single query key", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateAfterMutation({ invalidateQueries } as any, ["schedule_task", "p1"]);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["schedule_task", "p1"] });
  });

  it("invalidates multiple query keys", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateAfterMutation({ invalidateQueries } as any, [
      ["schedule_task", "p1"],
      ["drawing", "p1"],
    ]);
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});

describe("MutationResult", () => {
  it("supports ok/error discriminated unions at the type level", () => {
    const ok: MutationResult<number> = { ok: true, data: 1 };
    const fail: MutationResult = { ok: false, error: "blocked" };
    expect(ok.ok).toBe(true);
    expect(fail.ok).toBe(false);
  });
});
