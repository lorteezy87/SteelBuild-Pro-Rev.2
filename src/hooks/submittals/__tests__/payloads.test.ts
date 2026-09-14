import { beforeEach, describe, expect, it, vi } from "vitest";

const validateMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/validation", () => ({ validate: validateMock }));

import {
  buildCreateRoundPayload,
  buildCreateSubmittalPayload,
  buildRoundParentPatch,
} from "../payloads";

describe("submittal mutation payloads", () => {
  beforeEach(() => {
    validateMock.mockReset();
    validateMock.mockReturnValue([]);
  });

  it("overrides caller scope and validates the exact submittal insert", () => {
    const payload = buildCreateSubmittalPayload(
      {
        project_id: "other-project",
        submittal_number: "S-001",
        linked_rfi_ids: ["9e366246-3bc5-4dc1-bbe0-3f332e2b726c"],
      },
      "project-1",
    );

    expect(payload).toMatchObject({
      project_id: "project-1",
      submittal_number: "S-001",
      linked_rfi_ids: ["9e366246-3bc5-4dc1-bbe0-3f332e2b726c"],
    });
    expect(validateMock).toHaveBeenCalledWith(
      "submittal",
      payload,
      "create",
    );
  });

  it("keeps round payload fields and parent patch defaults unchanged", () => {
    const payload = buildCreateRoundPayload(
      {
        project_id: "other-project",
        submittal_id: "sub-1",
        round_number: 0,
        ball_in_court: "",
      },
      "project-1",
    );

    expect(payload.project_id).toBe("project-1");
    expect(buildRoundParentPatch(payload, "round-1")).toEqual({
      current_round_id: "round-1",
      total_rounds: 1,
      status: "Submitted",
      ball_in_court: "EOR",
    });
  });

  it("joins validation errors using the existing message contract", () => {
    validateMock.mockReturnValue([
      { message: "Number is required." },
      { message: "Title is required." },
    ]);

    expect(() =>
      buildCreateSubmittalPayload({}, "project-1"),
    ).toThrow("Number is required. Title is required.");
  });
});
