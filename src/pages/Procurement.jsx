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
import StatusBadge from '@/components/shared/StatusBadge';
import { CommandBar, KpiTile } from '@/components/design-system';
import { Plus, Download, Printer } from 'lucide-react';
import { useProjectId } from '@/hooks/useProjectId';
import { useAutoOpenCreate } from '@/hooks/useAutoOpenCreate';
import { exportToCSV } from '@/lib/csv';

const PROCUREMENT_CATEGORIES = [
  'Structural Steel — Mill Order',
  'Joists & Deck',
  'Stairs & Ladders',
  'Embeds & Anchor Bolts',
  'Miscellaneous Metals',
  'Galvanizing / Paint / Coating',
  'Long-Lead Item',
  'Hardware & Fasteners',
  'Equipment Rental',
  'Other',
];

const CAT_COLORS = {
  'Structural Steel — Mill Order': 'var(--accent)',
  'Joists & Deck': 'var(--phase-detailing)',
  'Stairs & Ladders': 'var(--accent)',
  'Embeds & Anchor Bolts': 'var(--status-warning)',
  'Miscellaneous Metals': 'var(--status-info)',
  'Galvanizing / Paint / Coating': 'var(--status-warning)',
  'Long-Lead Item': 'var(--status-error)',
  'Hardware & Fasteners': 'var(--text-secondary)',
  'Equipment Rental': 'var(--phase-erection)',
  'Other': 'var(--text-muted)',
};

// Pipeline order — Cancelled is intentionally excluded from the kanban.
const PIPELINE_STATUSES = [
  { id: 'Identified',     label: 'Identified',    short: 'IDENT',     color: 'var(--text-muted)' },
  { id: 'Quoted',         label: 'Quoted',        short: 'QUOTED',    color: 'var(--status-info)' },
  { id: 'PO Issued',      label: 'PO Issued',     short: 'PO',        color: 'var(--accent)' },
  { id: 'Confirmed',      label: 'Confirmed',     short: 'CONFIRM',   color: 'var(--phase-detailing)' },
  { id: 'In Production',  label: 'In Production', short: 'IN PROD',   color: 'var(--status-warning)' },
  { id: 'Shipped',        label: 'Shipped',       short: 'SHIPPED',   color: 'var(--phase-delivery)' },
  { id: 'Received',       label: 'Received',      short: 'RECEIVED',  color: 'var(--status-success)' },
];

const ALL_STATUSES = [...PIPELINE_STATUSES.map(s => s.id), 'Cancelled'];

const iStyle = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: 'var(--text-muted)',
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: 4,
};

const sectionLabelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  gridColumn: 'span 2',
  borderBottom: '1px solid var(--divider)',
  paddingBottom: 4,
  marginTop: 6,
};

/** Days difference; null when either side is missing/invalid. */
function daysBetween(a, b) {
  if (!a || !b) return null;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((db - da) / 86400000);
}

/** Add `weeks * 7` days to an ISO date and return YYYY-MM-DD. */
function addWeeks(isoDate, weeks) {
  if (!isoDate || !Number.isFinite(Number(weeks))) return null;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Math.round(weeks * 7));
  return d.toISOString().slice(0, 10);
}

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

const todayISO = () => new Date().toISOString().slice(0, 10);

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
    mutationFn: (data) => base44.entities.Delivery.create({
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
    mutationFn: ({ id, data }) => base44.entities.Delivery.update(id, data),
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
  // destructive — losing PO history when a user mis-clicked the X
  // button was the original bug report on this page.
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Delivery.update(id, {
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
    const diff = required && promised ? promised - required : NaN;
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
    // signal a PM most cares about — items that won't make their need-by.
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
    // history — replace, not push.
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
        <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <CommandBar
        eyebrow={selectedProject?.name || "PROCUREMENT"}
        title="Procurement Tracker"
        count={kpis.total}
        unit=" · ITEMS"
        subtitle={`${kpis.open} open · ${kpis.overdue} overdue · ${kpis.longLead} long-lead${kpis.longLeadSlipping > 0 ? ` · ${kpis.longLeadSlipping} slipping` : ''}`}
      >
        <div style={{ display: 'flex', border: '1px solid var(--border-default)', borderRadius: 6, overflow: 'hidden' }}>
          {[
            { id: 'pipeline', label: 'Pipeline' },
            { id: 'list', label: 'List' },
            { id: 'board', label: 'Board' },
          ].map((v, i) => (
            <button
              key={v.id}
              onClick={() => handleSetView(v.id)}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRight: i < 2 ? '1px solid var(--border-default)' : 'none',
                background: view === v.id ? 'var(--accent-muted)' : 'transparent',
                color: view === v.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleExportCSV}
          style={cmdBtnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-mid)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
          title="Export filtered rows as CSV"
        >
          <Download size={11} /> Export CSV
        </button>
        <button
          onClick={() => window.print()}
          style={cmdBtnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-mid)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
          title="Print this page"
        >
          <Printer size={11} /> Print
        </button>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', color: 'var(--bg-base)', border: 'none',
            borderRadius: 'var(--radius-btn)', padding: '8px 14px',
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
            cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
        >
          <Plus size={12} /> Add Item
        </button>
      </CommandBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <KpiTile compact label="Total Items"      value={kpis.total}                         color="var(--accent)" />
        <KpiTile compact label="Open"             value={kpis.open}                          color="var(--status-warning)" />
        <KpiTile compact label="Overdue"          value={kpis.overdue}                       color="var(--status-error)" />
        <KpiTile compact label="Long Lead"        value={kpis.longLead}                      color="var(--phase-detailing)" />
        <KpiTile compact label="LL Slipping"      value={kpis.longLeadSlipping}              color="var(--status-error)" />
        <KpiTile compact label="Total Weight"     value={`${kpis.totalWeight.toFixed(1)}T`}  color="var(--phase-fabrication)" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
      </div>

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
    </div>
  );
}

const cmdBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'var(--bg-surface)', color: 'var(--text-secondary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-btn)', padding: '7px 12px',
  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em',
};

/* ──────────────────────────────────────────────────────────────────
 * Pipeline (kanban) view
 * ────────────────────────────────────────────────────────────────── */
function PipelineView({ items, wpById, onEdit }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${PIPELINE_STATUSES.length}, 1fr)`,
      gap: 10,
    }}>
      {PIPELINE_STATUSES.map((stage) => {
        const stageItems = items.filter((i) => i.status === stage.id);
        const tons = stageItems.reduce((s, i) => s + (Number(i.weight_tons) || 0), 0);
        return (
          <div
            key={stage.id}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-card)',
              borderTop: `3px solid ${stage.color}`,
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              height: 540,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                letterSpacing: '0.12em', color: stage.color,
              }}>
                {stage.label.toUpperCase()}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)',
              }}>
                {stageItems.length}{tons > 0 ? ` · ${tons.toFixed(1)}T` : ''}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {stageItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 12, fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)' }}>
                  NONE
                </div>
              ) : (
                stageItems.map((i) => (
                  <PipelineCard key={i.id} item={i} wpById={wpById} onClick={() => onEdit(i)} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipelineCard({ item, wpById, onClick }) {
  const catColor = CAT_COLORS[item.procurement_category] || 'var(--text-muted)';
  const wp = item.work_package_id ? wpById.get(item.work_package_id) : null;
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-surface-low)',
        border: '1px solid var(--border-default)',
        borderLeft: item.isOverdue
          ? '3px solid var(--status-error)'
          : item.longLeadSlipping
          ? '3px solid var(--status-warning)'
          : `3px solid ${catColor}`,
        borderRadius: 'var(--radius-card)',
        padding: '8px 10px',
        marginBottom: 6,
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-mid)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface-low)')}
    >
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
        color: 'var(--text-primary)', lineHeight: 1.3,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {item.description || 'Unnamed item'}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
        {item.vendor || '—'}
        {item.po_number ? ` · ${item.po_number}` : ''}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
        <Pill color={catColor} text={(item.procurement_category || '').split(' ')[0] || 'Other'} />
        {Number(item.weight_tons) > 0 && (
          <Pill color="var(--text-muted)" text={`${Number(item.weight_tons).toFixed(1)}T`} />
        )}
        {item.is_long_lead && item.lead_time_weeks && (
          <Pill
            color="var(--status-warning)"
            text={`${item.lead_time_weeks}wk lead`}
          />
        )}
        {item.longLeadSlipping && (
          <Pill color="var(--status-error)" text="SLIPPING" />
        )}
        {wp && (
          <Pill color="var(--accent)" text={wp.wp_number || 'WP'} />
        )}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 5,
        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
      }}>
        <span>Req: {fmtDate(item.required_date)}</span>
        <span>Ship: {fmtDate(item.effectiveShipDate)}</span>
      </div>
    </div>
  );
}

function Pill({ color, text }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
      color, background: color + '22',
      padding: '2px 6px', borderRadius: 3,
      textTransform: 'uppercase', letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * List view — flat table mirroring schema columns
 * ────────────────────────────────────────────────────────────────── */
function ListView({ items, wpById, onEdit, onDelete }) {
  // Item · Category · Vendor · PO · Required · Promised · Lead · Weight · Status · Actions
  const GRID = '1.4fr 130px 130px 100px 90px 90px 70px 70px 110px 80px';
  return (
    <div className="sbd-card" style={{
      padding: 0, overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: GRID,
        padding: '10px 16px',
        background: 'var(--bg-surface-low)',
        borderBottom: '1px solid var(--divider)',
        gap: 12,
      }}>
        {['Item', 'Category', 'Vendor', 'PO', 'Required', 'Promised', 'Lead', 'Weight', 'Status', 'Actions'].map(col => (
          <div key={col} style={{
            fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
            color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {col}
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 32,
          fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
          letterSpacing: '0.12em',
        }}>
          NO PROCUREMENT ITEMS
        </div>
      ) : items.map((item) => {
        const catColor = CAT_COLORS[item.procurement_category] || 'var(--text-muted)';
        const wp = item.work_package_id ? wpById.get(item.work_package_id) : null;
        return (
          <div key={item.id} style={{
            display: 'grid', gridTemplateColumns: GRID,
            padding: '10px 16px',
            borderBottom: '1px solid var(--divider)',
            borderLeft: item.isOverdue
              ? '3px solid var(--status-error)'
              : item.longLeadSlipping
              ? '3px solid var(--status-warning)'
              : item.isLate
              ? '3px solid var(--status-warning)'
              : '3px solid transparent',
            gap: 12,
            alignItems: 'center',
          }}>
            <div>
              <div style={{
                fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.description || 'Unnamed Item'}
              </div>
              {wp && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', marginTop: 2 }}>
                  → {wp.wp_number || wp.name}
                </div>
              )}
            </div>
            <div>
              <Pill color={catColor} text={(item.procurement_category || '').split(' ').slice(0, 2).join(' ')} />
            </div>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.vendor || '—'}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.po_number || '—'}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: item.isOverdue ? 'var(--status-error)' : 'var(--text-muted)',
              fontWeight: item.isOverdue ? 700 : 400,
            }}>
              {fmtDate(item.required_date)}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: item.isLate ? 'var(--status-warning)' : 'var(--text-secondary)',
            }}>
              {fmtDate(item.effectiveShipDate)}
              {!item.expected_ship_date && item.computedShipDate && (
                <span style={{ fontSize: 8, color: 'var(--text-muted)', marginLeft: 4 }}>(calc)</span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
              {item.is_long_lead && item.lead_time_weeks ? `${item.lead_time_weeks}wk` : '—'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
              {Number(item.weight_tons || 0) > 0 ? `${Number(item.weight_tons).toFixed(1)}T` : '—'}
            </div>
            <div>
              <StatusBadge status={item.status} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => onEdit(item)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-default)',
                  borderRadius: 4, padding: '3px 8px',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                EDIT
              </button>
              <button
                onClick={() => onDelete(item)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 4, padding: '3px 7px',
                  color: 'var(--status-error)',
                  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Board view — grouped by procurement_category
 * ────────────────────────────────────────────────────────────────── */
function BoardView({ items, wpById, onEdit }) {
  // Bucket by category. Render only categories that have rows so the
  // board doesn't show 10 empty columns on a small project.
  const groups = useMemo(() => {
    const map = new Map();
    for (const i of items) {
      const cat = i.procurement_category || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(i);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  if (groups.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: 40,
        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
        letterSpacing: '0.12em',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-card)',
      }}>
        NO PROCUREMENT ITEMS
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 12,
    }}>
      {groups.map(([cat, rows]) => {
        const color = CAT_COLORS[cat] || 'var(--text-muted)';
        const tons = rows.reduce((s, r) => s + (Number(r.weight_tons) || 0), 0);
        return (
          <div
            key={cat}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-card)',
              borderTop: `3px solid ${color}`,
              padding: 10,
              minHeight: 260,
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 8, gap: 6,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.10em', color, textTransform: 'uppercase',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {cat}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {rows.length}{tons > 0 ? ` · ${tons.toFixed(1)}T` : ''}
              </span>
            </div>
            {rows.map((i) => (
              <PipelineCard key={i.id} item={i} wpById={wpById} onClick={() => onEdit(i)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Form drawer — every column the schema offers
 * ────────────────────────────────────────────────────────────────── */
function ProcurementFormModal({ projectId, item, vendors, workPackages, onClose, onSave, isSaving = false }) {
  void projectId; // unused — Procurement page injects project_id at create
  const initial = item ? {
    ...item,
    metadata: item.metadata || {},
  } : {
    description: '',
    procurement_category: 'Other',
    vendor: '',
    status: 'Identified',
    po_number: '',
    order_placed_date: '',
    required_date: '',
    scheduled_date: '',
    expected_ship_date: '',
    weight_tons: '',
    pieces: '',
    is_long_lead: false,
    lead_time_weeks: '',
    work_package_id: '',
    notes: '',
    metadata: { cost_estimate: '' },
  };
  const [form, setForm] = useState(initial);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setMeta = (k, v) => setForm(f => ({
    ...f,
    metadata: { ...(f.metadata || {}), [k]: v },
  }));

  // Lead-time math: when the user has order_placed AND lead_time_weeks
  // but no expected_ship_date, suggest the computed ship date inline.
  const computedShip = (form.order_placed_date && form.lead_time_weeks)
    ? addWeeks(form.order_placed_date, Number(form.lead_time_weeks))
    : null;

  // Sort WPs by wp_number ascending so the dropdown is browsable. Show
  // both number and short name. Once the project has 50+ WPs we'd
  // swap this for a search input — not yet a problem in practice but
  // flagged in the rebuild brief.
  const sortedWPs = useMemo(
    () => [...workPackages].sort((a, b) =>
      String(a.wp_number || '').localeCompare(String(b.wp_number || ''))
    ),
    [workPackages],
  );

  const handleSave = () => {
    if (isSaving) return;
    if (!form.description?.trim()) return;
    // Coerce numerics — empty strings should hit the DB as null.
    const payload = {
      description: form.description?.trim(),
      procurement_category: form.procurement_category || null,
      vendor: form.vendor?.trim() || null,
      status: form.status || 'Identified',
      po_number: form.po_number?.trim() || null,
      order_placed_date: form.order_placed_date || null,
      required_date: form.required_date || null,
      scheduled_date: form.scheduled_date || null,
      expected_ship_date: form.expected_ship_date
        || (form.order_placed_date && form.lead_time_weeks ? computedShip : null),
      weight_tons: form.weight_tons === '' || form.weight_tons == null ? null : Number(form.weight_tons),
      pieces: form.pieces === '' || form.pieces == null ? null : Number(form.pieces),
      is_long_lead: !!form.is_long_lead,
      lead_time_weeks: form.lead_time_weeks === '' || form.lead_time_weeks == null
        ? null
        : Number(form.lead_time_weeks),
      work_package_id: form.work_package_id || null,
      notes: form.notes?.trim() || null,
      metadata: {
        ...(form.metadata || {}),
        cost_estimate: form.metadata?.cost_estimate || null,
      },
    };
    onSave(payload);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-surface-secondary)',
        border: '1px solid var(--border-default)',
        borderRadius: 16, padding: 24,
        maxWidth: 720, width: '95%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
          color: 'var(--text-primary)', margin: '0 0 20px 0',
          textTransform: 'uppercase', letterSpacing: '0.10em',
        }}>
          {item ? 'Edit Procurement Item' : 'Add Procurement Item'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* IDENTIFICATION */}
          <div style={sectionLabelStyle}>Identification</div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Item Description *</label>
            <input
              style={iStyle}
              value={form.description || ''}
              onChange={e => set('description', e.target.value)}
              required
              placeholder="e.g. W-Shape Mill Order, Joist Package A"
            />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select
              style={iStyle}
              value={form.procurement_category || 'Other'}
              onChange={e => set('procurement_category', e.target.value)}
            >
              {PROCUREMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Vendor / Supplier</label>
            <input
              style={iStyle}
              value={form.vendor || ''}
              onChange={e => set('vendor', e.target.value)}
              placeholder="Vendor name"
              list="vendor-list"
            />
            <datalist id="vendor-list">
              {vendors.map(v => (
                <option key={v.id} value={v.company_name} />
              ))}
            </datalist>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Estimated Value ($)</label>
            <input
              style={iStyle}
              value={form?.metadata?.cost_estimate || ''}
              onChange={e => setMeta('cost_estimate', e.target.value)}
              placeholder="e.g. 125000 — stored in metadata.cost_estimate"
            />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.06em' }}>
              Stored on metadata.cost_estimate (no dedicated column on deliveries).
            </div>
          </div>

          {/* PO & STATUS */}
          <div style={sectionLabelStyle}>PO &amp; Status</div>
          <div>
            <label style={labelStyle}>PO Number</label>
            <input
              style={iStyle}
              value={form.po_number || ''}
              onChange={e => set('po_number', e.target.value)}
              placeholder="e.g. PO-2024-0142"
            />
          </div>
          <div>
            <label style={labelStyle}>Order Placed Date</label>
            <input
              type="date"
              style={iStyle}
              value={form.order_placed_date || ''}
              onChange={e => set('order_placed_date', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select
              style={iStyle}
              value={form.status || 'Identified'}
              onChange={e => set('status', e.target.value)}
            >
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Linked Work Package</label>
            <select
              style={iStyle}
              value={form.work_package_id || ''}
              onChange={e => set('work_package_id', e.target.value)}
            >
              <option value="">— None —</option>
              {sortedWPs.map(wp => (
                <option key={wp.id} value={wp.id}>
                  {wp.wp_number || wp.id.slice(0, 6)} · {wp.name || 'WP'}
                </option>
              ))}
            </select>
          </div>

          {/* SCHEDULE */}
          <div style={sectionLabelStyle}>Schedule</div>
          <div>
            <label style={labelStyle}>Required On Site Date</label>
            <input
              type="date"
              style={iStyle}
              value={form.required_date || ''}
              onChange={e => set('required_date', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Promised Date</label>
            <input
              type="date"
              style={iStyle}
              value={form.scheduled_date || ''}
              onChange={e => set('scheduled_date', e.target.value)}
            />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Expected Ship Date</label>
            <input
              type="date"
              style={iStyle}
              value={form.expected_ship_date || ''}
              onChange={e => set('expected_ship_date', e.target.value)}
              placeholder={computedShip ? `Auto: ${computedShip}` : 'YYYY-MM-DD'}
            />
            {!form.expected_ship_date && computedShip && (
              <button
                type="button"
                onClick={() => set('expected_ship_date', computedShip)}
                style={{
                  marginTop: 4,
                  background: 'transparent',
                  border: '1px solid var(--accent)',
                  borderRadius: 4, padding: '3px 8px',
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.06em',
                }}
              >
                USE COMPUTED · {computedShip} ({form.lead_time_weeks}wk from order)
              </button>
            )}
          </div>

          {/* MATERIAL */}
          <div style={sectionLabelStyle}>Material</div>
          <div>
            <label style={labelStyle}>Weight (tons)</label>
            <input
              type="number"
              step="0.1"
              style={iStyle}
              value={form.weight_tons ?? ''}
              onChange={e => set('weight_tons', e.target.value)}
              placeholder="0.0"
            />
          </div>
          <div>
            <label style={labelStyle}>Pieces</label>
            <input
              type="number"
              step="1"
              style={iStyle}
              value={form.pieces ?? ''}
              onChange={e => set('pieces', e.target.value)}
              placeholder="0"
            />
          </div>

          {/* LONG LEAD */}
          <div style={sectionLabelStyle}>Long-Lead</div>
          <div>
            <label style={{
              ...labelStyle, display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', marginBottom: 0, marginTop: 6,
            }}>
              <input
                type="checkbox"
                checked={!!form.is_long_lead}
                onChange={e => set('is_long_lead', e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer' }}
              />
              <span>Mark as long-lead item</span>
            </label>
          </div>
          <div>
            <label style={labelStyle}>Lead Time (weeks)</label>
            <input
              type="number"
              step="1"
              min="0"
              style={iStyle}
              value={form.lead_time_weeks ?? ''}
              onChange={e => set('lead_time_weeks', e.target.value)}
              placeholder="e.g. 16"
              disabled={!form.is_long_lead}
            />
          </div>

          {/* NOTES */}
          <div style={sectionLabelStyle}>Notes</div>
          <div style={{ gridColumn: 'span 2' }}>
            <textarea
              style={{ ...iStyle, minHeight: 60, resize: 'vertical' }}
              value={form.notes || ''}
              onChange={e => set('notes', e.target.value)}
              placeholder="PO terms, special requirements, vendor contact..."
            />
          </div>

          <div style={{
            gridColumn: 'span 2', display: 'flex', gap: 8,
            justifyContent: 'flex-end', paddingTop: 12,
            borderTop: '1px solid var(--divider)', marginTop: 4,
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 8, padding: '8px 16px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                cursor: isSaving ? 'not-allowed' : 'pointer', textTransform: 'uppercase',
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !form.description?.trim()}
              style={{
                background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 8, padding: '8px 20px',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                cursor: isSaving || !form.description?.trim() ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
                opacity: isSaving || !form.description?.trim() ? 0.5 : 1,
              }}
            >
              {isSaving ? (item ? 'Saving...' : 'Adding...') : (item ? 'Save' : 'Add Item')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-export for any future inline-test convenience.
export { addWeeks, daysBetween };
// `todayISO` is used internally; export keeps it tree-shakable for tests
// without polluting the module-level import surface.
void todayISO;
