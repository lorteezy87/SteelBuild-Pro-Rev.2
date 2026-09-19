/**
 * useGcDocumentsPageController — every mutation and handler for the GC
 * Documents page. Reads `data` and `state`; renders nothing.
 */

import { useMutation, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import type { Insert, Update } from "@/api/supabaseClient";
import { invalidateEntities } from "@/services/cacheRegistry";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { sanitizeGcDrawingSetPayload, type SteelImpact } from "@/lib/gcDocuments/gcDocTypes";
import {
  planSupersession,
  type GcDrawingRow,
  type GcIssuance,
  type SupersessionPlan,
} from "./gcDocumentsPageDerive";
import type { GcDocumentsPageData } from "./useGcDocumentsPageData";
import type { GcDocumentsPageState } from "./useGcDocumentsPageState";

export interface CreateIssuanceInput {
  set: Record<string, unknown>;
  /** Sheets to create under the new set; may be empty (a contract document). */
  sheets?: Array<Record<string, unknown>>;
  /** Mark the prior sheets these replace as superseded. */
  supersede?: boolean;
}

export function useGcDocumentsPageController({
  projectId,
  queryClient,
  data,
  state,
}: {
  projectId: string | null | undefined;
  queryClient: QueryClient;
  data: GcDocumentsPageData;
  state: GcDocumentsPageState;
}) {
  const invalidate = async () => {
    await invalidateEntities(queryClient, ["gcDrawingSet", "gcDrawing"], projectId);
  };

  // ── Create an issuance, optionally with its sheets ────────────────────────
  const createMut = useMutation<{ setId: string; sheetCount: number; plan: SupersessionPlan | null }, Error, CreateIssuanceInput>({
    mutationFn: async ({ set, sheets = [], supersede = true }) => {
      if (!projectId) throw new Error("Select a project first.");

      const { record, warnings } = sanitizeGcDrawingSetPayload({
        ...set,
        project_id: projectId,
      });
      if (warnings.length) {
        console.warn("[gcDocuments.create] payload coerced:", warnings);
      }

      const created = await entities.GcDrawingSet.create(
        record as Insert<"gc_drawing_sets">,
      );
      const setId = String(created?.id ?? "");
      if (!setId) throw new Error("The issuance was created without an id.");

      let createdSheets: GcDrawingRow[] = [];
      if (sheets.length) {
        // bulkCreate is a plain insert, not an upsert — safe here because the
        // set was just minted, so no sheet can already belong to it.
        createdSheets = await entities.GcDrawing.bulkCreate(
          sheets.map((sheet) => ({
            ...sheet,
            project_id: projectId,
            gc_drawing_set_id: setId,
          })) as Insert<"gc_drawings">[],
        );
      }

      // Supersession runs against the roster we already paged in full
      // (filterAll), so it cannot silently miss a prior sheet past the server
      // row cap and leave two live sheets with the same number.
      let plan: SupersessionPlan | null = null;
      if (supersede && createdSheets.length) {
        plan = planSupersession(createdSheets, data.sheets, setId);
        const byNumber = new Map(
          createdSheets.map((s) => [String(s.drawing_number ?? ""), String(s.id ?? "")]),
        );
        for (const replacement of plan.replacements) {
          await entities.GcDrawing.update(replacement.priorId, {
            is_superseded: true,
            superseded_by_id: byNumber.get(replacement.incomingNumber) ?? null,
          } as Update<"gc_drawings">);
        }
      }

      return { setId, sheetCount: createdSheets.length, plan };
    },
    onSuccess: async ({ sheetCount, plan }) => {
      await invalidate();
      toast.success(
        sheetCount ? `Issuance logged — ${sheetCount} sheet(s)` : "Issuance logged",
      );
      if (plan?.replacements.length) {
        toast.info(`${plan.replacements.length} prior sheet(s) marked superseded`);
      }
      if (plan?.ambiguous.length) {
        // Never resolved automatically: two live priors share a number, which
        // means the register is already inconsistent. Say so; don't pick one.
        toast.warning(
          `${plan.ambiguous.length} sheet number(s) matched more than one live sheet and were left alone: ${plan.ambiguous.join(", ")}`,
        );
      }
    },
    onError: (err) => {
      toast.error(`Failed to log the issuance: ${toUserErrorMessage(err)}`);
    },
  });

  // ── Edit an issuance's metadata ───────────────────────────────────────────
  const updateMut = useMutation<void, Error, { id: string } & Record<string, unknown>>({
    mutationFn: async ({ id, ...patch }) => {
      if (!id) throw new Error("Update requires an id.");
      const { record, warnings } = sanitizeGcDrawingSetPayload(patch);
      if (warnings.length) {
        console.warn("[gcDocuments.update] payload coerced:", warnings);
      }
      await entities.GcDrawingSet.update(id, record as Update<"gc_drawing_sets">);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Issuance updated");
    },
    onError: (err) => {
      toast.error(`Failed to update the issuance: ${toUserErrorMessage(err)}`);
    },
  });

  // ── Record the steel-impact disposition ───────────────────────────────────
  const setImpactMut = useMutation<void, Error, { id: string; steel_impact: SteelImpact; impact_notes?: string | null }>({
    mutationFn: async ({ id, steel_impact, impact_notes }) => {
      if (!id) throw new Error("Update requires an id.");
      const patch: Record<string, unknown> = { steel_impact };
      // Only write notes when the caller actually supplied them, so clearing
      // the field is an explicit act rather than a side effect of a dropdown.
      if (impact_notes !== undefined) patch.impact_notes = impact_notes;
      const { record } = sanitizeGcDrawingSetPayload(patch);
      await entities.GcDrawingSet.update(id, record as Update<"gc_drawing_sets">);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Impact recorded");
    },
    onError: (err) => {
      toast.error(`Failed to record the impact: ${toUserErrorMessage(err)}`);
    },
  });

  // ── Delete an issuance (soft) ─────────────────────────────────────────────
  // gc_drawing_sets is registered in SOFT_DELETE_TABLES, so delete() writes
  // is_deleted rather than removing the row. The sheets go first: the DB's ON
  // DELETE CASCADE only covers a hard delete, and a soft-deleted set whose
  // sheets stayed live would leave orphans in the sheet roster — which is what
  // supersession matching reads.
  const deleteMut = useMutation<number, Error, GcIssuance>({
    mutationFn: async (issuance) => {
      for (const sheet of issuance.sheets) {
        const id = String(sheet.id ?? "");
        if (id) await entities.GcDrawing.delete(id);
      }
      await entities.GcDrawingSet.delete(issuance.id);
      return issuance.sheets.length;
    },
    onSuccess: async (sheetCount) => {
      await invalidate();
      toast.success(
        sheetCount ? `Issuance deleted — ${sheetCount} sheet(s)` : "Issuance deleted",
      );
    },
    onError: (err) => {
      toast.error(`Failed to delete the issuance: ${toUserErrorMessage(err)}`);
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleExpanded = (id: string) => {
    state.setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    state.setExpanded(new Set(data.filtered.map((i) => i.id)));
  };

  const collapseAll = () => {
    state.setExpanded(new Set());
  };

  const handleCreate = async (input: CreateIssuanceInput) => {
    state.setSaving(true);
    try {
      await createMut.mutateAsync(input);
      state.setUploadOpen(false);
    } catch {
      // The mutation's onError already surfaced it; keep the modal open so
      // whatever was typed is not lost.
    } finally {
      state.setSaving(false);
    }
  };

  const handleSaveSet = async (patch: Record<string, unknown>) => {
    const id = state.editingSet?.id;
    if (!id) return;
    state.setSaving(true);
    try {
      await updateMut.mutateAsync({ id: String(id), ...patch });
      state.setEditingSet(null);
    } catch {
      // Keep the modal open on failure.
    } finally {
      state.setSaving(false);
    }
  };

  const handleSaveImpact = async (steelImpact: SteelImpact, notes: string | null) => {
    const target = state.impactTarget;
    if (!target) return;
    state.setSaving(true);
    try {
      await setImpactMut.mutateAsync({
        id: target.id,
        steel_impact: steelImpact,
        impact_notes: notes,
      });
      state.setImpactTarget(null);
    } catch {
      // Keep the modal open on failure.
    } finally {
      state.setSaving(false);
    }
  };

  const handleDelete = (issuance: GcIssuance) => {
    const sheetNote = issuance.sheets.length
      ? ` and its ${issuance.sheets.length} sheet(s)`
      : "";
    state.setConfirmState({
      title: `Delete ${issuance.label}?`,
      description:
        `This removes the issuance${sheetNote} from the register. ` +
        `Sheets it superseded stay superseded — deleting the document that ` +
        `replaced them does not make them current again.`,
      run: async () => {
        await deleteMut.mutateAsync(issuance);
        state.setConfirmState(null);
      },
    });
  };

  return {
    invalidate,
    createIssuance: createMut,
    updateIssuance: updateMut,
    setSteelImpact: setImpactMut,
    deleteIssuance: deleteMut,
    toggleExpanded,
    expandAll,
    collapseAll,
    handleCreate,
    handleSaveSet,
    handleSaveImpact,
    handleDelete,
  };
}

export type GcDocumentsPageController = ReturnType<typeof useGcDocumentsPageController>;
