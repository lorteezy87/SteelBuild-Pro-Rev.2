/**
 * useSubmittals.ts — Single source of truth for Submittal + Round CRUD.
 *
 * Mirrors the useDrawings.ts pattern: ONE query, ONE invalidation path,
 * derived groupings (by status, by drawing set), full round management.
 *
 * Usage:
 *   const {
 *     submittals, rounds, isLoading, error,
 *     byStatus, byDrawingSet, overdue,
 *     createSubmittal, updateSubmittal, deleteSubmittal,
 *     createRound, updateRound,
 *     bulkUpdate, bulkDelete,
 *     invalidateAll,
 *   } = useSubmittals(projectId);
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import type { Insert, Update, RowWithAliases } from "@/api/supabaseClient";
import { getQueryKey, invalidateEntities } from "@/services/cacheRegistry";
import { validate } from "@/services/validation";
import { logTransition } from "@/services/auditLogger";
import { lockSet } from "@/lib/drawingHub";
import { runSubmittalStatusTriggers } from "@/lib/submittalSmartTriggers";
import { supabase } from "@/lib/supabase";
import {
  FabReleaseBlockedError,
  isFabReleaseBlocked,
  parseBlockedRfiNumbers,
} from "@/lib/fabRelease/releaseStatus";

const runStatusTriggers = runSubmittalStatusTriggers as unknown as (args: {
  submittal: Partial<Submittal> | null | undefined;
  prevStatus?: string | null;
  nextStatus?: string | null;
}) => Promise<unknown>;

const lockDrawingSet = lockSet as unknown as (args: {
  setId: string;
  reason?: string | null;
  userId?: string | null;
}) => Promise<unknown>;

export type Submittal = RowWithAliases<"submittals">;
export type SubmittalRound = RowWithAliases<"submittal_rounds">;

// ── Lock-on-approval: submittals are the workflow source of truth ──
// When a submittal transitions to a terminal-approved status, every
// drawing set linked via submittal.drawing_set_ids is locked from edits.
// Document-side flows (SetApprovalModal) no longer trigger locks; this
// is the single trigger path.
//
// Exported for testing — see src/hooks/__tests__/useSubmittals.test.ts.
export const TERMINAL_APPROVED_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
]);

export async function lockLinkedSetsIfApproved(
  submittal: Partial<Submittal> | null | undefined,
): Promise<void> {
  if (!submittal || !submittal.status) return;
  if (!TERMINAL_APPROVED_STATUSES.has(submittal.status as string)) return;
  const setIds = Array.isArray(submittal.drawing_set_ids)
    ? (submittal.drawing_set_ids as string[]).filter(Boolean)
    : [];
  if (!setIds.length) return;
  const tag =
    (submittal as Record<string, unknown>).submittal_number ||
    submittal.id ||
    "";
  const reason = `Auto-locked: submittal ${tag} reached "${submittal.status}"`.trim();
  for (const setId of setIds) {
    try {
      await lockDrawingSet({ setId, reason });
    } catch (err) {
      // Don't fail the submittal write on a lock failure — the workflow
      // status update is the user-visible outcome; lock is a side effect.
      // Surface to console for ops awareness.
      // eslint-disable-next-line no-console
      console.warn(
        `[useSubmittals] Failed to lock drawing set ${setId} after approval:`,
        err,
      );
    }
  }
}

/**
 * The single AUDITED write path for a submittal workflow move. Atomically:
 *   1. inserts a `submittal_rounds` row (the audit event),
 *   2. patches the submittal (status / ball_in_court / current_round_id /
 *      total_rounds, optional submitted/returned dates, optional revision bump
 *      on a Revise-and-Resubmit), and
 *   3. runs the terminal-approval auto-lock (§20 moat).
 *
 * Every status move (verb CTA, inline select, Kanban drag) should funnel
 * through this so the round log can never drift from the current status — which
 * is why the `submittal_rounds` table sat empty (moves bypassed it). Exported
 * (not on the hook) so the Submittals page + hub, which own their own query
 * stacks, can call it directly.
 */
export interface AddRoundInput {
  submittal: {
    id: string;
    project_id: string;
    drawing_set_ids?: string[] | null;
    total_rounds?: number | null;
    round_number?: number | null;
    /** The submittal's current sent date — fallback when opening a cycle's round. */
    submitted_date?: string | null;
    /** Status BEFORE this move — lets the smart triggers detect the transition. */
    status?: string | null;
  };
  status: string;
  ball_in_court?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
  notes?: string | null;
  /** Bump the submittal's revision round_number (true on Revise & Resubmit). */
  bumpRevision?: boolean;
  /** Extra fields to persist with the same patch (e.g. approval_chain_step
   * when the move follows a custom routing chain). */
  extraPatch?: Record<string, unknown> | null;
  /** PM override reason to release past the fab-release gate when open RFIs
   * reference the submittal's sheets. Only consulted on a move to
   * 'Released for Fabrication'; persisted to submittals.fab_release_override_reason
   * so the server trigger allows the transition (and audits why). */
  fabReleaseOverrideReason?: string | null;
}

// ── Round model: a round = one submit→return CYCLE, not a per-event row ──
// Sending out (Submitted / Under Review) opens a cycle; a verdict (Approved /
// Approved as Noted / R&R / Rejected / Released) closes it. Within-cycle moves
// UPDATE the open round in place; a resubmit (a send on a closed round) opens
// the NEXT cycle. So `submittal_rounds.round_number` + `total_rounds` count
// resubmission cycles the way a PM thinks ("on round 2"), not status events.
export const SENT_STATUSES = new Set<string>(["Submitted", "Under Review"]);

export interface CurrentRoundLite {
  id: string;
  round_number?: number | null;
  status?: string | null;
  ball_in_court?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
}

export interface RoundWritePlan {
  action: "update" | "insert";
  roundId: string | null;
  /** Resulting cycle number (= the round's round_number / the submittal's total_rounds). */
  roundNumber: number;
  setSubmitted: boolean;
  setReturned: boolean;
}

/**
 * Decide whether a status move UPDATES the current open round (same cycle) or
 * OPENS a new one (a resubmission cycle). Pure — unit-tested.
 *
 *  - Sending out on a closed/absent round opens the next cycle; on an already-
 *    open round it just advances that cycle (e.g. Submitted → Under Review).
 *  - A verdict closes the open cycle (UPDATE, stamping returned_date); with no
 *    open cycle it opens-and-closes one (defensive — e.g. a status set inline
 *    on a fresh submittal).
 */
export function planRoundWrite(
  currentRound: CurrentRoundLite | null | undefined,
  status: string,
): RoundWritePlan {
  const curr = currentRound || null;
  const isOpen = !!curr && !curr.returned_date;
  const currNum = Number(curr?.round_number) || 0;

  if (SENT_STATUSES.has(status)) {
    if (isOpen) {
      return { action: "update", roundId: curr!.id, roundNumber: currNum, setSubmitted: !curr!.submitted_date, setReturned: false };
    }
    return { action: "insert", roundId: null, roundNumber: currNum + 1, setSubmitted: true, setReturned: false };
  }
  if (isOpen) {
    return { action: "update", roundId: curr!.id, roundNumber: currNum, setSubmitted: false, setReturned: true };
  }
  return { action: "insert", roundId: null, roundNumber: currNum + 1, setSubmitted: true, setReturned: true };
}

export async function addSubmittalRound(input: AddRoundInput): Promise<Submittal> {
  const s = input.submittal;
  const fabOverride = (input.fabReleaseOverrideReason || "").trim() || null;
  const isFabRelease = input.status === "Released for Fabrication";

  // Server-arbitrated fab-release gate (Option C): a submittal cannot reach
  // 'Released for Fabrication' while open RFIs reference its sheets. Pre-check
  // BEFORE touching the round so a blocked release never orphans/mutates a round
  // row; the DB trigger is the authoritative backstop (mapped below if it fires
  // on a race between this check and the write).
  if (isFabRelease && !fabOverride) {
    // `submittal_blocking_rfis` is a SECURITY DEFINER RPC not yet in the
    // generated DB types — cast the call (the result is handled defensively).
    const callRpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: Array<{ rfi_number?: string }> | null; error: { message?: string } | null }>;
    const { data: blocking, error: gateErr } = await callRpc("submittal_blocking_rfis", {
      p_submittal_id: s.id,
    });
    if (!gateErr && Array.isArray(blocking) && blocking.length > 0) {
      const nums = (blocking as Array<{ rfi_number?: string }>)
        .map((b) => b?.rfi_number)
        .filter(Boolean) as string[];
      throw new FabReleaseBlockedError(
        `FAB_RELEASE_BLOCKED: ${nums.length} open RFI(s) reference sheets in this submittal's package (${nums.join(", ")}). Resolve them or release with an override reason.`,
        nums,
      );
    }
  }

  // Round = one submit→return cycle. Fetch the latest round for this submittal to
  // decide whether this move continues/closes the open cycle or opens a new one.
  const existing = (await entities.SubmittalRound.filter(
    { submittal_id: s.id },
    "-round_number",
    1,
  )) as unknown as CurrentRoundLite[] | null;
  const currentRound = (Array.isArray(existing) ? existing[0] : null) || null;
  const plan = planRoundWrite(currentRound, input.status);

  let round: { id?: string } | null;
  if (plan.action === "update" && plan.roundId) {
    const upd: Record<string, unknown> = {
      status: input.status,
      ball_in_court: input.ball_in_court ?? null,
    };
    if (plan.setSubmitted && input.submitted_date) upd.submitted_date = input.submitted_date;
    if (plan.setReturned) upd.returned_date = input.returned_date ?? null;
    if (input.notes) upd.response_notes = input.notes;
    round = await entities.SubmittalRound.update(plan.roundId, upd as Update<"submittal_rounds">);
  } else {
    round = await entities.SubmittalRound.create({
      project_id: s.project_id,
      submittal_id: s.id,
      round_number: plan.roundNumber,
      status: input.status,
      ball_in_court: input.ball_in_court ?? null,
      submitted_date: plan.setSubmitted ? (input.submitted_date ?? s.submitted_date ?? null) : null,
      returned_date: plan.setReturned ? (input.returned_date ?? null) : null,
      response_notes: input.notes ?? null,
      drawing_set_ids: Array.isArray(s.drawing_set_ids) ? s.drawing_set_ids : [],
      metadata: {},
    } as Insert<"submittal_rounds">);
  }

  const patch: Record<string, unknown> = {
    status: input.status,
    ball_in_court: input.ball_in_court ?? null,
    current_round_id: round?.id,
    total_rounds: plan.roundNumber,
    ...(input.extraPatch || {}),
  };
  if (input.submitted_date && plan.setSubmitted) patch.submitted_date = input.submitted_date;
  if (input.returned_date && plan.setReturned) patch.returned_date = input.returned_date;
  if (input.bumpRevision) patch.round_number = (Number(s.round_number) || 1) + 1;
  if (isFabRelease) patch.fab_release_override_reason = fabOverride;

  let updated: unknown;
  try {
    updated = await entities.Submittal.update(s.id, patch as Update<"submittals">);
  } catch (err) {
    // Backstop: the trigger blocked the transition (e.g. an RFI opened between
    // the pre-check and this write). Undo what we did to the round so it can't
    // drift from the (unchanged) submittal status — delete a freshly-inserted
    // round, or revert an in-place update to its pre-write state.
    if (isFabReleaseBlocked(err)) {
      const msg = (err as { message?: string })?.message || "Fab release blocked by open RFIs";
      try {
        if (plan.action === "insert" && round?.id) {
          await entities.SubmittalRound.delete(round.id as string);
        } else if (plan.action === "update" && currentRound?.id) {
          await entities.SubmittalRound.update(currentRound.id, {
            status: currentRound.status ?? null,
            ball_in_court: currentRound.ball_in_court ?? null,
            returned_date: currentRound.returned_date ?? null,
          } as Update<"submittal_rounds">);
        }
      } catch {
        /* best-effort cleanup */
      }
      throw new FabReleaseBlockedError(msg, parseBlockedRfiNumbers(msg));
    }
    throw err;
  }
  await lockLinkedSetsIfApproved(updated as Partial<Submittal>);
  // Smart triggers: a move into Rejected / R&R / Approved-as-Noted queues a
  // draft detailing task (deduped, never throws — see submittalSmartTriggers).
  await runStatusTriggers({
    submittal: (updated as Partial<Submittal>) || (s as Partial<Submittal>),
    prevStatus: s.status ?? null,
    nextStatus: input.status,
  });
  // Audit the status transition (fire-and-forget). Centralized here because every
  // round-based status move — including the fab-release gate — flows through this.
  logTransition("submittal", (updated as Submittal) || s, s.status ?? "—", input.status, { projectId: s.project_id }).catch(() => {});
  return updated as Submittal;
}

type BulkResult = {
  succeeded: number;
  failed: Array<{ id: string; error: string }>;
};

// ── Statuses & helpers ──────────────────────────────────────────────

export const SUBMITTAL_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Approved as Noted",
  "Revise and Resubmit",
  "Rejected",
  "Released for Fabrication",
  "Void",
] as const;

export const OPEN_STATUSES = new Set([
  "Draft",
  "Submitted",
  "Under Review",
  "Revise and Resubmit",
]);

export const TERMINAL_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
  "Void",
]);

function isOverdue(s: Submittal): boolean {
  if (!s.required_date) return false;
  if (TERMINAL_STATUSES.has(s.status)) return false;
  return new Date(s.required_date) < new Date();
}

// ── Hook ────────────────────────────────────────────────────────────

export function useSubmittals(projectId: string | null | undefined) {
  const qc = useQueryClient();
  const queryKey = getQueryKey("submittal", projectId);
  const roundsQueryKey = getQueryKey("submittal_round", projectId);

  // ── Primary query: submittals ────────────────────────────────────
  const {
    data: submittals = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Submittal[]>({
    queryKey,
    queryFn: () =>
      entities.Submittal.filter(
        { project_id: projectId },
        "-submitted_date",
        2000
      ),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Rounds query ─────────────────────────────────────────────────
  const { data: rounds = [], isLoading: roundsLoading } = useQuery<
    SubmittalRound[]
  >({
    queryKey: roundsQueryKey,
    queryFn: () =>
      entities.SubmittalRound.filter(
        { project_id: projectId },
        "-round_number",
        2000
      ),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Derived: group by status ─────────────────────────────────────
  const byStatus = useMemo(() => {
    const map: Record<string, Submittal[]> = {};
    for (const s of submittals) {
      const st = s.status || "Draft";
      if (!map[st]) map[st] = [];
      map[st].push(s);
    }
    return map;
  }, [submittals]);

  // ── Derived: group by drawing set ────────────────────────────────
  const byDrawingSet = useMemo(() => {
    const map: Record<string, { total: number; open: number }> = {};
    for (const s of submittals) {
      const setIds = Array.isArray(s.drawing_set_ids)
        ? s.drawing_set_ids
        : [];
      for (const setId of setIds) {
        if (!map[setId]) map[setId] = { total: 0, open: 0 };
        map[setId].total++;
        if (OPEN_STATUSES.has(s.status)) map[setId].open++;
      }
    }
    return map;
  }, [submittals]);

  // ── Derived: rounds by submittal ─────────────────────────────────
  const roundsBySubmittal = useMemo(() => {
    const map: Record<string, SubmittalRound[]> = {};
    for (const r of rounds) {
      const sid = r.submittal_id;
      if (!map[sid]) map[sid] = [];
      map[sid].push(r);
    }
    // Sort each group by round_number ascending
    for (const arr of Object.values(map)) {
      arr.sort(
        (a, b) => (a.round_number || 1) - (b.round_number || 1)
      );
    }
    return map;
  }, [rounds]);

  // ── Derived: overdue list ────────────────────────────────────────
  const overdue = useMemo(
    () => submittals.filter(isOverdue),
    [submittals]
  );

  // ── Derived: KPIs ────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const pending = submittals.filter(
      (s) => s.status === "Submitted" || s.status === "Under Review"
    ).length;
    const approved = submittals.filter(
      (s) => s.status === "Approved" || s.status === "Approved as Noted" || s.status === "Released for Fabrication"
    ).length;
    const rejected = submittals.filter(
      (s) => s.status === "Rejected" || s.status === "Revise and Resubmit"
    ).length;
    return {
      total: submittals.length,
      pending,
      approved,
      rejected,
      overdue: overdue.length,
    };
  }, [submittals, overdue]);

  // ── Invalidation helper ──────────────────────────────────────────
  const invalidateAll = async () => {
    // action_item included because status moves can auto-queue a detailing
    // task (submittalSmartTriggers) — keep the Action Items views fresh.
    await invalidateEntities(
      qc,
      ["submittal", "submittal_round", "submittal_activity", "drawing", "action_item"],
      projectId
    );
  };

  // ── CREATE submittal ─────────────────────────────────────────────
  type CreateInput = Record<string, unknown>;
  const createMut = useMutation<Submittal, Error, CreateInput>({
    mutationFn: async (data) => {
      const normalized = { ...data, project_id: projectId };
      const errors = validate("submittal", normalized, "create");
      if (errors.length > 0) {
        throw new Error(
          errors.map((e: { message: string }) => e.message).join(" ")
        );
      }
      return await entities.Submittal.create(
        normalized as Insert<"submittals">
      );
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Submittal created");
    },
    onError: (err) => {
      toast.error(`Failed to create submittal: ${err.message}`);
    },
  });

  // ── UPDATE submittal (optimistic) ────────────────────────────────
  type UpdateInput = { id: string } & Record<string, unknown>;
  const updateMut = useMutation<Submittal, Error, UpdateInput, { previous: Submittal[] | undefined }>({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      const prevStatus = submittals.find((s) => s.id === id)?.status ?? null;
      const updated = await entities.Submittal.update(
        id,
        data as Update<"submittals">
      );
      await lockLinkedSetsIfApproved(updated);
      if (typeof (data as { status?: unknown }).status === "string") {
        await runStatusTriggers({
          submittal: updated,
          prevStatus,
          nextStatus: (data as { status: string }).status,
        });
      }
      return updated;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<Submittal[]>(queryKey);
      qc.setQueryData<Submittal[]>(queryKey, (old) =>
        (old || []).map((s) =>
          s.id === vars.id ? { ...s, ...vars } : s
        )
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
      toast.error(`Failed to update submittal: ${err.message}`);
    },
    onSettled: async () => {
      await invalidateAll();
    },
    onSuccess: () => {
      toast.success("Submittal updated");
    },
  });

  // ── DELETE submittal ─────────────────────────────────────────────
  const deleteMut = useMutation<string, Error, string>({
    mutationFn: async (id) => {
      if (!id) throw new Error("Delete requires an id.");
      await entities.Submittal.delete(id);
      return id;
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Submittal deleted");
    },
    onError: (err) => {
      toast.error(`Failed to delete submittal: ${err.message}`);
    },
  });

  // ── CREATE round ─────────────────────────────────────────────────
  type CreateRoundInput = Record<string, unknown>;
  const createRoundMut = useMutation<SubmittalRound, Error, CreateRoundInput>({
    mutationFn: async (data) => {
      const normalized = { ...data, project_id: projectId };
      const errors = validate("submittal_round", normalized, "create");
      if (errors.length > 0) {
        throw new Error(
          errors.map((e: { message: string }) => e.message).join(" ")
        );
      }
      const round = await entities.SubmittalRound.create(
        normalized as Insert<"submittal_rounds">
      );
      // Update parent submittal's total_rounds & current_round_id
      if (round?.id && data.submittal_id) {
        await entities.Submittal.update(
          data.submittal_id as string,
          {
            current_round_id: round.id,
            total_rounds: (data.round_number as number) || 1,
            status: "Submitted",
            ball_in_court: data.ball_in_court || "EOR",
          } as Update<"submittals">
        );
      }
      return round;
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Round created");
    },
    onError: (err) => {
      toast.error(`Failed to create round: ${err.message}`);
    },
  });

  // ── UPDATE round ─────────────────────────────────────────────────
  type UpdateRoundInput = { id: string } & Record<string, unknown>;
  const updateRoundMut = useMutation<SubmittalRound, Error, UpdateRoundInput>({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      return await entities.SubmittalRound.update(
        id,
        data as Update<"submittal_rounds">
      );
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Round updated");
    },
    onError: (err) => {
      toast.error(`Failed to update round: ${err.message}`);
    },
  });

  // ── BULK update ──────────────────────────────────────────────────
  type BulkUpdateVars = {
    ids: string[];
    patch: Record<string, unknown>;
  };
  const bulkUpdateMut = useMutation<BulkResult, Error, BulkUpdateVars>({
    mutationFn: async ({ ids, patch }) => {
      const results: BulkResult = { succeeded: 0, failed: [] };
      const patchStatus = (patch as { status?: string }).status;
      const isApprovingPatch =
        !!patchStatus && TERMINAL_APPROVED_STATUSES.has(patchStatus);
      // Look up existing rows in the cached list so we have drawing_set_ids
      // for the lock pass without an extra round trip.
      const submittalsById: Record<string, Submittal> = {};
      if (isApprovingPatch) {
        for (const s of submittals) submittalsById[s.id as string] = s;
      }
      for (const id of ids) {
        try {
          const updated = await entities.Submittal.update(
            id,
            patch as Update<"submittals">
          );
          results.succeeded++;
          if (isApprovingPatch) {
            // Prefer the freshly updated row, fall back to the cached
            // copy so drawing_set_ids resolves even if the update RPC
            // returns a thin payload.
            const merged = {
              ...(submittalsById[id] || {}),
              ...(updated || {}),
              status: patchStatus,
            } as Partial<Submittal>;
            await lockLinkedSetsIfApproved(merged);
          }
        } catch (err: unknown) {
          const msg =
            (err as { message?: string } | undefined)?.message ?? String(err);
          results.failed.push({ id, error: msg });
        }
      }
      if (results.failed.length > 0 && results.succeeded === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      if (results.failed.length > 0) {
        toast.warning(
          `${results.succeeded} updated, ${results.failed.length} failed`
        );
      } else {
        toast.success(`${results.succeeded} submittal(s) updated`);
      }
    },
    onError: (err) => {
      invalidateAll();
      toast.error(`Bulk update failed: ${err.message}`);
    },
  });

  // ── BULK delete ──────────────────────────────────────────────────
  const bulkDeleteMut = useMutation<BulkResult, Error, string[]>({
    mutationFn: async (ids) => {
      const results: BulkResult = { succeeded: 0, failed: [] };
      for (const id of ids) {
        try {
          await entities.Submittal.delete(id);
          results.succeeded++;
        } catch (err: unknown) {
          const msg =
            (err as { message?: string } | undefined)?.message ?? String(err);
          results.failed.push({ id, error: msg });
        }
      }
      if (results.failed.length > 0 && results.succeeded === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      if (results.failed.length > 0) {
        toast.warning(
          `${results.succeeded} deleted, ${results.failed.length} failed`
        );
      } else {
        toast.success(`${results.succeeded} submittal(s) deleted`);
      }
    },
    onError: (err) => {
      invalidateAll();
      toast.error(`Bulk delete failed: ${err.message}`);
    },
  });

  // ── Public API ───────────────────────────────────────────────────
  return {
    // Data
    submittals,
    rounds,
    roundsBySubmittal,
    isLoading: isLoading || roundsLoading,
    error,
    refetch,

    // Derived
    byStatus,
    byDrawingSet,
    overdue,
    kpis,

    // Single mutations
    createSubmittal: createMut,
    updateSubmittal: updateMut,
    deleteSubmittal: deleteMut,

    // Round mutations
    createRound: createRoundMut,
    updateRound: updateRoundMut,

    // Bulk mutations
    bulkUpdate: bulkUpdateMut,
    bulkDelete: bulkDeleteMut,

    // External invalidation
    invalidateAll,
  };
}
