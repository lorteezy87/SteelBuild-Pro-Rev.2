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
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import DeleteDialog from '@/components/shared/DeleteDialog';
import { KpiTile as KpiTileRaw } from '@/components/design-system';
import { OperationsPageShell, OpsActionButton, OpsFilterPanel } from '@/components/operations/OperationsPageShell';
import { Plus, Download, Printer } from 'lucide-react';
import { useProjectId } from '@/hooks/useProjectId';
import { useAutoOpenCreate } from '@/hooks/useAutoOpenCreate';
import { exportToCSV } from '@/lib/csv';
import { PROCUREMENT_CATEGORIES, ALL_STATUSES, iStyle, addWeeks } from './procurement/format';
import {
  PipelineView, ListView, BoardView, ProcurementFormModal,
} from './procurement/components';

// KpiTile is a still-.jsx primitive; cast at the boundary.
const KpiTile = KpiTileRaw as any;

export default function Procurement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = useProjectId();
  const qc = useQueryClient();

  const [view, setView] = useState('pipeline');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterCat, setFilterCat] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');

  // Restore persisted view + read URL search params on first render.
  React.useEffect(() => {
    const savedView = localStorage.getItem('procurementView');
    if (savedView && ['pipeline', 'list', 'board'].includes(savedView)) {
      setView(savedView);
    }
    const urlView = searchParams.get('view');
    if (urlView && ['pipeline', 'list', 'board'].includes(urlView)) {
      setView(urlView);
    }
    const urlStatus = searchParams.get('status');
    if (urlStatus && ALL_STATUSES.includes(urlStatus)) {
      setFilterStatus(urlStatus);
    }
    const urlCat = searchParams.get('cat');
    if (urlCat && PROCUREMENT_CATEGORIES.includes(urlCat)) {
      setFilterCat(urlCat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAutoOpenCreate(() => {
    setEditing(null);
    setShowForm(true);
  }, { enabled: !!projectId });

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ['procurement', projectId],
    queryFn: () => projectId
      ? base44.entities.Delivery.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ['work-packages', projectId],
    queryFn: () => projectId
      ? base44.entities.WorkPackage.filter({ project_id: projectId })
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
    mutationFn: (data: any) => base44.entities.Delivery.create({
      ...data,
      delivery_type: 'PROCUREMENT',
      project_id: projectId,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement'] });
      qc.invalidateQueries({ queryKey: ['deliveries-all'] });
      setShowForm(false);
      setEditing(null);
      toast.success('Item added');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => base44.entities.Delivery.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement'] });
      qc.invalidateQueries({ queryKey: ['deliveries-all'] });
      setShowForm(false);
      setEditing(null);
      toast.success('Item updated');
    },
    onError: (err) => toast.error(err.message),
  });

  // Soft-delete mirrors the Budget Hours pattern. Hard delete was
  // destructive - losing PO history when a user mis-clicked the X
  // button was the original bug report on this page.
  const deleteMut = useMutation({
    mutationFn: (id: string) => base44.entities.Delivery.update(id, {
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

  const kpis = useMemo(() => ({
    total: items.length,
    open: items.filter(i => !['Received', 'Cancelled'].includes(i.status)).length,
    overdue: enriched.filter(i => i.isOverdue).length,
    longLead: items.filter(i => i.is_long_lead === true).length,
    longLeadSlipping: enriched.filter(i => i.longLeadSlipping).length,
    totalWeight: items.reduce((s, i) => s + (Number(i.weight_tons) || 0), 0),
  }), [items, enriched]);

  const selectedProject = projects.find(p => p.id === projectId);

  // Fast WP lookup for the linkage display
  const wpById = useMemo(() => {
    const m = new Map();
    for (const w of workPackages) if (w?.id) m.set(w.id, w);
    return m;
  }, [workPackages]);

  const handleSetView = (v) => {
    setView(v);
    localStorage.setItem('procurementView', v);
  };

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
      i.metadata?.cost_estimate || '',
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
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
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

  return (
    <OperationsPageShell
      eyebrow={selectedProject?.name || "Procurement"}
      title="Procurement Tracker"
      subtitle="Track material, vendors, purchase orders, long-lead risk, shipping commitments, and received status from one procurement command board."
      meta={[
        { label: "Items", value: kpis.total },
        { label: "Open", value: kpis.open, color: "var(--status-warning)" },
        { label: "Overdue", value: kpis.overdue, color: kpis.overdue > 0 ? "var(--status-error)" : "var(--status-success)" },
        { label: "View", value: view },
      ]}
      metrics={[
        { label: "Total Items", value: kpis.total, sub: `${filtered.length} showing`, color: "var(--accent)" },
        { label: "Long Lead", value: kpis.longLead, sub: `${kpis.longLeadSlipping} slipping`, color: kpis.longLeadSlipping > 0 ? "var(--status-error)" : "var(--phase-detailing)" },
        { label: "Overdue", value: kpis.overdue, sub: "Needs follow-up", color: kpis.overdue > 0 ? "var(--status-error)" : "var(--status-success)" },
        { label: "Total Weight", value: `${kpis.totalWeight.toFixed(1)}T`, sub: "Procurement tons", color: "var(--phase-fabrication)" },
      ]}
      actions={(
        <>
          <div style={{ display: 'flex', border: '1px solid var(--border-default)', borderRadius: 8, overflow: 'hidden' }}>
            {[
              { id: 'pipeline', label: 'Pipeline' },
              { id: 'list', label: 'List' },
              { id: 'board', label: 'Board' },
            ].map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => handleSetView(v.id)}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRight: i < 2 ? '1px solid var(--border-default)' : 'none',
                  background: view === v.id ? 'var(--accent-muted)' : 'transparent',
                  color: view === v.id ? 'var(--accent)' : 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
          <OpsActionButton onClick={handleExportCSV} title="Export filtered rows as CSV" icon={<Download size={13} />}>
            Export CSV
          </OpsActionButton>
          <OpsActionButton onClick={() => window.print()} title="Print this page" icon={<Printer size={13} />}>
            Print
          </OpsActionButton>
          <OpsActionButton variant="primary" onClick={() => { setEditing(null); setShowForm(true); }} icon={<Plus size={13} />}>
            Add Item
          </OpsActionButton>
        </>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <KpiTile compact label="Total Items"      value={kpis.total}                         color="var(--accent)" />
        <KpiTile compact label="Open"             value={kpis.open}                          color="var(--status-warning)" />
        <KpiTile compact label="Overdue"          value={kpis.overdue}                       color="var(--status-error)" />
        <KpiTile compact label="Long Lead"        value={kpis.longLead}                      color="var(--phase-detailing)" />
        <KpiTile compact label="LL Slipping"      value={kpis.longLeadSlipping}              color="var(--status-error)" />
        <KpiTile compact label="Total Weight"     value={`${kpis.totalWeight.toFixed(1)}T`}  color="var(--phase-fabrication)" />
      </div>

      {/* Filters */}
      <OpsFilterPanel>
        <input
          placeholder="Search description / vendor / PO..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...iStyle, width: 260, height: 32, padding: '0 12px' }}
        />
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          style={{ ...iStyle, width: 'auto', height: 32, padding: '0 10px' }}
        >
          <option value="all">All Categories</option>
          {PROCUREMENT_CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => handleSetFilterStatus(e.target.value)}
          style={{ ...iStyle, width: 'auto', height: 32, padding: '0 10px' }}
        >
          <option value="all">All Status</option>
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </OpsFilterPanel>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 32, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
          LOADING...
        </div>
      ) : view === 'pipeline' ? (
        <PipelineView
          items={filtered}
          wpById={wpById}
          onEdit={(i) => { setEditing(i); setShowForm(true); }}
        />
      ) : view === 'list' ? (
        <ListView
          items={filtered}
          wpById={wpById}
          onEdit={(i) => { setEditing(i); setShowForm(true); }}
          onDelete={(i) => setDeleteTarget(i)}
        />
      ) : (
        <BoardView
          items={filtered}
          wpById={wpById}
          onEdit={(i) => { setEditing(i); setShowForm(true); }}
        />
      )}

      {/* Form Modal */}
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
    </OperationsPageShell>
  );
}
