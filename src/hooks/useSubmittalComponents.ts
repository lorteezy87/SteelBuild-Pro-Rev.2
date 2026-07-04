/**
 * useSubmittalComponents.ts — data layer for per-drawing-type submittal tracking.
 *
 * Phase 4 of the submittal-logic integration (flag `submittal_drawing_types`).
 * Reads/writes the `submittal_components` table (one row per Shop/Erection/Part
 * present on a submittal). Mirrors the standalone tracker's
 * useSetComponentReceived / useReleaseComponent hooks, ported onto SB Pro's
 * entity client + react-query + cacheRegistry conventions.
 *
 * The caller (Submittals.tsx) is responsible for the flag gate — this hook is a
 * plain query/mutation surface. Release-per-type is INDEPENDENT of
 * submittals.status and is NOT part of the fab-release gate.
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import type { Insert, RowWithAliases, Update } from "@/api/supabaseClient";
import { getQueryKey, invalidateEntities } from "@/services/cacheRegistry";
import { localToday } from "@/utils/dates";
import type { DrawingType } from "@/lib/submittalComponents";

export type SubmittalComponentRow = RowWithAliases<"submittal_components">;

/**
 * The bits of an existing component row the mutations need to decide create vs
 * update. Deliberately loose ({ id? }) so callers can pass either a full Row or
 * the structural SubmittalComponent from the pure lib without a cast.
 */
type ComponentRef = { id?: string } | null | undefined;

/**
 * All component rows for a project's submittals, grouped by submittal_id. The
 * page reads the whole project's components once (same shape as the rounds
 * query in useSubmittals) and looks up the selected submittal's group.
 */
export function useSubmittalComponents(
  projectId: string | null | undefined,
  enabled = true,
) {
  const qc = useQueryClient();
  const queryKey = getQueryKey("submittal_component", projectId);

  const {
    data: components = [],
    isLoading,
    error,
    refetch,
  } = useQuery<SubmittalComponentRow[]>({
    queryKey,
    // `enabled` lets the caller skip the fetch entirely when the flag is off, so
    // a user without the flag never issues the query.
    enabled: !!projectId && enabled,
    queryFn: () =>
      entities.SubmittalComponent.filter(
        { project_id: projectId },
        "drawing_type",
        2000,
      ),
    staleTime: 60_000,
  });

  // Group by submittal_id for O(1) per-submittal lookup in the detail panel.
  const bySubmittal = useMemo(() => {
    const map: Record<string, SubmittalComponentRow[]> = {};
    for (const c of components) {
      const sid = c.submittal_id;
      if (!sid) continue;
      if (!map[sid]) map[sid] = [];
      map[sid].push(c);
    }
    return map;
  }, [components]);

  const invalidate = () =>
    invalidateEntities(qc, ["submittal_component"], projectId);

  // ── Upsert a component (create the row if the type isn't tracked yet, else
  //    patch it). Keyed by (submittal_id, drawing_type) — the DB UNIQUE
  //    constraint backs this. project_id is taken from the parent submittal.
  interface UpsertVars {
    submittalId: string;
    projectId: string;
    drawingType: DrawingType;
    /** Existing row for this (submittal, type), if any — drives create vs update. */
    existing?: ComponentRef;
    patch: Partial<{
      received_date: string | null;
      released_date: string | null;
      is_released: boolean;
      notes: string | null;
    }>;
  }

  const upsertMut = useMutation<SubmittalComponentRow, Error, UpsertVars>({
    mutationFn: async ({ submittalId, projectId: pid, drawingType, existing, patch }) => {
      if (existing?.id) {
        return await entities.SubmittalComponent.update(
          existing.id,
          patch as Update<"submittal_components">,
        );
      }
      return await entities.SubmittalComponent.create({
        project_id: pid,
        submittal_id: submittalId,
        drawing_type: drawingType,
        ...patch,
      } as Insert<"submittal_components">);
    },
    onSuccess: async () => {
      await invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to update drawing type: ${err.message}`);
    },
  });

  // ── Set (or clear) a drawing type's received date. Mirrors the tracker's
  //    useSetComponentReceived.
  const setReceived = (args: {
    submittalId: string;
    projectId: string;
    drawingType: DrawingType;
    existing?: ComponentRef;
    date: string | null;
  }) =>
    upsertMut.mutate({
      submittalId: args.submittalId,
      projectId: args.projectId,
      drawingType: args.drawingType,
      existing: args.existing,
      patch: { received_date: args.date },
    });

  // ── Release / un-release a drawing type for fabrication. Stamps released_date
  //    with the local today on release, clears it on un-release. Mirrors the
  //    tracker's useReleaseComponent patch — but deliberately does NOT touch
  //    submittals.status (that stays the workflow truth + the fab-release gate).
  const setReleased = (args: {
    submittalId: string;
    projectId: string;
    drawingType: DrawingType;
    existing?: ComponentRef;
    released: boolean;
  }) =>
    upsertMut.mutate({
      submittalId: args.submittalId,
      projectId: args.projectId,
      drawingType: args.drawingType,
      existing: args.existing,
      patch: args.released
        ? { is_released: true, released_date: localToday() }
        : { is_released: false, released_date: null },
    });

  // ── Add a drawing type (create an empty component row). Used by the create
  //    form + detail-panel "+ add type" affordance.
  const addType = (args: { submittalId: string; projectId: string; drawingType: DrawingType }) =>
    upsertMut.mutate({
      submittalId: args.submittalId,
      projectId: args.projectId,
      drawingType: args.drawingType,
      existing: null,
      patch: {},
    });

  // ── Remove a drawing type entirely (hard delete — a component is a small
  //    toggle row, matching the tracker's model).
  const removeMut = useMutation<string, Error, string>({
    mutationFn: async (id) => {
      await entities.SubmittalComponent.delete(id);
      return id;
    },
    onSuccess: async () => {
      await invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to remove drawing type: ${err.message}`);
    },
  });

  return {
    components,
    bySubmittal,
    isLoading,
    error,
    refetch,
    // Mutations
    upsert: upsertMut,
    setReceived,
    setReleased,
    addType,
    remove: removeMut,
    invalidate,
  };
}
