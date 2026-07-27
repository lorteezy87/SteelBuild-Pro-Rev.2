import { describe, expect, it, vi } from "vitest";
import {
  assertProjectId,
  invalidateAfterMutation,
  toUserErrorMessage,
  withProjectId,
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

describe("withProjectId", () => {
  it("stamps the active project id", () => {
    expect(withProjectId({ name: "x" }, "proj-1")).toEqual({ name: "x", project_id: "proj-1" });
  });

  it("forces a mismatched project_id onto the active project", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(withProjectId({ project_id: "other", name: "x" }, "active")).toEqual({
      project_id: "active",
      name: "x",
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("throws when no active project is selected", () => {
    expect(() => withProjectId({ name: "x" }, null)).toThrow(/Select a project first/);
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
