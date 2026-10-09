/**
 * useGcDocumentsPageController — every mutation and handler for the GC
 * Documents page. Reads `data` and `state`; renders nothing.
 */

import { useMutation, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities, integrations } from "@/api/supabaseClient";
import type { Insert, Update } from "@/api/supabaseClient";
import { invalidateEntities } from "@/services/cacheRegistry";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { sanitizeGcDrawingSetPayload, type SteelImpact } from "@/lib/gcDocuments/gcDocTypes";
import { replaceGcShopImpactLinks } from "@/lib/gcDocuments/gcShopImpactLinks";
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
  /** Reviewed GC source PDF. The storage path is persisted, never a signed URL. */
  file?: File | null;
  /** Reuse an upload when the previous database save failed. */
  uploadedPath?: string;
  /** Mark the prior sheets these replace as superseded. */
  supersede?: boolean;
}

export class GcIssuanceSaveError extends Error {
  constructor(
    message: string,
    readonly setId?: string,
    readonly uploadedPath?: string,
    readonly creationUncertain = false,
  ) {
    super(message);
    this.name = "GcIssuanceSaveError";
  }
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
    mutationFn: async ({ set, sheets = [], file = null, uploadedPath, supersede = true }) => {
      if (!projectId) throw new Error("Select a project first.");

      let filePath = uploadedPath;
      if (file && !filePath) {
        const uploaded = await integrations.Core.UploadFile({ file, workflow: "drawings" });
        filePath = uploaded.path || uploaded.file_url;
        if (!filePath) throw new Error("The GC PDF upload returned no storage path. Nothing was logged.");
      }

      const { record, warnings } = sanitizeGcDrawingSetPayload({
        ...set,
        project_id: projectId,
        ...(filePath ? { file_url: filePath } : {}),
      });
      if (warnings.length) {
        console.warn("[gcDocuments.create] payload coerced:", warnings);
      }

      let created: Awaited<ReturnType<typeof entities.GcDrawingSet.create>>;
      try {
        created = await entities.GcDrawingSet.create(record as Insert<"gc_drawing_sets">);
      } catch (error) {
        if (filePath) throw new GcIssuanceSaveError(
          `The GC PDF uploaded, but the issuance create outcome could not be confirmed: ${toUserErrorMessage(error)}`,
          undefined,
          filePath,
          true,
        );
        throw error;
      }
      const setId = String(created?.id ?? "");
      if (!setId) throw new GcIssuanceSaveError(
        "The issuance create response had no id. Inspect the register before trying again.",
        undefined,
        filePath,
        true,
      );

      let createdSheets: GcDrawingRow[] = [];
      let plan: SupersessionPlan | null = null;
      try {
        if (sheets.length) {
          // One PostgREST insert, not an upsert. A mismatched returned count is
          // uncertain evidence and must never yield a success toast.
          createdSheets = await entities.GcDrawing.bulkCreate(
            sheets.map((sheet) => ({
              ...sheet,
              project_id: projectId,
              gc_drawing_set_id: setId,
              ...(filePath ? { file_url: filePath } : {}),
            })) as Insert<"gc_drawings">[],
          );
          if (createdSheets.length !== sheets.length) {
            throw new Error(`Only ${createdSheets.length} of ${sheets.length} sheet rows were confirmed.`);
          }
        }

        // Supersession runs against the roster paged in full (filterAll).
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
      } catch (error) {
        // The set already exists. Refresh the list and force human recovery so
        // a retry cannot mint a duplicate issuance or silently hide the row.
        try { await invalidate(); } catch { /* The persisted set id still identifies the partial record. */ }
        throw new GcIssuanceSaveError(
          `GC issuance ${setId} was created, but its sheet workflow did not finish: ${toUserErrorMessage(error)}`,
          setId,
          filePath,
        );
      }

      return { setId, sheetCount: createdSheets.length, plan };
    },
    onSuccess: async ({ sheetCount, plan }) => {
      try { await invalidate(); } catch { toast.warning("Issuance saved, but the register did not refresh. Reload to see it."); }
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

  const shopImpactLinksMut = useMutation<void, Error, { gcIssuanceId: string; shopSetIds: string[] }>({
    mutationFn: async ({ gcIssuanceId, shopSetIds }) => {
      if (!projectId || data.impactLinksStatus !== "available" || data.shopSetsStatus !== "available") {
        throw new Error("Affected shop-set evidence is unavailable. Try again after the link service is ready.");
      }
      const issuance = data.sets.find((set) => set.id === gcIssuanceId && set.project_id === projectId);
      if (!issuance || issuance.is_deleted || issuance.deleted_at) {
        throw new Error("The selected GC issuance is no longer active in this project.");
      }
      const existingIds = new Set((data.linksByIssuance.get(gcIssuanceId) ?? [])
        .map((link) => link.drawing_set_id));
      const activeIds = new Set(data.shopSets.map((set) => set.id));
      if (shopSetIds.some((id) => !existingIds.has(id) && !activeIds.has(id))) {
        throw new Error("A selected shop drawing set is not active in this project.");
      }
      await replaceGcShopImpactLinks(projectId, gcIssuanceId, shopSetIds);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gc-issuance-shop-set-links", projectId] });
      toast.success("Affected shop sets saved");
    },
    onError: (err) => {
      toast.error(`Affected shop sets were not saved: ${toUserErrorMessage(err)}`);
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
    } catch (error) {
      // Keep the modal open with its reviewed source page mapping, and allow
      // it to display the partial set id or reusable upload path.
      throw error;
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

  const handleSaveImpactLinks = async (shopSetIds: string[]) => {
    const target = state.impactTarget;
    if (!target) return;
    state.setSaving(true);
    try {
      await shopImpactLinksMut.mutateAsync({ gcIssuanceId: target.id, shopSetIds });
    } catch {
      // Keep the impact editor open and retain the selected IDs for correction.
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
    shopImpactLinks: shopImpactLinksMut,
    deleteIssuance: deleteMut,
    toggleExpanded,
    expandAll,
    collapseAll,
    handleCreate,
    handleSaveSet,
    handleSaveImpact,
    handleSaveImpactLinks,
    handleDelete,
  };
}

export type GcDocumentsPageController = ReturnType<typeof useGcDocumentsPageController>;
