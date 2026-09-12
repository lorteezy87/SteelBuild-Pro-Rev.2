import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationOptions } from "@tanstack/react-query";
import { SupabaseOperationError } from "@/api/client/errors";
import { normalizeThrownQueryError } from "@/lib/postgrestErrors";
import { PIECE_ARCHIVE_EXPECTED_ERRORS, reportingMeta } from "@/lib/sentry/reportedErrors";

const captureException = vi.fn();
const toastError = vi.fn();
const toastQuiet = vi.fn();

vi.mock("@sentry/react", () => ({
  captureException,
}));

vi.mock("sonner", () => ({
  toast: Object.assign(toastQuiet, { error: toastError }),
}));

const HELD = "Held or production-started pieces cannot be archived";
const GENERIC_MUTATION_TOAST = "Something went wrong. Please try again.";

type CapturedHint = {
  level?: string;
  tags?: Record<string, string>;
  fingerprint?: string[];
  extra?: Record<string, unknown>;
};

/** The single Sentry capture a failure must produce. */
function onlyCapture(): { error: unknown; hint: CapturedHint } {
  expect(captureException).toHaveBeenCalledTimes(1);
  const [error, hint] = captureException.mock.calls[0] as [unknown, CapturedHint];
  return { error, hint };
}

async function runMutation(
  options: MutationOptions<unknown, unknown, unknown, unknown>,
): Promise<unknown> {
  const { queryClientInstance } = await import("../query-client");
  return queryClientInstance
    .getMutationCache()
    .build(queryClientInstance, options)
    .execute({});
}

describe("queryClientInstance global error handlers", () => {
  beforeEach(() => {
    captureException.mockClear();
    toastError.mockClear();
    toastQuiet.mockClear();
    vi.resetModules();
  });

  it("reports query failures to Sentry and toasts when there is no cached data", async () => {
    const { queryClientInstance } = await import("../query-client");
    const err = new Error("load failed");
    // Drive the QueryCache onError path via a failing query with no data.
    await expect(
      queryClientInstance.fetchQuery({
        queryKey: ["query-client-test", "empty"],
        queryFn: async () => {
          throw err;
        },
        retry: false,
      }),
    ).rejects.toThrow("load failed");

    const { error, hint } = onlyCapture();
    expect(error).toBe(err);
    expect(hint.tags).toEqual({
      source: "react-query",
      action: "query-client-test",
      action_source: "key",
      pg_code: "none",
      classification: "query-always-reported",
    });
    expect(hint.extra).toEqual({ queryKey: ["query-client-test", "empty"] });
    expect(toastError).toHaveBeenCalledWith("Could not load data. Please try again.");
  });

  it("reports mutation failures to Sentry and toasts only when onError is absent", async () => {
    const err = new Error("save failed");

    await expect(
      runMutation({
        mutationKey: ["query-client-test", "mutation"],
        mutationFn: async () => {
          throw err;
        },
      }),
    ).rejects.toThrow("save failed");

    // T11: the key names the action.
    const { error, hint } = onlyCapture();
    expect(error).toBe(err);
    expect(hint.level).toBeUndefined();
    expect(hint.tags).toEqual({
      source: "react-query-mutation",
      action: "query-client-test.mutation",
      action_source: "key",
      pg_code: "none",
      classification: "no-local-handler",
    });
    expect(hint.extra).toEqual({ mutationKey: ["query-client-test", "mutation"] });
    expect(toastError).toHaveBeenCalledWith(GENERIC_MUTATION_TOAST);
  });

  it("does not double-toast mutations that already define onError", async () => {
    const localOnError = vi.fn();

    await expect(
      runMutation({
        mutationKey: ["query-client-test", "handled"],
        mutationFn: async () => {
          throw new Error("handled");
        },
        onError: localOnError,
      }),
    ).rejects.toThrow("handled");

    expect(localOnError).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  // T6 — Sentry JAVASCRIPT-REACT-2D.
  it("reports an opted-in, user-explained guard as a tagged info event, not a crash", async () => {
    const localOnError = vi.fn();
    const guard = normalizeThrownQueryError({ code: "P0001", message: HELD });

    await expect(
      runMutation({
        meta: reportingMeta("pieceRegister.archive", PIECE_ARCHIVE_EXPECTED_ERRORS),
        mutationFn: async () => {
          throw guard;
        },
        onError: localOnError,
      }),
    ).rejects.toBe(guard);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      guard,
      expect.objectContaining({
        level: "info",
        fingerprint: ["expected", "pieceRegister.archive", "piece-archive.held-or-started"],
        tags: expect.objectContaining({
          source: "react-query-mutation",
          expected: "true",
          expected_rule: "piece-archive.held-or-started",
          action: "pieceRegister.archive",
          action_source: "meta",
          pg_code: "P0001",
          classification: "matched-rule",
        }),
      }),
    );
    expect(localOnError).toHaveBeenCalledWith(guard, {}, undefined, expect.anything());
    expect(toastError).not.toHaveBeenCalled();
  });

  // T7
  it("still reports an unexpected P0001 on an opted-in screen as an error", async () => {
    const localOnError = vi.fn();
    const invariant = normalizeThrownQueryError({
      code: "P0001",
      message: "Piece events are immutable",
    });

    await expect(
      runMutation({
        meta: reportingMeta("pieceRegister.archive", PIECE_ARCHIVE_EXPECTED_ERRORS),
        mutationFn: async () => {
          throw invariant;
        },
        onError: localOnError,
      }),
    ).rejects.toBe(invariant);

    const { error, hint } = onlyCapture();
    expect(error).toBe(invariant);
    expect(hint.level).toBeUndefined();
    expect(hint.fingerprint).toBeUndefined();
    expect(hint.tags).toEqual({
      source: "react-query-mutation",
      action: "pieceRegister.archive",
      action_source: "meta",
      pg_code: "P0001",
      classification: "no-rule-match",
    });
    expect(hint.tags).not.toHaveProperty("expected");
    expect(localOnError).toHaveBeenCalled();
  });

  // T8
  it("reports a matching guard at error level when nothing on screen explains it", async () => {
    const guard = normalizeThrownQueryError({ code: "P0001", message: HELD });

    await expect(
      runMutation({
        meta: {
          ...reportingMeta("pieceRegister.archive", PIECE_ARCHIVE_EXPECTED_ERRORS),
          suppressGlobalErrorToast: false,
        },
        mutationFn: async () => {
          throw guard;
        },
      }),
    ).rejects.toBe(guard);

    const { hint } = onlyCapture();
    expect(hint.level).toBeUndefined();
    expect(hint.tags).toMatchObject({ classification: "no-local-handler", pg_code: "P0001" });
    expect(hint.tags).not.toHaveProperty("expected");
    expect(toastError).toHaveBeenCalledWith(GENERIC_MUTATION_TOAST);
  });

  // T9
  it("reports a bug thrown in onMutate even on an opted-in mutation", async () => {
    const localOnError = vi.fn();
    const mutationFn = vi.fn();
    const bug = new TypeError("Cannot read properties of undefined (reading 'id')");

    await expect(
      runMutation({
        meta: reportingMeta("pieceRegister.archive", PIECE_ARCHIVE_EXPECTED_ERRORS),
        onMutate: () => {
          throw bug;
        },
        mutationFn,
        onError: localOnError,
      }),
    ).rejects.toBe(bug);

    const { error, hint } = onlyCapture();
    expect(error).toBe(bug);
    expect(hint.level).toBeUndefined();
    expect(hint.tags).toMatchObject({
      action: "pieceRegister.archive",
      pg_code: "none",
      classification: "no-code",
    });
    expect(mutationFn).not.toHaveBeenCalled();
    expect(localOnError).toHaveBeenCalled();
  });

  // T10
  it("reports a matching guard at error level when the raw rejection is a plain object", async () => {
    const localOnError = vi.fn();
    const plain = { code: "P0001", message: HELD };

    await expect(
      runMutation({
        meta: reportingMeta("pieceRegister.archive", PIECE_ARCHIVE_EXPECTED_ERRORS),
        mutationFn: async () => {
          throw plain;
        },
        onError: localOnError,
      }),
    ).rejects.toBe(plain);

    const { error, hint } = onlyCapture();
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBe(plain);
    expect(hint.level).toBeUndefined();
    expect(hint.tags).toMatchObject({ classification: "raw-not-error", pg_code: "P0001" });
    expect(hint.tags).not.toHaveProperty("expected");
  });

  // T11
  it("names an unlabelled entity-client mutation by table and operation", async () => {
    const collision = new SupabaseOperationError("rfis", "update", {
      code: "23505",
      message: 'duplicate key value violates unique constraint "uq_rfis_project_number"',
    });

    await expect(
      runMutation({
        mutationFn: async () => {
          throw collision;
        },
      }),
    ).rejects.toBe(collision);

    const { hint } = onlyCapture();
    expect(hint.level).toBeUndefined();
    expect(hint.tags).toMatchObject({
      action: "db:rfis.update",
      action_source: "db",
      pg_code: "23505",
    });
  });

  // T11
  it("names a bare mutation 'unnamed' so it can be found and labelled", async () => {
    await expect(
      runMutation({
        mutationFn: async () => {
          throw new Error("bare");
        },
      }),
    ).rejects.toThrow("bare");

    const { hint } = onlyCapture();
    expect(hint.tags).toMatchObject({ action: "unnamed", action_source: "none" });
    expect(hint.extra).toEqual({ mutationKey: undefined });
  });

  // T12
  it("never downgrades a query, even one whose meta lists expected errors", async () => {
    const { queryClientInstance } = await import("../query-client");
    const guard = normalizeThrownQueryError({ code: "P0001", message: HELD });

    await expect(
      queryClientInstance.fetchQuery({
        queryKey: ["piece-register", "p1"],
        queryFn: async () => {
          throw guard;
        },
        meta: { expectedErrors: PIECE_ARCHIVE_EXPECTED_ERRORS },
        retry: false,
      }),
    ).rejects.toBe(guard);

    const { error, hint } = onlyCapture();
    expect(error).toBe(guard);
    expect(hint.level).toBeUndefined();
    expect(hint.fingerprint).toBeUndefined();
    expect(hint.tags).toEqual({
      source: "react-query",
      action: "piece-register",
      action_source: "key",
      pg_code: "P0001",
      classification: "query-always-reported",
    });
    expect(toastError).toHaveBeenCalledWith("Could not load data. Please try again.");
  });

  // T13
  it("still reports a mutation at error level when classification throws", async () => {
    const localOnError = vi.fn();
    const guard = normalizeThrownQueryError({ code: "P0001", message: HELD });
    const brokenRule = {
      id: "boom",
      code: "P0001",
      get message(): RegExp {
        throw new Error("boom");
      },
    };

    await expect(
      runMutation({
        meta: { action: "pieceRegister.archive", expectedErrors: [brokenRule] },
        mutationFn: async () => {
          throw guard;
        },
        onError: localOnError,
      }),
    ).rejects.toBe(guard);

    const { error, hint } = onlyCapture();
    expect(error).toBe(guard);
    expect(hint).toEqual({
      tags: { source: "react-query-mutation", classification: "classifier-failed" },
      extra: { mutationKey: undefined },
    });
    expect(localOnError).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  // T13 — query-core calls QueryCache.onError unguarded.
  it("still reports a query, rejects with its own error and toasts when naming it throws", async () => {
    const { queryClientInstance } = await import("../query-client");
    const err = new Error("load failed");
    const brokenMeta = {
      get action(): string {
        throw new Error("broken meta");
      },
    };

    await expect(
      queryClientInstance.fetchQuery({
        queryKey: ["query-client-test", "broken-meta"],
        queryFn: async () => {
          throw err;
        },
        meta: brokenMeta,
        retry: false,
      }),
    ).rejects.toBe(err);

    const { error, hint } = onlyCapture();
    expect(error).toBe(err);
    expect(hint).toEqual({
      tags: { source: "react-query", classification: "classifier-failed" },
      extra: { queryKey: ["query-client-test", "broken-meta"] },
    });
    expect(toastError).toHaveBeenCalledWith("Could not load data. Please try again.");
  });
});
