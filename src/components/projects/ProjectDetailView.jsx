import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { differenceInDays } from 'date-fns';
import { formatDate, formatDateShort, parseUTCDate } from '@/components/shared/formatters';
import { X, BarChart2, CheckSquare, Calendar, FileText, AlertTriangle, Package, DollarSign, ClipboardCheck } from 'lucide-react';
import { formatCurrency } from '@/components/shared/formatters';
import ProjectHandoffChecklist from '@/components/projects/ProjectHandoffChecklist';

const mono = { fontFamily: 'JetBrains Mono, monospace' };

const TABS = [
  { id: 'overview',   label: 'Overview',    icon: BarChart2 },
  { id: 'handoff',    label: 'Handoff',     icon: ClipboardCheck },
  { id: 'workpkgs',   label: 'Work Pkgs',   icon: CheckSquare },
  { id: 'schedule',   label: 'Schedule',    icon: Calendar },
  { id: 'drawings',   label: 'Drawings',    icon: FileText },
  { id: 'rfis',       label: 'RFIs',        icon: AlertTriangle },
  { id: 'deliveries', label: 'Deliveries',  icon: Package },
  { id: 'commercial', label: 'Commercial',  icon: DollarSign },
];

const PHASE_CONFIG = {
  Detailing:   { color: '#8B5CF6' },
  Fabrication: { color: 'var(--accent)' },
  Delivery:    { color: '#06B6D4' },
  Erection:    { color: '#22C55E' },
  Closeout:    { color: '#9CA3AF' },
};

const HEALTH_CONFIG = {
  'On Track': { color: 'var(--status-success)', dot: '#22C55E' },
  'Watch':    { color: 'var(--status-warning)', dot: '#F59E0B' },
  'At Risk':  { color: 'var(--status-error)',   dot: '#EF4444' },
};

function KpiStrip({ items }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      gap: 1,
      background: 'var(--divider)',
      border: '1px solid var(--border-default)',
      borderRadius: 2,
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      {items.map((k, i) => (
        <div key={i} style={{ padding: '12px 16px', background: 'var(--bg-surface)' }}>
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 5 }}>{k.label}</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: k.color || 'var(--text-primary)', lineHeight: 1 }}>{k.value}</div>
          {k.sub && <div style={{ ...mono, fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 2, overflow: 'hidden', marginBottom: 14 }}>
      {title && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--divider)', background: 'var(--bg-sidebar)' }}>
          <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyState({ label }) {
  return (
    <div style={{ padding: 32, textAlign: 'center', ...mono, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
      {label}
    </div>
  );
}

function fmtDate(d) { return formatDate(d); }

// ── OVERVIEW TAB ──
function OverviewTab({ project, workPackages, rfis, changeOrders, deliveries }) {
  const phase  = PHASE_CONFIG[project.phase] || PHASE_CONFIG.Detailing;
  const health = HEALTH_CONFIG[project.health_status] || HEALTH_CONFIG['On Track'];

  const completeWPs = workPackages.filter(w => w.status === 'Complete').length;
  const wpPct = workPackages.length > 0 ? Math.round((completeWPs / workPackages.length) * 100) : 0;
  const openRFIs = rfis.filter(r => ['Open','Under Review'].includes(r.status)).length;
  const overdueRFIs = rfis.filter(r => r.due_date && parseUTCDate(r.due_date) < new Date() && !['Answered','Closed'].includes(r.status)).length;
  const pendingCOs = changeOrders.filter(c => ['Submitted','Under Review'].includes(c.status)).length;
  const approvedCOVal = changeOrders.filter(c => c.status === 'Approved').reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const pendingDeliveries = deliveries.filter(d => !['Delivered','Cancelled','Rejected'].includes(d.status)).length;

  const target = project.target_completion_date ? parseUTCDate(project.target_completion_date) : null;
  const daysLeft = target ? differenceInDays(target, new Date()) : null;

  return (
    <div>
      <KpiStrip items={[
        { label: 'Work Packages', value: `${completeWPs}/${workPackages.length}`, color: phase.color, sub: `${wpPct}% complete` },
        { label: 'Open RFIs', value: openRFIs, color: overdueRFIs > 0 ? 'var(--status-error)' : openRFIs > 0 ? 'var(--status-warning)' : 'var(--text-muted)', sub: overdueRFIs > 0 ? `${overdueRFIs} overdue` : 'up to date' },
        { label: 'Pending COs', value: pendingCOs, color: pendingCOs > 0 ? 'var(--status-warning)' : 'var(--text-muted)' },
        { label: 'CO Value', value: formatCurrency(approvedCOVal), color: approvedCOVal >= 0 ? 'var(--status-success)' : 'var(--status-error)' },
        { label: 'Deliveries', value: pendingDeliveries, color: pendingDeliveries > 0 ? 'var(--accent)' : 'var(--text-muted)', sub: 'in transit / scheduled' },
      ]} />

      {/* Progress */}
      <SectionCard title="Overall Progress">
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ ...mono, fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>Work Package Completion</span>
            <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: phase.color }}>{wpPct}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${wpPct}%`, background: phase.color, borderRadius: 2, transition: 'width 0.5s' }} />
          </div>
          {daysLeft !== null && (
            <div style={{ ...mono, fontSize: 9, marginTop: 6, fontWeight: 700, color: daysLeft < 0 ? 'var(--status-error)' : daysLeft < 30 ? 'var(--status-warning)' : 'var(--text-muted)' }}>
              {daysLeft < 0 ? `${Math.abs(daysLeft)} DAYS OVERDUE` : `${daysLeft} DAYS REMAINING`}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Project Info */}
      <SectionCard title="Project Info">
        {[
          ['Project #', project.project_number],
          ['Client', project.client],
          ['General Contractor', project.general_contractor],
          ['Engineer of Record', project.engineer_of_record],
          ['Project Manager', project.project_manager],
          ['Superintendent', project.superintendent],
          ['Phase', project.phase],
          ['Health', project.health_status],
          ['Contract Type', project.contract_type],
          ['Contract Value', formatCurrency(Number(project.original_contract_value) || 0)],
          ['Retainage %', project.retainage_percent ? `${project.retainage_percent}%` : '—'],
          ['Start Date', fmtDate(project.start_date)],
          ['Target Completion', fmtDate(project.target_completion_date)],
          ['Forecast Completion', fmtDate(project.forecast_completion_date)],
          ['Address', project.address],
        ].filter(([, v]) => v && v !== '—').map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 16, padding: '8px 16px', borderBottom: '1px solid var(--divider)', alignItems: 'flex-start' }}>
            <span style={{ ...mono, fontSize: 9, color: 'var(--text-muted)', minWidth: 160, flexShrink: 0, paddingTop: 1 }}>{label}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{value}</span>
          </div>
        ))}
        {project.notes && (
          <div style={{ padding: '10px 16px' }}>
            <div style={{ ...mono, fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{project.notes}</div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── WORK PACKAGES TAB ──
function WorkPackagesTab({ workPackages }) {
  const STATUS_COLOR = {
    'Not Started': 'var(--text-muted)',
    'In Progress': 'var(--accent)',
    'Complete':    'var(--status-success)',
    'On Hold':     'var(--status-warning)',
  };
  const PHASE_COLORS = {
    Detailing:   '#8B5CF6',
    Fabrication: 'var(--accent)',
    Delivery:    '#06B6D4',
    Erection:    '#22C55E',
  };

  if (!workPackages.length) return <EmptyState label="No Work Packages" />;

  const done = workPackages.filter(w => w.status === 'Complete').length;
  const inProg = workPackages.filter(w => w.status === 'In Progress').length;

  return (
    <div>
      <KpiStrip items={[
        { label: 'Total', value: workPackages.length },
        { label: 'Complete', value: done, color: 'var(--status-success)' },
        { label: 'In Progress', value: inProg, color: 'var(--accent)' },
        { label: 'Total Tonnage', value: `${workPackages.reduce((s,w) => s+(Number(w.tonnage)||0),0).toFixed(1)}T` },
      ]} />
      <SectionCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 70px 90px', gap: 12, padding: '8px 16px', background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--divider)' }}>
          {['Work Package','Phase','Status','% Done','Tons','Shop Hrs'].map(c => (
            <div key={c} style={{ ...mono, fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{c}</div>
          ))}
        </div>
        {workPackages.map(w => {
          const pct = Number(w.percent_complete) || 0;
          return (
            <div key={w.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 70px 90px', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--divider)', alignItems: 'center', borderLeft: `3px solid ${PHASE_COLORS[w.phase] || 'var(--accent)'}` }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{w.name}</div>
                {w.wp_number && <div style={{ ...mono, fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>{w.wp_number}</div>}
              </div>
              <div style={{ ...mono, fontSize: 9, color: PHASE_COLORS[w.phase] || 'var(--text-muted)', textTransform: 'uppercase' }}>{w.phase || '—'}</div>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: STATUS_COLOR[w.status] || 'var(--text-muted)', textTransform: 'uppercase' }}>{w.status}</div>
              <div>
                <div style={{ height: 4, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: PHASE_COLORS[w.phase] || 'var(--accent)', borderRadius: 2 }} />
                </div>
                <span style={{ ...mono, fontSize: 8, color: 'var(--text-muted)' }}>{pct}%</span>
              </div>
              <div style={{ ...mono, fontSize: 10, color: 'var(--text-secondary)' }}>{w.tonnage ? `${w.tonnage}T` : '—'}</div>
              <div style={{ ...mono, fontSize: 10, color: 'var(--text-secondary)' }}>
                {w.shop_hours_actual || 0} / {w.shop_hours_budget || 0}
              </div>
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
}

// ── SCHEDULE TAB ──
function ScheduleTab({ scheduleTasks }) {
  const STATUS_COLOR = {
    'Not Started': 'var(--text-muted)',
    'In Progress': 'var(--accent)',
    'Complete':    'var(--status-success)',
    'Delayed':     'var(--status-error)',
    'On Hold':     'var(--status-warning)',
  };

  if (!scheduleTasks.length) return <EmptyState label="No Schedule Tasks" />;

  const byPhase = scheduleTasks.reduce((acc, t) => {
    const p = t.phase || 'General';
    if (!acc[p]) acc[p] = [];
    acc[p].push(t);
    return acc;
  }, {});

  return (
    <div>
      {Object.entries(byPhase).map(([phase, tasks]) => (
        <SectionCard key={phase} title={`${phase} — ${tasks.filter(t=>t.status==='Complete').length}/${tasks.length} done`}>
          {tasks.map(t => {
            const isDelayed = t.status === 'Delayed';
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: '1px solid var(--divider)', borderLeft: `3px solid ${STATUS_COLOR[t.status] || 'transparent'}` }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: STATUS_COLOR[t.status] || 'var(--text-muted)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: t.status === 'Complete' ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: t.status === 'Complete' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task_name}</div>
                  {t.task_number && <div style={{ ...mono, fontSize: 8, color: 'var(--accent)', marginTop: 1 }}>{t.task_number}</div>}
                </div>
                {t.start_date && <span style={{ ...mono, fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>{formatDateShort(t.start_date)}</span>}
                {t.end_date && <span style={{ ...mono, fontSize: 9, color: isDelayed ? 'var(--status-error)' : 'var(--text-muted)', flexShrink: 0 }}>→ {formatDateShort(t.end_date)}</span>}
                <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: STATUS_COLOR[t.status] || 'var(--text-muted)', textTransform: 'uppercase', padding: '2px 6px', background: (STATUS_COLOR[t.status] || 'var(--text-muted)') + '18', borderRadius: 2, flexShrink: 0 }}>{t.status}</span>
              </div>
            );
          })}
        </SectionCard>
      ))}
    </div>
  );
}

// ── DRAWINGS TAB ──
function DrawingsTab({ drawings }) {
  const STAGE_COLOR = {
    'Released':     'var(--status-success)',
    'BFS':          'var(--status-success)',
    'OFS':          'var(--accent)',
    'BFA':          'var(--accent)',
    'OFA':          'var(--status-warning)',
    'Not Started':  'var(--text-muted)',
    'FFF':          'var(--status-info)',
  };

  if (!drawings.length) return <EmptyState label="No Drawings" />;

  const overdue = drawings.filter(d => d.due_date && parseUTCDate(d.due_date) < new Date() && !['Released','BFS'].includes(d.stage)).length;

  return (
    <div>
      <KpiStrip items={[
        { label: 'Total', value: drawings.length },
        { label: 'Released', value: drawings.filter(d => ['Released','BFS'].includes(d.stage)).length, color: 'var(--status-success)' },
        { label: 'In Review', value: drawings.filter(d => ['OFA','BFA','OFS'].includes(d.stage)).length, color: 'var(--accent)' },
        { label: 'Overdue', value: overdue, color: overdue > 0 ? 'var(--status-error)' : 'var(--text-muted)' },
      ]} />
      <SectionCard>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 80px 80px 80px', gap: 12, padding: '8px 16px', background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--divider)' }}>
          {['Sheet #', 'Title', 'Discipline', 'Stage', 'Due'].map(c => (
            <div key={c} style={{ ...mono, fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{c}</div>
          ))}
        </div>
        {drawings.map(d => {
          const od = d.due_date && parseUTCDate(d.due_date) < new Date() && !['Released','BFS'].includes(d.stage);
          return (
            <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 80px 80px 80px', gap: 12, padding: '9px 16px', borderBottom: '1px solid var(--divider)', alignItems: 'center', borderLeft: od ? '3px solid var(--status-error)' : '3px solid transparent' }}>
              <div style={{ ...mono, fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>{d.sheet_number || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
              <div style={{ ...mono, fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{d.discipline?.slice(0,8) || '—'}</div>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: STAGE_COLOR[d.stage] || 'var(--text-muted)', textTransform: 'uppercase' }}>{d.stage || '—'}</div>
              <div style={{ ...mono, fontSize: 9, color: od ? 'var(--status-error)' : 'var(--text-muted)', fontWeight: od ? 700 : 400 }}>{formatDateShort(d.due_date)}</div>
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
}

// ── RFIs TAB ──
function RFIsTab({ rfis }) {
  const STATUS_COLOR = {
    'Open':         'var(--status-warning)',
    'Under Review': 'var(--accent)',
    'Answered':     'var(--status-success)',
    'Closed':       'var(--text-muted)',
  };
  const PRIO_COLOR = {
    Critical: 'var(--status-error)',
    High:     'var(--status-warning)',
    Medium:   'var(--accent)',
    Low:      'var(--text-muted)',
  };

  if (!rfis.length) return <EmptyState label="No RFIs" />;

  const open = rfis.filter(r => ['Open','Under Review'].includes(r.status)).length;
  const overdue = rfis.filter(r => r.due_date && parseUTCDate(r.due_date) < new Date() && !['Answered','Closed'].includes(r.status)).length;

  return (
    <div>
      <KpiStrip items={[
        { label: 'Total', value: rfis.length },
        { label: 'Open', value: open, color: 'var(--status-warning)' },
        { label: 'Overdue', value: overdue, color: overdue > 0 ? 'var(--status-error)' : 'var(--text-muted)' },
        { label: 'Answered', value: rfis.filter(r => r.status === 'Answered').length, color: 'var(--status-success)' },
      ]} />
      <SectionCard>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px 80px 80px', gap: 12, padding: '8px 16px', background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--divider)' }}>
          {['RFI #', 'Title', 'Priority', 'Status', 'Due'].map(c => (
            <div key={c} style={{ ...mono, fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{c}</div>
          ))}
        </div>
        {rfis.map(r => {
          const od = r.due_date && parseUTCDate(r.due_date) < new Date() && !['Answered','Closed'].includes(r.status);
          return (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px 80px 80px', gap: 12, padding: '9px 16px', borderBottom: '1px solid var(--divider)', alignItems: 'center', borderLeft: od ? '3px solid var(--status-error)' : `3px solid ${PRIO_COLOR[r.priority] || 'transparent'}` }}>
              <div style={{ ...mono, fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>{r.rfi_number || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: PRIO_COLOR[r.priority] || 'var(--text-muted)', textTransform: 'uppercase' }}>{r.priority || '—'}</div>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: STATUS_COLOR[r.status] || 'var(--text-muted)', textTransform: 'uppercase' }}>{r.status}</div>
              <div style={{ ...mono, fontSize: 9, color: od ? 'var(--status-error)' : 'var(--text-muted)', fontWeight: od ? 700 : 400 }}>{formatDateShort(r.due_date)}</div>
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
}

// ── DELIVERIES TAB ──
function DeliveriesTab({ deliveries }) {
  const STATUS_COLOR = {
    Scheduled:   'var(--accent)',
    'In Transit':'var(--status-warning)',
    Delivered:   'var(--status-success)',
    Partial:     'var(--status-warning)',
    Rejected:    'var(--status-error)',
  };

  if (!deliveries.length) return <EmptyState label="No Deliveries" />;

  const open = deliveries.filter(d => !['Delivered','Rejected'].includes(d.status)).length;
  const delivered = deliveries.filter(d => d.status === 'Delivered').length;

  return (
    <div>
      <KpiStrip items={[
        { label: 'Total', value: deliveries.length },
        { label: 'Open', value: open, color: 'var(--accent)' },
        { label: 'Delivered', value: delivered, color: 'var(--status-success)' },
        { label: 'Total Weight', value: `${deliveries.reduce((s,d)=>s+(Number(d.weight_tons)||0),0).toFixed(1)}T` },
      ]} />
      <SectionCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 90px 90px', gap: 12, padding: '8px 16px', background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--divider)' }}>
          {['Delivery Title', 'Vendor', 'Status', 'Scheduled', 'Weight'].map(c => (
            <div key={c} style={{ ...mono, fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{c}</div>
          ))}
        </div>
        {deliveries.map(d => (
          <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 90px 90px', gap: 12, padding: '9px 16px', borderBottom: '1px solid var(--divider)', alignItems: 'center', borderLeft: `3px solid ${STATUS_COLOR[d.status] || 'var(--text-muted)'}` }}>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description || '—'}</div>
            <div style={{ ...mono, fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.vendor || '—'}</div>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: STATUS_COLOR[d.status] || 'var(--text-muted)', textTransform: 'uppercase' }}>{d.status}</div>
            <div style={{ ...mono, fontSize: 9, color: 'var(--text-muted)' }}>{formatDateShort(d.scheduled_date)}</div>
            <div style={{ ...mono, fontSize: 9, color: 'var(--text-secondary)' }}>{d.weight_tons ? `${d.weight_tons}T` : '—'}</div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ── COMMERCIAL TAB ──
function CommercialTab({ project, changeOrders, costCodes }) {
  const CO_STATUS_COLOR = {
    Approved:      'var(--status-success)',
    Rejected:      'var(--status-error)',
    'Under Review':'var(--accent)',
    Submitted:     'var(--status-warning)',
    Draft:         'var(--text-muted)',
    Void:          'var(--text-muted)',
  };

  const totalBudget  = costCodes.reduce((s,c) => s+(Number(c.budget_amount)||0), 0);
  const totalActual  = costCodes.reduce((s,c) => s+(Number(c.actual_cost)||0), 0);
  const totalCommit  = costCodes.reduce((s,c) => s+(Number(c.committed_cost)||0), 0);
  const approvedCOVal = changeOrders.filter(c=>c.status==='Approved').reduce((s,c)=>s+(Number(c.co_amount)||0),0);
  const pendingCOVal  = changeOrders.filter(c=>['Submitted','Under Review'].includes(c.status)).reduce((s,c)=>s+(Number(c.co_amount)||0),0);

  return (
    <div>
      <KpiStrip items={[
        { label: 'Original Contract', value: formatCurrency(Number(project.original_contract_value)||0) },
        { label: 'Approved COs', value: formatCurrency(approvedCOVal), color: approvedCOVal >= 0 ? 'var(--status-success)' : 'var(--status-error)' },
        { label: 'Pending COs', value: formatCurrency(pendingCOVal), color: pendingCOVal > 0 ? 'var(--status-warning)' : 'var(--text-muted)' },
        { label: 'Revised Contract', value: formatCurrency((Number(project.original_contract_value)||0) + approvedCOVal) },
      ]} />

      {costCodes.length > 0 && (
        <>
          <KpiStrip items={[
            { label: 'Budget', value: formatCurrency(totalBudget) },
            { label: 'Actual', value: formatCurrency(totalActual), color: totalActual > totalBudget ? 'var(--status-error)' : 'var(--status-success)' },
            { label: 'Committed', value: formatCurrency(totalCommit), color: 'var(--status-warning)' },
          ]} />
          <SectionCard title="Cost Codes">
            {costCodes.map(c => {
              const budget = Number(c.budget_amount) || 0;
              const actual = Number(c.actual_cost) || 0;
              const pct = budget > 0 ? Math.min(100, (actual / budget) * 100) : 0;
              const over = actual > budget;
              return (
                <div key={c.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--divider)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{c.cost_code_number} — {c.description}</span>
                    <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: over ? 'var(--status-error)' : 'var(--text-secondary)' }}>{formatCurrency(actual)} / {formatCurrency(budget)}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--status-error)' : pct > 80 ? 'var(--status-warning)' : 'var(--status-success)', borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </SectionCard>
        </>
      )}

      {changeOrders.length > 0 && (
        <SectionCard title="Change Orders">
          {changeOrders.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: '1px solid var(--divider)', borderLeft: `3px solid ${CO_STATUS_COLOR[c.status] || 'var(--text-muted)'}` }}>
              <div style={{ ...mono, fontSize: 10, color: 'var(--accent)', fontWeight: 700, minWidth: 60 }}>{c.co_number || '—'}</div>
              <div style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
              <div style={{ ...mono, fontSize: 11, fontWeight: 700, flexShrink: 0, color: (Number(c.co_amount)||0) >= 0 ? 'var(--status-success)' : 'var(--status-error)' }}>
                {(Number(c.co_amount)||0) >= 0 ? '+' : ''}{formatCurrency(c.co_amount)}
              </div>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: CO_STATUS_COLOR[c.status] || 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0 }}>{c.status}</div>
            </div>
          ))}
        </SectionCard>
      )}

      {changeOrders.length === 0 && costCodes.length === 0 && <EmptyState label="No Commercial Data" />}
    </div>
  );
}

// ── MAIN ──
export default function ProjectDetailView({ project, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const phase = PHASE_CONFIG[project.phase] || PHASE_CONFIG.Detailing;

  const { data: workPackages = [] } = useQuery({
    queryKey: ['wp-detail', project.id],
    queryFn: () => base44.entities.WorkPackage.filter({ project_id: project.id }),
    initialData: [],
  });
  const { data: rfis = [] } = useQuery({
    queryKey: ['rfi-detail', project.id],
    queryFn: () => base44.entities.RFI.filter({ project_id: project.id }),
    initialData: [],
  });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ['co-detail', project.id],
    queryFn: () => base44.entities.ChangeOrder.filter({ project_id: project.id }),
    initialData: [],
  });
  const { data: deliveries = [] } = useQuery({
    queryKey: ['del-detail', project.id],
    queryFn: () => base44.entities.Delivery.filter({ project_id: project.id }),
    initialData: [],
  });
  const { data: drawings = [] } = useQuery({
    queryKey: ['draw-detail', project.id],
    queryFn: () => base44.entities.Drawing.filter({ project_id: project.id }),
    initialData: [],
  });
  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ['sched-detail', project.id],
    queryFn: () => base44.entities.ScheduleTask.filter({ project_id: project.id }),
    initialData: [],
  });
  const { data: costCodes = [] } = useQuery({
    queryKey: ['cc-detail', project.id],
    queryFn: () => base44.entities.CostCode.filter({ project_id: project.id }),
    initialData: [],
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end', zIndex: 500 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '78vw', maxWidth: 1080, background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 24px', background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 2, background: phase.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: phase.color, fontFamily: 'Space Grotesk, sans-serif' }}>
              {project.name?.charAt(0)?.toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
              {project.project_number && (
                <span style={{ ...mono, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{project.project_number}</span>
              )}
              {project.phase && (
                <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: phase.color, background: phase.color + '20', padding: '2px 7px', borderRadius: 2, textTransform: 'uppercase' }}>{project.phase}</span>
              )}
              {project.health_status && (() => {
                const h = HEALTH_CONFIG[project.health_status] || HEALTH_CONFIG['On Track'];
                return (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, ...mono, fontSize: 8, fontWeight: 700, color: h.color }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: h.dot, display: 'inline-block' }} />
                    {project.health_status}
                  </span>
                );
              })()}
              {project.target_completion_date && (
                <span style={{ ...mono, fontSize: 8, color: 'var(--text-muted)' }}>
                  Due {formatDate(project.target_completion_date)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', borderRadius: 4, flexShrink: 0, transition: 'all 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--divider)', background: 'var(--bg-surface)', overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none' }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 18px', background: 'none', border: 'none', borderBottom: isActive ? `2px solid ${phase.color}` : '2px solid transparent', color: isActive ? phase.color : 'var(--text-muted)', cursor: 'pointer', ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', whiteSpace: 'nowrap', marginBottom: -1, transition: 'color 0.1s' }}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {activeTab === 'overview'   && <OverviewTab    project={project} workPackages={workPackages} rfis={rfis} changeOrders={changeOrders} deliveries={deliveries} />}
          {activeTab === 'handoff'    && <ProjectHandoffChecklist projectId={project.id} />}
          {activeTab === 'workpkgs'   && <WorkPackagesTab workPackages={workPackages} />}
          {activeTab === 'schedule'   && <ScheduleTab    scheduleTasks={scheduleTasks} />}
          {activeTab === 'drawings'   && <DrawingsTab    drawings={drawings} />}
          {activeTab === 'rfis'       && <RFIsTab        rfis={rfis} />}
          {activeTab === 'deliveries' && <DeliveriesTab  deliveries={deliveries} />}
          {activeTab === 'commercial' && <CommercialTab  project={project} changeOrders={changeOrders} costCodes={costCodes} />}
        </div>
      </div>
    </div>
  );
}