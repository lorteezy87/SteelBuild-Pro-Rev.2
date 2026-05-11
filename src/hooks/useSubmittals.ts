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
import { base44 } from "@/api/base44Client";
import type { Insert, Update, RowWithAliases } from "@/api/supabaseClient";
import { getQueryKey, invalidateEntities } from "@/services/cacheRegistry";
import { validate } from "@/services/validation";
import { lockSet } from "@/lib/drawingHub";

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
      base44.entities.Submittal.filter(
        { project_id: projectId },
        "-submitted_date"
      ),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // ── Rounds query ─────────────────────────────────────────────────
  const { data: rounds = [], isLoading: roundsLoading } = useQuery<
    SubmittalRound[]
  >({
    queryKey: roundsQueryKey,
    queryFn: () =>
      base44.entities.SubmittalRound.filter(
        { project_id: projectId },
        "-round_number"
      ),
    enabled: !!projectId,
    staleTime: 30_000,
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
    await invalidateEntities(
      qc,
      ["submittal", "submittal_round", "submittal_activity", "drawing"],
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
      return await base44.entities.Submittal.create(
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

  // ── UPDATE submittal ─────────────────────────────────────────────
  type UpdateInput = { id: string } & Record<string, unknown>;
  const updateMut = useMutation<Submittal, Error, UpdateInput>({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      const updated = await base44.entities.Submittal.update(
        id,
        data as Update<"submittals">
      );
      // Lock linked drawing sets if this update transitions the submittal
      // into a terminal-approved status. Submittal is workflow source of
      // truth; drawing-set locks are a side effect of approval.
      await lockLinkedSetsIfApproved(updated);
      return updated;
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Submittal updated");
    },
    onError: (err) => {
      toast.error(`Failed to update submittal: ${err.message}`);
    },
  });

  // ── DELETE submittal ─────────────────────────────────────────────
  const deleteMut = useMutation<string, Error, string>({
    mutationFn: async (id) => {
      if (!id) throw new Error("Delete requires an id.");
      await base44.entities.Submittal.delete(id);
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
      const round = await base44.entities.SubmittalRound.create(
        normalized as Insert<"submittal_rounds">
      );
      // Update parent submittal's total_rounds & current_round_id
      if (round?.id && data.submittal_id) {
        await base44.entities.Submittal.update(
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
      return await base44.entities.SubmittalRound.update(
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
          const updated = await base44.entities.Submittal.update(
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
          await base44.entities.Submittal.delete(id);
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
