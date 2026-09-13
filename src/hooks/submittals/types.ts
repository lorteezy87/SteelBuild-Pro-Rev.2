import type { RowWithAliases } from "@/api/supabaseClient";
import type { CommentDispositionLike } from "@/lib/commentDispositionGate";
import type { OfsChecklistState } from "@/lib/ofsCompletionGate";

export type Submittal = RowWithAliases<"submittals">;
export type SubmittalRound = RowWithAliases<"submittal_rounds">;

export interface AddRoundInput {
  submittal: {
    id: string;
    project_id: string;
    drawing_set_ids?: string[] | null;
    total_rounds?: number | null;
    round_number?: number | null;
    submitted_date?: string | null;
    status?: string | null;
    ball_in_court?: string | null;
    revision?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  status: string;
  ball_in_court?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
  notes?: string | null;
  nextStage?: string | null;
  ofsChecklist?: OfsChecklistState | null;
  ofsOverrideReason?: string | null;
  commentDispositions?: CommentDispositionLike[] | null;
  commentOverrideReason?: string | null;
  bumpRevision?: boolean;
  bumpTextRevision?: boolean;
  currentRevision?: string | null;
  extraPatch?: Record<string, unknown> | null;
  fabReleaseOverrideReason?: string | null;
}

export interface CurrentRoundLite {
  id: string;
  round_number?: number | null;
  status?: string | null;
  ball_in_court?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RoundWritePlan {
  action: "update" | "insert";
  roundId: string | null;
  roundNumber: number;
  setSubmitted: boolean;
  setReturned: boolean;
}

export type BulkResult = {
  succeeded: number;
  failed: Array<{ id: string; error: string }>;
};

export type CreateInput = Record<string, unknown>;
export type UpdateInput = { id: string } & Record<string, unknown>;
export type CreateRoundInput = Record<string, unknown>;
export type UpdateRoundInput = { id: string } & Record<string, unknown>;
export type BulkUpdateVars = {
  ids: string[];
  patch: Record<string, unknown>;
};

export interface SubmittalMutationContext {
  projectId: string | null | undefined;
  submittals: Submittal[];
  queryKey: readonly unknown[];
  invalidateAll: () => Promise<void>;
}
