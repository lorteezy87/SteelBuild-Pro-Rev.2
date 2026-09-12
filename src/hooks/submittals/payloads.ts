import type { Insert, Update } from "@/api/supabaseClient";
import { validate } from "@/services/validation";
import type { CreateInput, CreateRoundInput } from "./types";

function throwValidationErrors(
  entity: "submittal" | "submittal_round",
  payload: Record<string, unknown>,
): void {
  const errors = validate(entity, payload, "create");
  if (errors.length > 0) {
    throw new Error(
      errors.map((error: { message: string }) => error.message).join(" "),
    );
  }
}

export function buildCreateSubmittalPayload(
  data: CreateInput,
  projectId: string | null | undefined,
): Insert<"submittals"> {
  const payload = { ...data, project_id: projectId };
  throwValidationErrors("submittal", payload);
  return payload as Insert<"submittals">;
}

export function buildCreateRoundPayload(
  data: CreateRoundInput,
  projectId: string | null | undefined,
): Insert<"submittal_rounds"> {
  const payload = { ...data, project_id: projectId };
  throwValidationErrors("submittal_round", payload);
  return payload as Insert<"submittal_rounds">;
}

export function buildRoundParentPatch(
  data: CreateRoundInput,
  roundId: string,
): Update<"submittals"> {
  return {
    current_round_id: roundId,
    total_rounds: (data.round_number as number) || 1,
    status: "Submitted",
    ball_in_court: data.ball_in_court || "EOR",
  } as Update<"submittals">;
}
