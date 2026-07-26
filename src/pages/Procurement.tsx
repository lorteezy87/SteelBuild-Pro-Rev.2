/**
 * Procurement.jsx — procurement tracker, rebuilt as a real foundational page.
 *
 * The schema (deliveries) already carries every column procurement needs:
 * `procurement_category`, `is_long_lead`, `lead_time_weeks`,
 * `order_placed_date`, `expected_ship_date`, `po_number`, `vendor`,
 * `weight_tons`, `pieces`, `work_package_id`, plus the freeform `metadata`
 * jsonb (used here for `cost_estimate`).
 *
 * This page surfaces the procurement subset of `deliveries` — the rule is
 * "any row with a non-null procurement_category is a procurement item",
 * regardless of delivery_type. (A one-shot backfill in the same commit
 * tags those rows delivery_type='PROCUREMENT' too so the Deliveries page
 * stays consistent, but the page itself reads the category directly so
 * a forgotten tag never hides procurement data.)
 *
 * Three views:
 *   - Pipeline (default) — 7-column kanban (Identified → Quoted → PO Issued
 *     → Confirmed → In Production → Shipped → Received). Cancelled is a
 *     filter, not a column.
 *   - List — flat table with the schema-supported columns.
 *   - Board — grouped by procurement_category with count + total weight.
 *
 * URL search params: ?view=pipeline|list|board, ?status=<exact>, ?cat=<exact>.
 * Deep-link from the Schedule & Timeline dashboard panel.
 *
 * Soft-delete: matches BudgetHours — sets is_deleted=true and deleted_at.
 * The page filters `!is_deleted` everywhere so a stale row never resurfaces.
 */

import React, { useState, useMemo } from 'react';
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { RowWithAliases } from '@/api/supabaseClient';
import type { Json } from '@/types/supabase';
import { useProjectId } from '@/hooks/useProjectId';
import { useAutoOpenCreate } from '@/hooks/useAutoOpenCreate';
import { toUserErrorMessage, withProjectId } from '@/lib/mutations/standardMutation';
import { exportToCSV } from '@/lib/csv';
import { PROCUREMENT_CATEGORIES, ALL_STATUSES, addWeeks } from './procurement/format';
import ProcurementControlCenter from './procurement/ProcurementControlCenter';
import { ProcurementFormModal } from './procurement/components';
import DeleteDialog from '@/components/shared/DeleteDialog';
import LoadingSkeleton from '@/components/shared/LoadingSkeleton';
import { Button } from '@/components/design-system';
import type { ProcurementItem } from './procurement/procurementControlCenter.derive';


export default function Procurement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = useProjectId();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RowWithAliases<'deliveries'> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RowWithAliases<'deliveries'> | null>(null);
  const [filterCat, setFilterCat] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    const urlStatus = searchParams.get('status');
    if (urlStatus && ALL_STATUSES.includes(urlStatus)) setFilterStatus(urlStatus);
    const urlCat = searchParams.get('cat');
    if (urlCat && PROCUREMENT_CATEGORIES.includes(urlCat)) setFilterCat(urlCat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAutoOpenCreate(() => {
    setEditing(null);
    setShowForm(true);
  }, { enabled: !!projectId });

  const {
    data: rawItems = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['procurement', projectId],
    queryFn: () => projectId
      ? entities.Delivery.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => entities.Project.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => entities.Vendor.list(),
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ['work-packages', projectId],
    queryFn: () => projectId
      ? entities.WorkPackage.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
  });

  // Filter to the procurement subset and drop soft-deleted rows. Same
  // useMemo(filter !is_deleted) pattern Budget Hours uses so the page
  // can't accidentally render a tombstoned row.
  const items = useMemo(
    () => rawItems.filter((r) => !r.is_deleted && r.procurement_category),
    [rawItems],
  );

  const createMut = useMutation({
    mutationFn: (data: any) => entities.Delivery.create(
      withProjectId({ ...data, delivery_type: 'PROCUREMENT' }, projectId),
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement'] });
      qc.invalidateQueries({ queryKey: ['deliveries-all'] });
      setShowForm(false);
      setEditing(null);
      toast.success('Item added');
    },
    onError: (err) => toast.error(toUserErrorMessage(err, 'Failed to add item')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => entities.Delivery.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement'] });
      qc.invalidateQueries({ queryKey: ['deliveries-all'] });
      setShowForm(false);
      setEditing(null);
      toast.success('Item updated');
    },
    onError: (err) => toast.error(toUserErrorMessage(err, 'Failed to update item')),
  });

  // Soft-delete mirrors the Budget Hours pattern. Hard delete was
  // destructive - losing PO history when a user mis-clicked the X
  // button was the original bug report on this page.
  const deleteMut = useMutation({
    mutationFn: (id: string) => entities.Delivery.update(id, {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    }),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ['procurement'] });
      qc.invalidateQueries({ queryKey: ['deliveries-all'] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success('Item removed');
    },
    onError: (err) => toast.error(toUserErrorMessage(err, 'Failed to remove item')),
  });

  const today = useMemo(() => new Date(), []);

  // Compute per-row derivations once so list/pipeline/board all share
  // the same isLate / isOverdue / leadShipDate semantics.
  const enriched = useMemo(() => items.map(item => {
    const required = item.required_date ? new Date(item.required_date) : null;
    const promised = item.scheduled_date ? new Date(item.scheduled_date) : null;
    const isLate = required && promised && promised > required
      && !['Received', 'Cancelled'].includes(item.status);
    const isOverdue = required && !['Received', 'Cancelled'].includes(item.status)
      && required < today;
    const diff = required && promised ? +promised - +required : NaN;
    const daysExposure = Number.isFinite(diff) ? Math.ceil(diff / 86400000) : null;

    // Lead-time math: when both order_placed and lead_time_weeks are set,
    // the implied ship date is order_placed + weeks*7. Surface it as
    // computedShipDate so list cells can render either the user-entered
    // expected_ship_date OR the computed one with a "calc" suffix.
    const computedShipDate = (item.order_placed_date && item.lead_time_weeks)
      ? addWeeks(item.order_placed_date, Number(item.lead_time_weeks))
      : null;
    const effectiveShipDate = item.expected_ship_date || computedShipDate;

    // Long-lead slip = the implied ship date is later than the required
    // date AND the row isn't already received/cancelled. This is the
    // signal a PM most cares about - items that won't make their need-by.
    const longLeadSlipping = !!(
      item.is_long_lead
      && effectiveShipDate
      && item.required_date
      && new Date(effectiveShipDate) > new Date(item.required_date)
      && !['Received', 'Cancelled'].includes(item.status)
    );

    return {
      ...item,
      isLate,
      isOverdue,
      daysExposure,
      computedShipDate,
      effectiveShipDate,
      longLeadSlipping,
    };
  }), [items, today]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter(item => {
      if (filterCat !== 'all' && item.procurement_category !== filterCat) return false;
      if (filterStatus !== 'all' && item.status !== filterStatus) return false;
      if (q && !(
        item.description?.toLowerCase().includes(q) ||
        item.vendor?.toLowerCase().includes(q) ||
        item.po_number?.toLowerCase().includes(q)
      )) return false;
      return true;
    }).sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.isLate && !b.isLate) return -1;
      if (!a.isLate && b.isLate) return 1;
      return 0;
    });
  }, [enriched, filterCat, filterStatus, search]);


  const selectedProject = projects.find(p => p.id === projectId);

  // Fast WP lookup for the linkage display
  const wpById = useMemo(() => {
    const m = new Map();
    for (const w of workPackages) if (w?.id) m.set(w.id, w);
    return m;
  }, [workPackages]);


  const handleSetFilterStatus = (s) => {
    setFilterStatus(s);
    // Update URL so the filter stays deep-linkable but doesn't pollute
    // history - replace, not push.
    const next = new URLSearchParams(searchParams);
    if (s === 'all') next.delete('status'); else next.set('status', s);
    setSearchParams(next, { replace: true });
  };

  const handleExportCSV = () => {
    const headers = [
      'Item', 'Category', 'Vendor', 'PO Number', 'Status',
      'Required Date', 'Promised Date', 'Order Placed', 'Expected Ship',
      'Lead (wk)', 'Long Lead', 'Weight (T)', 'Pieces',
      'Cost Estimate', 'Work Package', 'Notes',
    ];
    // metadata is jsonb (Json | null). cost_estimate is only ever stored as a
    // string (see procurement form), but the Json type also admits object/array
    // members — read it only when metadata is a plain object, then keep the
    // original `value || ''` semantics for the string/number it can actually be.
    const costEstimate = (meta: Json | null | undefined): string | number => {
      if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return '';
      const v = meta.cost_estimate;
      return (typeof v === 'string' || typeof v === 'number') ? (v || '') : '';
    };
    const rows = filtered.map((i) => [
      i.description || '',
      i.procurement_category || '',
      i.vendor || '',
      i.po_number || '',
      i.status || '',
      i.required_date || '',
      i.scheduled_date || '',
      i.order_placed_date || '',
      i.expected_ship_date || i.computedShipDate || '',
      i.lead_time_weeks ?? '',
      i.is_long_lead ? 'Yes' : 'No',
      Number(i.weight_tons || 0) || '',
      Number(i.pieces || 0) || '',
      costEstimate(i.metadata),
      i.work_package_id ? (wpById.get(i.work_package_id)?.wp_number || wpById.get(i.work_package_id)?.name || '') : '',
      i.notes || '',
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    exportToCSV({
      filename: `procurement-${selectedProject?.name?.replace(/\W+/g, '-') || 'project'}-${stamp}.csv`,
      headers,
      rows,
    });
  };

  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page" style={{ textAlign: 'center', padding: '80px 24px' }}>
        <div style={{ fontSize: 32, marginBottom: 12, fontFamily: "var(--font-mono)", fontWeight: 800 }}>PKG</div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700,
          color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          Select a project
        </div>
      </div>
    );
  }

  // Gate fetch states at the page shell — ProcurementControlCenter has no loading props
  // (same pattern as ActionItems / RFIs / ChangeOrders / Backcharges).
  if (isLoading) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="sb-dashboard-reference-page" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        gap: 16,
      }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
          Couldn’t load procurement items
        </p>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', margin: 0, textAlign: 'center', maxWidth: 320 }}>
          {toUserErrorMessage(error, 'Something went wrong. Try again.')}
        </p>
        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  // Canonical Procurement control center. Page-owned mutations and modals remain below.
    return (
      <>
        <ProcurementControlCenter
          projectName={selectedProject?.name || 'Procurement'}
          items={enriched as unknown as ProcurementItem[]}
          filtered={filtered as unknown as ProcurementItem[]}
          search={search}
          onSearch={setSearch}
          categoryFilter={filterCat}
          onCategoryChange={setFilterCat}
          statusFilter={filterStatus}
          onStatusChange={handleSetFilterStatus}
          onOpenItem={(item) => { setEditing(item as unknown as Parameters<typeof setEditing>[0]); setShowForm(true); }}
          onExport={handleExportCSV}
          onCreate={() => { setEditing(null); setShowForm(true); }}
        />
        {/* Reuse the page-owned modals */}
        {showForm && (
          <ProcurementFormModal
            projectId={projectId}
            item={editing}
            vendors={vendors}
            workPackages={workPackages}
            onClose={() => { setShowForm(false); setEditing(null); }}
            onSave={(data) => {
              if (editing) {
                updateMut.mutate({ id: editing.id, data });
              } else {
                createMut.mutate(data);
              }
            }}
            isSaving={createMut.isPending || updateMut.isPending}
          />
        )}
        <DeleteDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (!deleteMut.isPending && deleteTarget?.id) {
              deleteMut.mutate(deleteTarget.id);
            }
          }}
          title="Remove Procurement Item"
          description="The item will be archived (soft-deleted). It can be recovered from the database if needed."
        />
      </>
    );
  }
