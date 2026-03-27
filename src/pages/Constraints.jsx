import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectContext } from '../components/shared/useProjectContext';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import DeleteDialog from '@/components/shared/DeleteDialog';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '../components/shared/formatters';

const CONSTRAINT_TYPES = [
  'Missing Embeds',
  'Anchor Bolt Issue',
  'Approved Submittal Missing',
  'Release Pending',
  'Field Measurement Needed',
  'Access Issue',
  'Crane / Logistics Conflict',
  'Predecessor Not Complete',
  'Material Not Available',
  'Design Change Pending',
  'Other',
];

const TYPE_ICONS = {
  'Missing Embeds': '⊗',
  'Anchor Bolt Issue': '⊘',
  'Approved Submittal Missing': '📋',
  'Release Pending': '⏸',
  'Field Measurement Needed': '📐',
  'Access Issue': '🚧',
  'Crane / Logistics Conflict': '🏗',
  'Predecessor Not Complete': '⛓',
  'Material Not Available': '📦',
  'Design Change Pending': '✏',
  'Other': '◈',
};

const TYPE_COLORS = {
  'Missing Embeds': 'var(--status-error)',
  'Anchor Bolt Issue': 'var(--status-error)',
  'Approved Submittal Missing': 'var(--status-warning)',
  'Release Pending': 'var(--status-warning)',
  'Field Measurement Needed': 'var(--accent)',
  'Access Issue': 'var(--status-error)',
  'Crane / Logistics Conflict': 'var(--status-error)',
  'Predecessor Not Complete': 'var(--status-warning)',
  'Material Not Available': 'var(--status-warning)',
  'Design Change Pending': 'var(--accent)',
  'Other': 'var(--text-muted)',
};

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

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

export default function Constraints() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get('project') || activeProject?.id || null;
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('open');
  const [search, setSearch] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['constraints', projectId],
    queryFn: () => projectId
      ? base44.entities.ActionItem.filter({ project_id: projectId, category: 'CONSTRAINT' })
      : [],
    enabled: !!projectId,
    initialData: [],
  });

  const { data: wps = [] } = useQuery({
    queryKey: ['wps', projectId],
    queryFn: () => projectId
      ? base44.entities.WorkPackage.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ActionItem.create({ ...data, category: 'CONSTRAINT', project_id: projectId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['constraints'] }); setShowForm(false); toast.success('Constraint added'); },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ActionItem.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['constraints'] }); setShowForm(false); setEditing(null); toast.success('Constraint updated'); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ActionItem.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['constraints'] }); setDeleteTarget(null); toast.success('Constraint removed'); },
    onError: () => toast.error('Delete failed'),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(c => {
      if (filterType !== 'all' && c.constraint_type !== filterType) return false;
      if (filterStatus !== 'all') {
        if (filterStatus === 'open' && ['Resolved', 'Closed'].includes(c.status)) return false;
        if (filterStatus !== 'open' && c.status !== filterStatus) return false;
      }
      if (q && !(c.title?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || c.project_area?.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => {
      const aOverdue = a.due_date && new Date(a.due_date) < new Date();
      const bOverdue = b.due_date && new Date(b.due_date) < new Date();
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
      return 0;
    });
  }, [items, filterType, filterStatus, search]);

  const kpis = useMemo(() => {
    const open = items.filter(c => !['Resolved', 'Closed'].includes(c.status));
    const overdue = open.filter(c => c.due_date && new Date(c.due_date) < new Date());
    const byType = CONSTRAINT_TYPES.map(t => ({ type: t, count: open.filter(c => c.constraint_type === t).length })).filter(t => t.count > 0).sort((a, b) => b.count - a.count);
    return { open, overdue, byType };
  }, [items]);

  const selectedProject = projects.find(p => p.id === projectId);

  if (!projectId) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚧</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Select a project</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Constraint Log</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {selectedProject?.name || 'All Projects'} · {kpis.open.length} open{kpis.overdue.length > 0 ? ` · ${kpis.overdue.length} overdue` : ''}
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-btn)', padding: '8px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}
        >
          + Log Constraint
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
        {[
          { label: 'Open', value: kpis.open.length, color: kpis.open.length > 0 ? 'var(--status-warning)' : 'var(--status-success)' },
          { label: 'Overdue', value: kpis.overdue.length, color: kpis.overdue.length > 0 ? 'var(--status-error)' : 'var(--text-muted)' },
          { label: 'Resolved', value: items.filter(c => c.status === 'Resolved').length, color: 'var(--status-success)' },
          { label: 'Top Type', value: kpis.byType[0]?.type?.split(' ').slice(0, 2).join(' ') || '—', color: kpis.byType[0] ? TYPE_COLORS[kpis.byType[0].type] : 'var(--text-muted)', small: true },
        ].map(({ label, value, color, small }, i) => (
          <div key={label} style={{ padding: '12px 16px', borderRight: i < 3 ? '1px solid var(--divider)' : 'none' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: small ? 12 : 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Overdue banner */}
      {kpis.overdue.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: 'var(--danger-muted)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-card)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--status-error)', letterSpacing: '0.08em' }}>
            ⚠ {kpis.overdue.length} CONSTRAINT{kpis.overdue.length > 1 ? 'S' : ''} PAST DUE DATE — resolution required
          </span>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...iStyle, width: 220, height: 32, padding: '0 12px' }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...iStyle, width: 'auto', height: 32, padding: '0 10px' }}>
          <option value="all">All Status</option>
          <option value="open">Open</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...iStyle, width: 'auto', height: 32, padding: '0 10px' }}>
          <option value="all">All Types</option>
          {CONSTRAINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Constraint cards */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>LOADING...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-card)', padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--status-success)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {filterStatus === 'open' ? '✓ NO OPEN CONSTRAINTS' : 'NO CONSTRAINTS FOUND'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(c => {
            const isOverdue = c.due_date && new Date(c.due_date) < new Date() && !['Resolved', 'Closed'].includes(c.status);
            const color = TYPE_COLORS[c.constraint_type] || 'var(--text-muted)';
            const icon = TYPE_ICONS[c.constraint_type] || '◈';
            const wp = wps.find(w => w.id === c.work_package_id);

            return (
              <div key={c.id} style={{
                background: 'var(--bg-surface)',
                border: `1px solid ${isOverdue ? 'var(--danger-border)' : 'var(--border-default)'}`,
                borderLeft: `4px solid ${color}`,
                borderRadius: 'var(--radius-card)',
                padding: '14px 16px',
                display: 'grid',
                gridTemplateColumns: '32px 1fr auto',
                gap: 12,
                alignItems: 'flex-start',
              }}>
                <div style={{ fontSize: 20, lineHeight: 1.3, textAlign: 'center' }}>{icon}</div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em', background: color + '18', padding: '2px 7px', borderRadius: 4 }}>
                      {c.constraint_type || 'Other'}
                    </span>
                    <StatusBadge status={c.status} />
                    {isOverdue && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--status-error)', background: 'var(--danger-muted)', padding: '2px 7px', borderRadius: 4 }}>OVERDUE</span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{c.title}</div>
                  {c.description && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 6 }}>{c.description}</div>
                  )}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {c.project_area && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>📍 {c.project_area}</span>}
                    {wp && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)' }}>📦 {wp.wp_number} {wp.name}</span>}
                    {c.due_date && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: isOverdue ? 'var(--status-error)' : 'var(--text-muted)', fontWeight: isOverdue ? 700 : 400 }}>
                        📅 Due {new Date(c.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {c.assigned_to && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>👤 {c.assigned_to}</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {c.status !== 'Resolved' && c.status !== 'Closed' && (
                    <button
                      onClick={() => updateMut.mutate({ id: c.id, data: { status: 'Resolved' } })}
                      style={{ background: 'var(--success-muted)', border: '1px solid var(--success-border)', borderRadius: 4, padding: '4px 10px', color: 'var(--status-success)', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      ✓ RESOLVE
                    </button>
                  )}
                  <button
                    onClick={() => { setEditing(c); setShowForm(true); }}
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 4, padding: '4px 10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, cursor: 'pointer' }}
                  >
                    EDIT
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    style={{ background: 'transparent', border: '1px solid var(--danger-border)', borderRadius: 4, padding: '4px 10px', color: 'var(--status-error)', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <ConstraintFormModal
          projectId={projectId}
          constraint={editing}
          wps={wps}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={(data) => {
            if (editing) { updateMut.mutate({ id: editing.id, data }); }
            else { createMut.mutate(data); }
          }}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Remove Constraint"
        description="Remove this constraint from the log? Cannot be undone."
      />
    </div>
  );
}

function ConstraintFormModal({ projectId, constraint, wps, onClose, onSave }) {
  const [form, setForm] = useState(constraint ? { ...constraint } : {
    title: '', constraint_type: 'Other', description: '', project_area: '',
    work_package_id: '', assigned_to: '', due_date: '', status: 'Open', priority: 'High',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title?.trim()) return;
    onSave(form);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 24, maxWidth: 600, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
          {constraint ? 'Edit Constraint' : 'Log Constraint'}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Constraint Type *</label>
            <select style={iStyle} value={form.constraint_type} onChange={e => set('constraint_type', e.target.value)} required>
              {CONSTRAINT_TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Title *</label>
            <input style={iStyle} value={form.title} onChange={e => set('title', e.target.value)} required placeholder="Brief description of constraint" />
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Details</label>
            <textarea style={{ ...iStyle, minHeight: 70, resize: 'vertical' }} value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="What is blocking, what is needed to resolve..." />
          </div>

          <div>
            <label style={labelStyle}>Project Area / Grid</label>
            <input style={iStyle} value={form.project_area || ''} onChange={e => set('project_area', e.target.value)} placeholder="e.g. Grid C-D, Level 2" />
          </div>

          <div>
            <label style={labelStyle}>Work Package</label>
            <select style={iStyle} value={form.work_package_id || ''} onChange={e => set('work_package_id', e.target.value)}>
              <option value="">— None —</option>
              {wps.map(wp => <option key={wp.id} value={wp.id}>{wp.wp_number} {wp.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Assigned To</label>
            <input style={iStyle} value={form.assigned_to || ''} onChange={e => set('assigned_to', e.target.value)} placeholder="Name or role" />
          </div>

          <div>
            <label style={labelStyle}>Due Date</label>
            <input type="date" style={iStyle} value={form.due_date || ''} onChange={e => set('due_date', e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <select style={iStyle} value={form.status || 'Open'} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Priority</label>
            <select style={iStyle} value={form.priority || 'High'} onChange={e => set('priority', e.target.value)}>
              {['Critical', 'High', 'Medium', 'Low'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--divider)' }}>
            <button type="button" onClick={onClose} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 16px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>Cancel</button>
            <button type="submit" style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>
              {constraint ? 'Save Changes' : 'Log Constraint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}