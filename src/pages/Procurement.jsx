import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectContext } from '../components/shared/useProjectContext';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import DeleteDialog from '@/components/shared/DeleteDialog';
import StatusBadge from '@/components/shared/StatusBadge';
import { CommandBar, KpiTile } from '@/components/design-system';
import { Plus } from 'lucide-react';

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
  'Galvanizing / Paint / Coating': '#F59E0B',
  'Long-Lead Item': 'var(--status-error)',
  'Hardware & Fasteners': 'var(--text-secondary)',
  'Equipment Rental': 'var(--phase-erection)',
  'Other': 'var(--text-muted)',
};

const STATUSES = [
  'Identified', 'Quoted', 'PO Issued', 'Confirmed',
  'In Production', 'Shipped', 'Received', 'Cancelled',
];

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

export default function Procurement() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get('project') || activeProject?.id || null;
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterCat, setFilterCat] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['procurement', projectId],
    queryFn: () => projectId
      ? base44.entities.Delivery.filter({ project_id: projectId, delivery_type: 'PROCUREMENT' })
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

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Delivery.create({
      ...data,
      delivery_type: 'PROCUREMENT',
      project_id: projectId,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement'] });
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
      setShowForm(false);
      setEditing(null);
      toast.success('Item updated');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Delivery.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ['procurement'] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      setDeleteTarget(null);
      toast.success('Item removed');
    },
  });

  const today = new Date();

  const enriched = useMemo(() => items.map(item => {
    const required = item.required_date ? new Date(item.required_date) : null;
    const promised = item.scheduled_date ? new Date(item.scheduled_date) : null;
    const isLate = required && promised && promised > required
      && !['Received', 'Cancelled'].includes(item.status);
    const isOverdue = required && !['Received', 'Cancelled'].includes(item.status)
      && required < today;
    const diff = required && promised ? promised - required : NaN;
    const daysExposure = Number.isFinite(diff) ? Math.ceil(diff / 86400000) : null;
    return { ...item, isLate, isOverdue, daysExposure };
  }), [items, today]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter(item => {
      if (filterCat !== 'all' && item.procurement_category !== filterCat) return false;
      if (filterStatus !== 'all' && item.status !== filterStatus) return false;
      if (q && !(
        item.description?.toLowerCase().includes(q) ||
        item.vendor_name?.toLowerCase().includes(q)
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
    late: enriched.filter(i => i.isLate).length,
    longLead: items.filter(i => i.procurement_category === 'Long-Lead Item').length,
  }), [items, enriched]);

  const selectedProject = projects.find(p => p.id === projectId);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <CommandBar
        eyebrow={selectedProject?.name || "PROCUREMENT"}
        title="Procurement Tracker"
        count={kpis.total}
        unit=" · ITEMS"
        subtitle={`${kpis.open} open · ${kpis.overdue} overdue · ${kpis.longLead} long-lead`}
      >
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
        <KpiTile compact label="Total Items"   value={kpis.total}    color="var(--accent)" />
        <KpiTile compact label="Open"          value={kpis.open}     color="var(--status-warning)" />
        <KpiTile compact label="Overdue"       value={kpis.overdue}  color="var(--status-error)" />
        <KpiTile compact label="Date Slippage" value={kpis.late}     color="var(--status-warning)" />
        <KpiTile compact label="Long Lead"     value={kpis.longLead} color="var(--status-review)" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...iStyle, width: 220, height: 32, padding: '0 12px' }}
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
          onChange={e => setFilterStatus(e.target.value)}
          style={{ ...iStyle, width: 'auto', height: 32, padding: '0 10px' }}
        >
          <option value="all">All Status</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-card)', overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 140px 100px 100px 100px 80px 100px',
          padding: '10px 16px',
          background: 'var(--bg-sidebar)',
          borderBottom: '1px solid var(--divider)',
          gap: 12,
        }}>
          {['Item / Vendor', 'Category', 'Status', 'Required Date', 'Promised Date', 'Lag', 'Actions'].map(col => (
            <div key={col} style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
              color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              {col}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 32, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
            LOADING...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
            NO PROCUREMENT ITEMS
          </div>
        ) : filtered.map(item => {
          const catColor = CAT_COLORS[item.procurement_category] || 'var(--text-muted)';
          return (
            <div key={item.id} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 140px 100px 100px 100px 80px 100px',
              padding: '10px 16px',
              borderBottom: '1px solid var(--divider)',
              borderLeft: item.isOverdue
                ? '3px solid var(--status-error)'
                : item.isLate
                ? '3px solid var(--status-warning)'
                : '3px solid transparent',
              gap: 12,
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {item.description || 'Unnamed Item'}
                </div>
                {item.vendor_name && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                    {item.vendor_name}
                  </div>
                )}
              </div>
              <div>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                  color: catColor, background: catColor + '18',
                  padding: '2px 7px', borderRadius: 4,
                  textTransform: 'uppercase', display: 'inline-block',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', maxWidth: '100%',
                }}>
                  {item.procurement_category?.split(' ')[0] || 'Other'}
                </span>
              </div>
              <div>
                <StatusBadge status={item.status} />
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: item.isOverdue ? 'var(--status-error)' : 'var(--text-muted)',
                fontWeight: item.isOverdue ? 700 : 400,
              }}>
                {item.required_date
                  ? new Date(item.required_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: item.isLate ? 'var(--status-warning)' : 'var(--text-secondary)',
              }}>
                {item.scheduled_date
                  ? new Date(item.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                color: item.isLate
                  ? 'var(--status-warning)'
                  : item.daysExposure !== null && item.daysExposure < 0
                  ? 'var(--status-success)'
                  : 'var(--text-muted)',
              }}>
                {item.daysExposure !== null
                  ? item.daysExposure > 0 ? `+${item.daysExposure}d` : `${item.daysExposure}d`
                  : '—'}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => { setEditing(item); setShowForm(true); }}
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
                  onClick={() => setDeleteTarget(item)}
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

      {/* Form Modal */}
      {showForm && (
        <ProcurementFormModal
          projectId={projectId}
          item={editing}
          vendors={vendors}
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
        title="Remove Item"
        description="Remove this procurement item? Cannot be undone."
      />
    </div>
  );
}

function ProcurementFormModal({ projectId, item, vendors, onClose, onSave, isSaving = false }) {
  const [form, setForm] = useState(item ? { ...item } : {
    description: '',
    procurement_category: 'Other',
    vendor_name: '',
    status: 'Identified',
    required_date: '',
    scheduled_date: '',
    notes: '',
    amount: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
        maxWidth: 560, width: '95%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
          color: 'var(--text-primary)', margin: '0 0 20px 0',
          textTransform: 'uppercase', letterSpacing: '0.10em',
        }}>
          {item ? 'Edit Item' : 'Add Procurement Item'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
              {PROCUREMENT_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <select
              style={iStyle}
              value={form.status || 'Identified'}
              onChange={e => set('status', e.target.value)}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Vendor / Supplier</label>
            <input
              style={iStyle}
              value={form.vendor_name || ''}
              onChange={e => set('vendor_name', e.target.value)}
              placeholder="Vendor name"
              list="vendor-list"
            />
            <datalist id="vendor-list">
              {vendors.map(v => (
                <option key={v.id} value={v.company_name} />
              ))}
            </datalist>
          </div>

          <div>
            <label style={labelStyle}>Estimated Value ($)</label>
            <input
              type="number"
              style={iStyle}
              value={form.amount || ''}
              onChange={e => set('amount', e.target.value)}
              placeholder="0"
            />
          </div>

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
            <label style={labelStyle}>Promised / Scheduled Date</label>
            <input
              type="date"
              style={iStyle}
              value={form.scheduled_date || ''}
              onChange={e => set('scheduled_date', e.target.value)}
            />
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...iStyle, minHeight: 60, resize: 'vertical' }}
              value={form.notes || ''}
              onChange={e => set('notes', e.target.value)}
              placeholder="PO number, lead time, special requirements..."
            />
          </div>

          <div style={{
            gridColumn: 'span 2', display: 'flex', gap: 8,
            justifyContent: 'flex-end', paddingTop: 8,
            borderTop: '1px solid var(--divider)',
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
              onClick={() => {
                if (!isSaving) {
                  onSave(form);
                }
              }}
              disabled={isSaving || !form.description?.trim()}
              style={{
                background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 8, padding: '8px 20px',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                cursor: isSaving || !form.description?.trim() ? 'not-allowed' : 'pointer', textTransform: 'uppercase',
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
