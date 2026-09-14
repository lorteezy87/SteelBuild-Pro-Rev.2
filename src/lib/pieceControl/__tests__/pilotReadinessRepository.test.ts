import { beforeEach, describe, expect, it, vi } from "vitest";
import { PIECE_MODE_EXPECTED_ERRORS, classifyReportedError } from "@/lib/sentry/reportedErrors";
import { setPieceControlMode } from "../pilotReadinessRepository";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

describe("setPieceControlMode", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  // T16: a plain PostgREST object is invisible to the expected-error
  // classifier (raw-not-error), so pilot-readiness noise would come back.
  it("rejects a database guard as a real Error carrying its SQLSTATE", async () => {
    const pgError: {
      code: string;
      message: string;
      details: string | null;
      hint: string | null;
    } = {
      code: "P0001",
      message: 'Pilot transition blocked: ["x"]',
      details: null,
      hint: null,
    };
    rpc.mockResolvedValue({ data: null, error: pgError });

    const rejection: unknown = await setPieceControlMode(
      "project-1",
      "pilot",
      "CHANGE SHADOW TO PILOT",
    ).then(
      (): undefined => undefined,
      (error: unknown) => error,
    );

    expect(rpc).toHaveBeenCalledWith("set_piece_control_mode", {
      p_project_id: "project-1",
      p_next_mode: "pilot",
      p_confirmation: "CHANGE SHADOW TO PILOT",
    });
    expect(rejection).toBeInstanceOf(Error);
    expect(rejection).not.toBe(pgError);
    expect(rejection).toMatchObject({ code: "P0001" });
    expect((rejection as Error).message).toMatch(/^Pilot transition blocked: /);
    expect(
      classifyReportedError(rejection, {
        source: "mutation",
        rawIsError: rejection instanceof Error,
        hasLocalHandler: true,
        expectedErrors: PIECE_MODE_EXPECTED_ERRORS,
      }),
    ).toMatchObject({ verdict: "expected", ruleId: "piece-mode.pilot-blocked" });
  });

  it("resolves on success and still unwraps a structured failure", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await expect(
      setPieceControlMode("project-1", "shadow", "CHANGE OFF TO SHADOW"),
    ).resolves.toBeUndefined();

    rpc.mockResolvedValueOnce({
      data: { ok: false, error_message: "Piece control is disabled for this project" },
      error: null,
    });
    await expect(
      setPieceControlMode("project-1", "shadow", "CHANGE OFF TO SHADOW"),
    ).rejects.toThrow("Piece control is disabled for this project");
  });
});
