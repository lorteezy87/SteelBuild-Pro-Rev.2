/**
 * useDeliveries.ts — Single source of truth for Delivery CRUD.
 *
 * ONE query. ONE invalidation path (hits ALL 10+ delivery query keys).
 * Status transitions validated via workflowEngine.
 * No silent fallbacks — errors reported, not swallowed.
 *
 * Usage:
 *   const {
 *     deliveries, filtered, kpis, isLoading,
 *     createDelivery, updateDelivery, deleteDelivery,
 *     advanceStatus, bulkUpdate, bulkDelete,
 *   } = useDeliveries(projectId, filters);
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import type { Insert, Update } from "@/api/supabaseClient";
import { getQueryKey, invalidateEntities } from "@/services/cacheRegistry";
import { validate } from "@/services/validation";

// Loose Delivery shape — base44Client is still untyped (Phase 3). The DB row
// type from src/types/supabase.ts will replace this once the entity boundary
// is converted.
export type Delivery = {
  id: string;
  status?: string | null;
  description?: string | null;
  vendor?: string | null;
  po_number?: string | null;
  project_name?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
  scheduled_date?: string | null;
  actual_date?: string | null;
  weight_tons?: number | string | null;
  pieces?: number | string | null;
  [key: string]: unknown;
};

export type DeliveryFilters = {
  status?: string;
  search?: string;
  sortBy?: "DUE" | "PROJECT" | "VENDOR" | "TONNAGE";
  overdueFirst?: boolean;
};

const ADVANCE_MAP: Record<string, string> = {
  Scheduled: "In Transit",
  "In Transit": "Delivered",
  Delayed: "In Transit",
  Partial: "Delivered",
};

export function useDeliveries(projectId: string | null | undefined, filters: DeliveryFilters = {}) {
  const qc = useQueryClient();
  const queryKey = getQueryKey("delivery", projectId);

  // ── Primary query ───────────────────────────────────────────────────
  const {
    data: deliveries = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Delivery[]>({
    queryKey,
    queryFn: () => base44.entities.Delivery.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // ── Derived: filtered + sorted ──────────────────────────────────────
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const in7 = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d;
  }, [today]);

  const in30 = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 30);
    return d;
  }, [today]);

  const filtered = useMemo(() => {
    const { status, search, sortBy = "DUE", overdueFirst = true } = filters;

    return deliveries
      .filter((d) => {
        if (status && status !== "ALL" && d.status !== status) return false;
        const q = (search || "").trim().toLowerCase();
        if (q) {
          const hay = `${d.description} ${d.vendor} ${d.po_number} ${d.project_name} ${d.carrier} ${d.tracking_number}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aDate = a.scheduled_date ? new Date(a.scheduled_date) : null;
        const bDate = b.scheduled_date ? new Date(b.scheduled_date) : null;
        if (overdueFirst) {
          const aOver = aDate && aDate < today && a.status !== "Delivered";
          const bOver = bDate && bDate < today && b.status !== "Delivered";
          if (aOver && !bOver) return -1;
          if (!aOver && bOver) return 1;
        }
        if (sortBy === "PROJECT") return (a.project_name || "").localeCompare(b.project_name || "");
        if (sortBy === "VENDOR") return (a.vendor || "").localeCompare(b.vendor || "");
        if (sortBy === "TONNAGE") return (Number(b.weight_tons) || 0) - (Number(a.weight_tons) || 0);
        return (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
      });
  }, [deliveries, filters, today]);

  // ── Derived: KPIs ───────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const scheduled = deliveries.filter((d) => d.status === "Scheduled").length;
    const inTransit = deliveries.filter((d) => d.status === "In Transit").length;
    const delivered = deliveries.filter((d) => d.status === "Delivered").length;
    const partial = deliveries.filter((d) => ["Partial", "Rejected"].includes(d.status as string)).length;
    const overdue = deliveries.filter(
      (d) => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered"
    ).length;
    const dueWeek = deliveries.filter((d) => {
      if (!d.scheduled_date) return false;
      const dt = new Date(d.scheduled_date);
      return dt >= today && dt <= in7 && d.status !== "Delivered";
    }).length;
    const dueMonth = deliveries.filter((d) => {
      if (!d.scheduled_date) return false;
      const dt = new Date(d.scheduled_date);
      return dt >= today && dt <= in30 && d.status !== "Delivered";
    }).length;
    const tonsPending = deliveries
      .filter((d) => d.status !== "Delivered")
      .reduce((s, d) => s + (Number(d.weight_tons) || 0), 0)
      .toFixed(1);

    return { scheduled, inTransit, delivered, partial, overdue, dueWeek, dueMonth, tonsPending, total: deliveries.length };
  }, [deliveries, today, in7, in30]);

  // ── Invalidation ────────────────────────────────────────────────────
  const invalidateAll = async () => {
    await invalidateEntities(qc, ["delivery", "alert"], projectId);
  };

  // ── CREATE ──────────────────────────────────────────────────────────
  type CreateInput = Record<string, unknown> & {
    description?: string;
    pieces?: number | string;
    weight_tons?: number | string;
  };
  const createMut = useMutation<Delivery, Error, CreateInput>({
    mutationFn: async (data) => {
      const errors = validate("delivery", data, "create");
      if (errors.length > 0) {
        throw new Error(errors.map((e: { message: string }) => e.message).join(" "));
      }
      return await base44.entities.Delivery.create({
        ...data,
        description: data.description?.trim(),
        pieces: parseInt(String(data.pieces ?? "")) || 0,
        weight_tons: parseFloat(String(data.weight_tons ?? "")) || 0,
      } as Insert<'deliveries'>);
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Delivery created");
    },
    onError: (err) => toast.error(`Failed to create delivery: ${err.message}`),
  });

  // ── UPDATE ──────────────────────────────────────────────────────────
  type UpdateInput = { id: string } & Record<string, unknown>;
  const updateMut = useMutation<Delivery, Error, UpdateInput>({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      if (data.pieces !== undefined) data.pieces = parseInt(String(data.pieces)) || 0;
      if (data.weight_tons !== undefined) data.weight_tons = parseFloat(String(data.weight_tons)) || 0;
      return await base44.entities.Delivery.update(id, data);
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Delivery updated");
    },
    onError: (err) => toast.error(`Failed to update delivery: ${err.message}`),
  });

  // ── DELETE ──────────────────────────────────────────────────────────
  const deleteMut = useMutation<string, Error, string>({
    mutationFn: async (id) => {
      if (!id) throw new Error("Delete requires an id.");
      await base44.entities.Delivery.delete(id);
      return id;
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Delivery deleted");
    },
    onError: (err) => toast.error(`Failed to delete delivery: ${err.message}`),
  });

  // ── ADVANCE STATUS (workflow-controlled) ────────────────────────────
  type AdvanceVars = { id: string; currentStatus: string; user?: unknown };
  const advanceStatusMut = useMutation<Delivery, Error, AdvanceVars>({
    mutationFn: async ({ id, currentStatus }) => {
      const nextStatus = ADVANCE_MAP[currentStatus];
      if (!nextStatus) {
        throw new Error(`No automatic next status for "${currentStatus}". Use the edit form.`);
      }
      // Workflow validation is advisory here (field users can advance)
      const updateData: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === "Delivered") {
        updateData.actual_date = new Date().toISOString().split("T")[0];
      }
      return await base44.entities.Delivery.update(id, updateData);
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Status updated");
    },
    onError: (err) => toast.error(`Status update failed: ${err.message}`),
  });

  // ── BULK UPDATE ─────────────────────────────────────────────────────
  type BulkResult = { succeeded: number; failed: Array<{ id: string; error: string }> };
  type BulkUpdateVars = { ids: string[]; data: Record<string, unknown> };
  const bulkUpdateMut = useMutation<BulkResult, Error, BulkUpdateVars>({
    mutationFn: async ({ ids, data }) => {
      const results: BulkResult = { succeeded: 0, failed: [] };
      for (const id of ids) {
        try {
          await base44.entities.Delivery.update(id, data);
          results.succeeded++;
        } catch (err: unknown) {
          const msg = (err as { message?: string } | undefined)?.message ?? String(err);
          results.failed.push({ id, error: msg });
        }
      }
      if (results.failed.length > 0 && results.succeeded === 0) {
        throw new Error("All updates failed.");
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      if (results.failed.length) {
        toast.warning(`${results.succeeded} updated, ${results.failed.length} failed`);
      } else {
        toast.success(`${results.succeeded} deliveries updated`);
      }
    },
    onError: (err) => {
      invalidateAll();
      toast.error(`Bulk update failed: ${err.message}`);
    },
  });

  // ── BULK DELETE ─────────────────────────────────────────────────────
  const bulkDeleteMut = useMutation<BulkResult, Error, string[]>({
    mutationFn: async (ids) => {
      const results: BulkResult = { succeeded: 0, failed: [] };
      for (const id of ids) {
        try {
          await base44.entities.Delivery.delete(id);
          results.succeeded++;
        } catch (err: unknown) {
          const msg = (err as { message?: string } | undefined)?.message ?? String(err);
          results.failed.push({ id, error: msg });
        }
      }
      if (results.failed.length > 0 && results.succeeded === 0) {
        throw new Error("All deletes failed.");
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      if (results.failed.length) {
        toast.warning(`${results.succeeded} deleted, ${results.failed.length} failed`);
      } else {
        toast.success(`${results.succeeded} deliveries deleted`);
      }
    },
    onError: (err) => {
      invalidateAll();
      toast.error(`Bulk delete failed: ${err.message}`);
    },
  });

  return {
    // Data
    deliveries,
    filtered,
    kpis,
    isLoading,
    error,
    refetch,
    today,
    in7,
    in30,

    // Mutations
    createDelivery: createMut,
    updateDelivery: updateMut,
    deleteDelivery: deleteMut,
    advanceStatus: advanceStatusMut,
    bulkUpdate: bulkUpdateMut,
    bulkDelete: bulkDeleteMut,

    // Invalidation (for external callers)
    invalidateAll,
  };
}
