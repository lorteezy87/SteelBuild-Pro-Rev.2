import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationOptions } from "@tanstack/react-query";
import {
  PIECE_ARCHIVE_EXPECTED_ERRORS,
  classifyReportedError,
  reportingMeta,
} from "@/lib/sentry/reportedErrors";
import { archivePieceLots } from "../repository";

const rpc = vi.hoisted(() => vi.fn());
const captureException = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
vi.mock("@sentry/react", () => ({ captureException }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

/** What postgrest-js resolves `error` to: a plain object, not a thrown Error. */
function heldGuard(): {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
} {
  return {
    code: "P0001",
    message: "Held or production-started pieces cannot be archived",
    details: null,
    hint: null,
  };
}

function archiveOnePiece(): Promise<Record<string, unknown>> {
  return archivePieceLots("project-1", ["p1"], "ARCHIVE 1 PIECE", "Duplicate import");
}

function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    (): undefined => undefined,
    (error: unknown) => error,
  );
}

// T19 — Sentry JAVASCRIPT-REACT-2D. The mutation cache downgrades a guard only
// when the raw rejection is an Error (raw === normalized); a plain PostgREST
// object classifies as raw-not-error and goes back to error level.
describe("archivePieceLots", () => {
  beforeEach(() => {
    rpc.mockReset();
    captureException.mockReset();
  });

  it("rejects a database guard as a real Error carrying its SQLSTATE", async () => {
    const pgError = heldGuard();
    rpc.mockResolvedValue({ data: null, error: pgError });

    const rejection = await rejectionOf(archiveOnePiece());

    expect(rpc).toHaveBeenCalledWith("archive_piece_lots", {
      p_project_id: "project-1",
      p_piece_ids: ["p1"],
      p_confirmation: "ARCHIVE 1 PIECE",
      p_reason: "Duplicate import",
    });
    expect(rejection).toBeInstanceOf(Error);
    expect(rejection).not.toBe(pgError);
    expect(rejection).toMatchObject({ code: "P0001" });
    expect(
      classifyReportedError(rejection, {
        source: "mutation",
        rawIsError: rejection instanceof Error,
        hasLocalHandler: true,
        expectedErrors: PIECE_ARCHIVE_EXPECTED_ERRORS,
      }),
    ).toMatchObject({ verdict: "expected", ruleId: "piece-archive.held-or-started" });
  });

  it("reaches the mutation cache hook as that Error and is sent as an expected info event", async () => {
    rpc.mockResolvedValue({ data: null, error: heldGuard() });
    const { queryClientInstance } = await import("@/lib/query-client");
    const onError = vi.fn();
    const options: MutationOptions<unknown, unknown, unknown, unknown> = {
      meta: reportingMeta("pieceRegister.archive", PIECE_ARCHIVE_EXPECTED_ERRORS),
      mutationFn: archiveOnePiece,
      onError,
    };

    const rejection = await rejectionOf(
      queryClientInstance.getMutationCache().build(queryClientInstance, options).execute({}),
    );

    expect(rejection).toBeInstanceOf(Error);
    expect(rejection).toMatchObject({ code: "P0001" });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      rejection,
      expect.objectContaining({
        level: "info",
        fingerprint: ["expected", "pieceRegister.archive", "piece-archive.held-or-started"],
        tags: expect.objectContaining({
          expected: "true",
          expected_rule: "piece-archive.held-or-started",
          pg_code: "P0001",
          classification: "matched-rule",
        }),
      }),
    );
    expect(onError).toHaveBeenCalledWith(rejection, {}, undefined, expect.anything());
  });

  it("returns the RPC summary on success", async () => {
    rpc.mockResolvedValue({ data: { archived_count: 1 }, error: null });
    await expect(archiveOnePiece()).resolves.toEqual({ archived_count: 1 });
  });
});
