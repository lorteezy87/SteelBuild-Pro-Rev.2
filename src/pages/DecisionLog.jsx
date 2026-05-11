import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DeleteDialog from '@/components/shared/DeleteDialog';
import PhoenixModal, { FormField, btnPrimary, btnSecondary, inputStyle } from '@/components/shared/PhoenixModal';
import { formatDate } from '@/components/shared/formatters';
import { toast } from 'sonner';
import { CommandBar } from '@/components/design-system';
import { Plus } from 'lucide-react';
import { useProjectId } from "@/hooks/useProjectId";

const fmtDate = (d) => {
  if (!d) return '—';
  return formatDate(d);
};

const IMPACT_COLORS = {
  Critical: 'var(--status-error)',
  High: 'var(--status-warning)',
  Medium: 'var(--status-info)',
  Low: 'var(--text-muted)',
};

export default function DecisionLog() {
  const projectId = useProjectId();

  const [activeTab, setActiveTab] = useState('decisions');
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [showAssumptionForm, setShowAssumptionForm] = useState(false);
  const [editingDecision, setEditingDecision] = useState(null);
  const [editingAssumption, setEditingAssumption] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteType, setDeleteType] = useState(null);
  const [filterImpact, setFilterImpact] = useState('all');
  const [search, setSearch] = useState('');

  const qc = useQueryClient();

  const { data: decisions = [], isLoading: loadingD } = useQuery({
    queryKey: ['decisions', projectId],
    queryFn: () => base44.entities.PmaDecision.filter({ project_id: projectId }, '-created_date'),
    enabled: !!projectId,
  });

  const { data: assumptions = [], isLoading: loadingA } = useQuery({
    queryKey: ['assumptions', projectId],
    queryFn: () => base44.entities.PmaAssumption.filter({ project_id: projectId }, '-created_date'),
    enabled: !!projectId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const createDecision = useMutation({
    mutationFn: (data) => base44.entities.PmaDecision.create({ ...data, project_id: projectId, created_date: data.created_date || new Date().toISOString().split('T')[0] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['decisions'] }); toast.success('Decision logged'); setShowDecisionForm(false); setEditingDecision(null); },
    onError: (e) => toast.error('Failed: ' + (e?.message || 'Unknown error')),
  });
  const updateDecision = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PmaDecision.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['decisions'] }); toast.success('Decision updated'); setShowDecisionForm(false); setEditingDecision(null); },
    onError: (e) => toast.error('Failed: ' + (e?.message || 'Unknown error')),
  });
  const deleteDecision = useMutation({
    mutationFn: (id) => base44.entities.PmaDecision.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['decisions'] }); toast.success('Decision removed'); setDeleteTarget(null); },
    onError: (e) => toast.error('Failed: ' + (e?.message || 'Unknown error')),
  });
  const createAssumption = useMutation({
    mutationFn: (data) => base44.entities.PmaAssumption.create({ ...data, project_id: projectId, created_date: data.created_date || new Date().toISOString().split('T')[0] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assumptions'] }); toast.success('Assumption logged'); setShowAssumptionForm(false); setEditingAssumption(null); },
    onError: (e) => toast.error('Failed: ' + (e?.message || 'Unknown error')),
  });
  const updateAssumption = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PmaAssumption.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assumptions'] }); toast.success('Assumption updated'); setShowAssumptionForm(false); setEditingAssumption(null); },
    onError: (e) => toast.error('Failed: ' + (e?.message || 'Unknown error')),
  });
  const deleteAssumption = useMutation({
    mutationFn: (id) => base44.entities.PmaAssumption.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assumptions'] }); toast.success('Assumption removed'); setDeleteTarget(null); },
    onError: (e) => toast.error('Failed: ' + (e?.message || 'Unknown error')),
  });

  const today = useMemo(() => new Date(), []);

  const filteredDecisions = useMemo(() => {
    const q = search.toLowerCase();
    return decisions.filter(d => {
      if (filterImpact !== 'all' && d.impact_level !== filterImpact) return false;
      if (q && !(d.decision_text?.toLowerCase().includes(q) || d.decided_by?.toLowerCase().includes(q) || d.rationale?.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => {
      const da = a.created_date ? new Date(a.created_date) : new Date(0);
      const db = b.created_date ? new Date(b.created_date) : new Date(0);
      return db - da;
    });
  }, [decisions, filterImpact, search]);

  const filteredAssumptions = useMemo(() => {
    const q = search.toLowerCase();
    return assumptions.filter(a => {
      if (filterImpact !== 'all' && a.impact !== filterImpact) return false;
      if (q && !(a.assumption_text?.toLowerCase().includes(q) || a.made_by?.toLowerCase().includes(q) || a.source_document?.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => {
      const aOverdue = a.review_date && new Date(a.review_date) < today && a.status === 'Active';
      const bOverdue = b.review_date && new Date(b.review_date) < today && b.status === 'Active';
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      const da = a.created_date ? new Date(a.created_date) : new Date(0);
      const db = b.created_date ? new Date(b.created_date) : new Date(0);
      return db - da;
    });
  }, [assumptions, filterImpact, search, today]);

  const selectedProject = projects.find(p => p.id === projectId);
  const overdueAssumptions = assumptions.filter(a => a.review_date && new Date(a.review_date) < today && a.status === 'Active').length;

  if (!projectId) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Select a project
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <CommandBar
        eyebrow={selectedProject?.name || "PROJECT"}
        title="Decision Log"
        count={decisions.length}
        unit={` · ${assumptions.length} ASSUMPTIONS`}
        subtitle={`${overdueAssumptions || 0} assumptions past verify-by date · PMA decision audit trail`}
      >
        <button
          onClick={() => {
            if (activeTab === 'decisions') { setEditingDecision(null); setShowDecisionForm(true); }
            else { setEditingAssumption(null); setShowAssumptionForm(true); }
          }}
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
          <Plus size={12} /> Log {activeTab === 'decisions' ? 'Decision' : 'Assumption'}
        </button>
      </CommandBar>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--divider)' }}>
        {[
          { id: 'decisions', label: 'Decisions', count: decisions.length, urgent: false },
          { id: 'assumptions', label: 'Assumptions', count: assumptions.filter(a => a.status === 'Active').length, urgent: overdueAssumptions > 0 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSearch(''); setFilterImpact('all'); }}
            style={{
              background: 'none', border: 'none', padding: '10px 16px',
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {tab.label}
            <span style={{
              background: activeTab === tab.id ? 'var(--accent-muted)' : 'var(--bg-surface-high)',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              borderRadius: 10, padding: '1px 6px', fontSize: 8,
            }}>
              {tab.count}
            </span>
            {tab.urgent && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-error)' }} />}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...iStyle, width: 240, height: 32, padding: '0 12px' }}
        />
        <select
          value={filterImpact}
          onChange={e => setFilterImpact(e.target.value)}
          style={{ ...iStyle, width: 'auto', height: 32, padding: '0 10px' }}
        >
          <option value="all">All Impact</option>
          {['Critical', 'High', 'Medium', 'Low'].map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      {/* DECISIONS TAB */}
      {activeTab === 'decisions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loadingD ? (
            <div style={{ textAlign: 'center', padding: 32, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>LOADING...</div>
          ) : filteredDecisions.length === 0 ? (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-card)', padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
              NO DECISIONS LOGGED YET
            </div>
          ) : filteredDecisions.map(d => {
            const impactColor = IMPACT_COLORS[d.impact_level] || 'var(--text-muted)';
            return (
              <div key={d.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderLeft: `4px solid ${impactColor}`, borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: impactColor, background: impactColor + '18', padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' }}>
                        {d.impact_level || 'Medium'}
                      </span>
                      {d.phase && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', background: 'var(--bg-surface-high)', padding: '2px 7px', borderRadius: 4 }}>
                          {d.phase}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.4 }}>
                      {d.decision_text}
                    </div>
                    {d.rationale && (
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8, paddingLeft: 10, borderLeft: '2px solid var(--divider)' }}>
                        {d.rationale}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {d.decided_by && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>👤 {d.decided_by}</span>}
                      {d.created_date && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>📅 {fmtDate(d.created_date)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => { setEditingDecision(d); setShowDecisionForm(true); }} style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, cursor: 'pointer' }}>EDIT</button>
                    <button onClick={() => { setDeleteTarget(d); setDeleteType('decision'); }} style={{ background: 'transparent', border: '1px solid var(--danger-border)', borderRadius: 4, padding: '3px 7px', color: 'var(--status-error)', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ASSUMPTIONS TAB */}
      {activeTab === 'assumptions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loadingA ? (
            <div style={{ textAlign: 'center', padding: 32, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>LOADING...</div>
          ) : filteredAssumptions.length === 0 ? (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-card)', padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
              NO ASSUMPTIONS LOGGED YET
            </div>
          ) : filteredAssumptions.map(a => {
            const impactColor = IMPACT_COLORS[a.impact] || 'var(--text-muted)';
            const isOverdueReview = a.review_date && new Date(a.review_date) < today && a.status === 'Active';
            return (
              <div key={a.id} style={{ background: 'var(--bg-surface)', border: `1px solid ${isOverdueReview ? 'var(--danger-border)' : 'var(--border-default)'}`, borderLeft: `4px solid ${impactColor}`, borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: impactColor, background: impactColor + '18', padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' }}>
                        {a.impact || 'Medium'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: a.status === 'Active' ? 'var(--status-success)' : 'var(--text-muted)', background: 'var(--bg-surface-high)', padding: '2px 7px', borderRadius: 4 }}>
                        {a.status}
                      </span>
                      {isOverdueReview && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--status-error)', background: 'var(--danger-muted)', padding: '2px 7px', borderRadius: 4 }}>
                          ⚠ REVIEW OVERDUE
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.4 }}>
                      {a.assumption_text}
                    </div>
                    {a.risk_if_wrong && (
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--status-warning)', lineHeight: 1.5, marginBottom: 8, paddingLeft: 10, borderLeft: '2px solid var(--status-warning)' }}>
                        ⚠ Risk: {a.risk_if_wrong}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {a.made_by && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>👤 {a.made_by}</span>}
                      {a.source_document && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)' }}>📄 {a.source_document}</span>}
                      {a.review_date && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: isOverdueReview ? 'var(--status-error)' : 'var(--text-muted)', fontWeight: isOverdueReview ? 700 : 400 }}>🔁 Review {fmtDate(a.review_date)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    {a.status === 'Active' && (
                      <button
                        onClick={() => updateAssumption.mutate({ id: a.id, data: { status: 'Verified' } })}
                        style={{ background: 'var(--success-muted)', border: '1px solid var(--success-border)', borderRadius: 4, padding: '3px 8px', color: 'var(--status-success)', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        ✓ VERIFY
                      </button>
                    )}
                    <button onClick={() => { setEditingAssumption(a); setShowAssumptionForm(true); }} style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, cursor: 'pointer' }}>EDIT</button>
                    <button onClick={() => { setDeleteTarget(a); setDeleteType('assumption'); }} style={{ background: 'transparent', border: '1px solid var(--danger-border)', borderRadius: 4, padding: '3px 7px', color: 'var(--status-error)', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Decision Form Modal */}
      {showDecisionForm && (
        <DecisionFormModal
          decision={editingDecision}
          onClose={() => { setShowDecisionForm(false); setEditingDecision(null); }}
          onSave={(data) => {
            if (editingDecision) updateDecision.mutate({ id: editingDecision.id, data });
            else createDecision.mutate(data);
          }}
        />
      )}

      {/* Assumption Form Modal */}
      {showAssumptionForm && (
        <AssumptionFormModal
          assumption={editingAssumption}
          onClose={() => { setShowAssumptionForm(false); setEditingAssumption(null); }}
          onSave={(data) => {
            if (editingAssumption) updateAssumption.mutate({ id: editingAssumption.id, data });
            else createAssumption.mutate(data);
          }}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteType(null); }}
        onConfirm={() => {
          if (deleteType === 'decision') deleteDecision.mutate(deleteTarget.id);
          else deleteAssumption.mutate(deleteTarget.id);
        }}
        title={`Remove ${deleteType === 'decision' ? 'Decision' : 'Assumption'}`}
        description="Remove from log? Cannot be undone."
      />
    </div>
  );
}

function DecisionFormModal({ decision, onClose, onSave }) {
  const [form, setForm] = useState(decision ? { ...decision } : {
    decision_text: '', decided_by: '', rationale: '', phase: 'Fabrication', impact_level: 'High',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <PhoenixModal
      open
      onClose={onClose}
      title={decision ? 'Edit Decision' : 'Log Decision'}
      maxWidth={560}
      footer={<>
        <button type="button" style={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" style={btnPrimary} onClick={() => onSave(form)}>
          {decision ? 'Save' : 'Log Decision'}
        </button>
      </>}
    >
      <form onSubmit={e => { e.preventDefault(); onSave(form); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Decision *">
          <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
            value={form.decision_text || ''} onChange={e => set('decision_text', e.target.value)}
            required placeholder="What was decided?" />
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormField label="Decided By">
            <input style={inputStyle} value={form.decided_by || ''} onChange={e => set('decided_by', e.target.value)} placeholder="Name or role" />
          </FormField>
          <FormField label="Phase">
            <select style={inputStyle} value={form.phase || 'Fabrication'} onChange={e => set('phase', e.target.value)}>
              {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </FormField>
          <FormField label="Impact Level">
            <select style={inputStyle} value={form.impact_level || 'High'} onChange={e => set('impact_level', e.target.value)}>
              {['Critical', 'High', 'Medium', 'Low'].map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Rationale / Why">
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            value={form.rationale || ''} onChange={e => set('rationale', e.target.value)}
            placeholder="Why was this decision made?" />
        </FormField>
      </form>
    </PhoenixModal>
  );
}

function AssumptionFormModal({ assumption, onClose, onSave }) {
  const [form, setForm] = useState(assumption ? { ...assumption } : {
    assumption_text: '', made_by: '', source_document: '', risk_if_wrong: '', review_date: '', impact: 'High', status: 'Active',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <PhoenixModal
      open
      onClose={onClose}
      title={assumption ? 'Edit Assumption' : 'Log Assumption'}
      maxWidth={580}
      footer={<>
        <button type="button" style={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" style={btnPrimary} onClick={() => onSave(form)}>
          {assumption ? 'Save' : 'Log Assumption'}
        </button>
      </>}
    >
      <form onSubmit={e => { e.preventDefault(); onSave(form); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Assumption *">
          <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={form.assumption_text || ''} onChange={e => set('assumption_text', e.target.value)}
            required placeholder="What are we assuming to be true?" />
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormField label="Made By">
            <input style={inputStyle} value={form.made_by || ''} onChange={e => set('made_by', e.target.value)} placeholder="Name or role" />
          </FormField>
          <FormField label="Source Document">
            <input style={inputStyle} value={form.source_document || ''} onChange={e => set('source_document', e.target.value)} placeholder="RFI #, Drawing, Email..." />
          </FormField>
          <FormField label="Impact if Wrong">
            <select style={inputStyle} value={form.impact || 'High'} onChange={e => set('impact', e.target.value)}>
              {['Critical', 'High', 'Medium', 'Low'].map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </FormField>
          <FormField label="Review Trigger Date">
            <input type="date" style={inputStyle} value={form.review_date || ''} onChange={e => set('review_date', e.target.value)} />
          </FormField>
        </div>
        <FormField label="Risk if Wrong">
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            value={form.risk_if_wrong || ''} onChange={e => set('risk_if_wrong', e.target.value)}
            placeholder="What happens if this assumption is incorrect?" />
        </FormField>
        {assumption && (
          <FormField label="Status">
            <select style={inputStyle} value={form.status || 'Active'} onChange={e => set('status', e.target.value)}>
              {['Active', 'Verified', 'Invalidated', 'Closed'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </FormField>
        )}
      </form>
    </PhoenixModal>
  );
}