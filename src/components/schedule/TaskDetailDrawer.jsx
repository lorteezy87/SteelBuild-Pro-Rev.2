import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { calculateTaskDuration, computeAutoScheduledDates } from './scheduleUtils';
import { PHASES } from '../../utils/phases';
import {
  DETAILING_STAGE_GATES,
  DETAILING_STAGE_META,
  getStageDates,
  applyStageDatesToTask,
  usesStageDates,
  getActiveStage,
  getEffectiveDueDate,
} from '../../lib/stageDates';
import {
  parseDependencies,
  serializeDependencies,
  LINK_TYPES,
} from '../../services/scheduleCascade';
import MultiSelectChips from '@/components/shared/MultiSelectChips';
import { logActivity } from '@/services/auditLogger';

// Coerce JSONB values that may come back from Postgres as strings or null.
// Mirrors the helper in DailyLogForm — the entity wrapper also normalises,
// but defending in the editor lets us tolerate stale cached rows that were
// fetched before the wrapper coercion landed.
function asIdArray(v) {
  if (Array.isArray(v)) return v.filter((id) => typeof id === 'string' && id.length > 0);
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id.length > 0) : [];
    } catch { return []; }
  }
  return [];
}

// Compare two id-arrays for equality (order-insensitive). Used to detect
// whether the related-* fields actually changed on save so we only emit a
// single audit-log entry when something is different.
function sameIdSet(a, b) {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (aa.length !== bb.length) return false;
  const sa = new Set(aa);
  for (const id of bb) if (!sa.has(id)) return false;
  return true;
}

/**
 * Parse the upgraded `dependencies` TEXT column. Each element is now a
 * link object — `{ id, type: 'FS'|'SS'|'FF'|'SF', lag_days: int }`. The
 * shared parseDependencies utility also handles the legacy id-string
 * shape so a row that hasn't been migrated yet still loads cleanly,
 * defaulting to FS + 1 day.
 */
function parseDeps(raw) {
  return parseDependencies(raw);
}

export default function TaskDetailDrawer({ task, open, onClose, onUpdate, allTasks = [], onDelete }) {
  const [formData, setFormData] = useState(task || {});
  const [activeTab, setActiveTab] = useState('details');
  // Local editable copy of the detailing stage-gate dates. Mirrors
  // formData.metadata.stage_dates but lives in its own state so the
  // 4-field panel can update one gate at a time without round-tripping
  // through the whole metadata object on every keystroke.
  const [stageDates, setStageDates] = useState(() => getStageDates(task));

  useEffect(() => {
    setFormData(task || {});
    setStageDates(getStageDates(task));
  }, [task]);

  // ── Project-scoped option lists for the LINKS tab. Cache for a minute
  //    so toggling tabs doesn't refetch. Same idiom as DailyLogForm. ─────
  const linkProjectId = task?.project_id;
  const { data: rfis = [] } = useQuery({
    queryKey: ['rfis-for-task-link', linkProjectId],
    queryFn: () =>
      linkProjectId
        ? base44.entities.RFI.filter({ project_id: linkProjectId })
        : Promise.resolve([]),
    enabled: !!linkProjectId && !!open,
    staleTime: 60 * 1000,
  });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ['change-orders-for-task-link', linkProjectId],
    queryFn: () =>
      linkProjectId
        ? base44.entities.ChangeOrder.filter({ project_id: linkProjectId })
        : Promise.resolve([]),
    enabled: !!linkProjectId && !!open,
    staleTime: 60 * 1000,
  });
  const { data: actionItems = [] } = useQuery({
    queryKey: ['action-items-for-task-link', linkProjectId],
    queryFn: () =>
      linkProjectId
        ? base44.entities.ActionItem.filter({ project_id: linkProjectId })
        : Promise.resolve([]),
    enabled: !!linkProjectId && !!open,
    staleTime: 60 * 1000,
  });

  const rfiOptions = useMemo(
    () => rfis.map((r) => ({
      id: r.id,
      label: r.rfi_number || r.title || `RFI ${r.id?.slice(0, 6)}`,
      sublabel: r.title && r.rfi_number ? r.title : (r.status || ''),
    })),
    [rfis]
  );
  const changeOrderOptions = useMemo(
    () => changeOrders.map((c) => ({
      id: c.id,
      label: c.co_number || c.title || `CO ${c.id?.slice(0, 6)}`,
      sublabel: c.title && c.co_number ? c.title : (c.status || ''),
    })),
    [changeOrders]
  );
  const actionItemOptions = useMemo(
    () => actionItems.map((a) => ({
      id: a.id,
      label: a.title || a.description?.slice(0, 40) || `Item ${a.id?.slice(0, 6)}`,
      sublabel: a.status || '',
    })),
    [actionItems]
  );

  if (!open || !task) return null;

  const isDetailing = usesStageDates(formData);

  const handleSave = () => {
    if (!onUpdate) return;
    // For Detailing tasks we derive start_date, end_date, and
    // metadata.detailing_stage from the stage-gate dates so the
    // rest of the Gantt (overdue logic, bar placement, stage chip)
    // keeps working without per-phase branches downstream.
    const patch = isDetailing ? applyStageDatesToTask(formData, stageDates) : {};
    // Build clean payload with only DB-valid fields
    const { id, created_at, updated_at, created_date, updated_date, ...rest } = formData;

    // One audit-log entry per save when any of the cross-link arrays
    // changed — matches DailyLogs / Punchlist (one entry per save, not
    // one per chip add/remove). Fire-and-forget; never blocks the save.
    const linkFieldsChanged =
      !sameIdSet(asIdArray(task.related_rfi_ids),          asIdArray(rest.related_rfi_ids)) ||
      !sameIdSet(asIdArray(task.related_change_order_ids), asIdArray(rest.related_change_order_ids)) ||
      !sameIdSet(asIdArray(task.related_action_item_ids),  asIdArray(rest.related_action_item_ids));
    if (linkFieldsChanged) {
      const counts = [
        `${asIdArray(rest.related_rfi_ids).length} RFI`,
        `${asIdArray(rest.related_change_order_ids).length} CO`,
        `${asIdArray(rest.related_action_item_ids).length} AI`,
      ].join(' / ');
      logActivity('schedule_task', 'updated', { ...rest, id: task.id }, {
        projectId: task.project_id,
        description: `Cross-links updated (${counts})`,
      });
    }

    onUpdate({ ...rest, ...patch, id: task.id });
  };

  const duration = calculateTaskDuration(formData.start_date, formData.end_date);
  // Predecessor links are now link objects: { id, type, lag_days }. The
  // legacy id-string shape is silently upgraded to FS+1 by parseDeps so
  // the editor can mix-and-match while a partial migration is in flight.
  const predecessorLinks = parseDeps(formData.dependencies);
  const predecessorIds = predecessorLinks.map((l) => l.id);
  const predecessorTasks = allTasks.filter(t => predecessorIds.includes(t.id));
  const successorTasks = allTasks.filter(t => {
    const links = parseDeps(t.dependencies);
    return links.some((l) => l.id === task.id);
  });

  // Dependency management
  //
  // Adding a predecessor defaults to FS + 1 day, which mirrors the
  // hardcoded behaviour the cascade applied before SS/FF/SF support
  // existed. The user can change link type and lag inline once the
  // predecessor is added (see the type select + lag input on each row).
  // Auto-shift only fires for the FS default — non-FS links require
  // smarter date math we don't replicate here, since the cascade
  // recomputes effective dates on every render anyway.
  const addPredecessor = (predId) => {
    const current = parseDeps(formData.dependencies);
    if (current.some((l) => l.id === predId)) return;
    const newLink = { id: predId, type: 'FS', lag_days: 1 };
    const updated = [...current, newLink];

    // Compute auto-shift using every FS predecessor (existing + the new one)
    // — the shift hint only handles FS semantics, so we filter to those.
    const fsIds = updated.filter((l) => l.type === 'FS').map((l) => l.id);
    const fsPredTasks = allTasks.filter((t) => fsIds.includes(t.id));
    const shift = newLink.type === 'FS' ? computeAutoScheduledDates(formData, fsPredTasks) : null;

    const serialized = serializeDependencies(updated);
    if (shift) {
      setFormData({
        ...formData,
        dependencies: serialized,
        start_date: shift.start_date,
        end_date: shift.end_date,
      });
      const fmt = (iso) => {
        try { return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
        catch { return iso; }
      };
      toast.info(
        `Dates shifted to ${fmt(shift.start_date)} – ${fmt(shift.end_date)} based on dependency`,
        { description: 'Guideline only — edit dates in the Details tab if needed.' }
      );
    } else {
      setFormData({ ...formData, dependencies: serialized });
    }
  };

  const removePredecessor = (predId) => {
    const current = parseDeps(formData.dependencies);
    const updated = current.filter((l) => l.id !== predId);
    setFormData({
      ...formData,
      dependencies: updated.length > 0 ? serializeDependencies(updated) : null,
    });
  };

  // Update a single predecessor link's type or lag in place.
  const updatePredecessor = (predId, patchObj) => {
    const current = parseDeps(formData.dependencies);
    const updated = current.map((l) =>
      l.id === predId ? { ...l, ...patchObj } : l
    );
    setFormData({ ...formData, dependencies: serializeDependencies(updated) });
  };

  // Available tasks to add as predecessors (not self, not already a predecessor)
  const availablePreds = allTasks.filter(t =>
    t.id !== task.id && !predecessorIds.includes(t.id)
  );

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 998,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: 480,
          background: 'var(--bg-surface-low)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--divider)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 4 }}>
              {formData.task_type}{formData.wbs_code ? ` · ${formData.wbs_code}` : ''}
            </div>
            <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {formData.task_name}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {onDelete && (
              <button
                onClick={() => {
                  if (window.confirm('Delete this task?')) {
                    onDelete(task.id);
                  }
                }}
                style={{
                  background: 'var(--danger-muted)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 6,
                  padding: '5px 10px',
                  color: 'var(--status-error)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                DELETE
              </button>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--divider)', background: 'var(--bg-surface-low)' }}>
          {['DETAILS', 'DEPENDENCIES', 'LINKS', 'NOTES', 'HISTORY'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab.toLowerCase())}
              style={{
                flex: 1,
                padding: '12px 0',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: '0.10em',
                color: activeTab === tab.toLowerCase() ? 'var(--accent)' : 'var(--text-muted)',
                background: activeTab === tab.toLowerCase() ? 'var(--accent-muted)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.toLowerCase() ? '2px solid var(--accent)' : '1px solid transparent',
                cursor: 'pointer',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {activeTab === 'details' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Left column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <FormField label="Task Name" value={formData.task_name} onChange={(v) => setFormData({ ...formData, task_name: v })} />
                <FormField label="Task Type" type="select" value={formData.task_type} onChange={(v) => setFormData({ ...formData, task_type: v })} options={['Fabrication', 'Delivery', 'Install', 'Submittal', 'RFI', 'Milestone', 'Task']} />
                <FormField label="Phase" type="select" value={formData.phase} onChange={(v) => setFormData({ ...formData, phase: v })} options={PHASES} />
                <FormField label="Status" type="select" value={formData.status} onChange={(v) => setFormData({ ...formData, status: v })} options={['Not Started', 'In Progress', 'Complete', 'Delayed', 'On Hold']} />
                <FormField label="Priority" type="select" value={formData.priority} onChange={(v) => setFormData({ ...formData, priority: v })} options={['Critical', 'High', 'Normal', 'Low']} />
                <FormField label="Assigned To / Resources" value={formData.resource_names || formData.assigned_to || ''} onChange={(v) => setFormData({ ...formData, resource_names: v, assigned_to: v })} />
              </div>

              {/* Right column — Detailing tasks swap the single
                  start/end date pair for four stage-gate dates
                  (OFA / BFA / FFF / Released). The Gantt bar still
                  renders from start_date/end_date, which we derive
                  from the filled gates at save time. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {isDetailing ? (
                  <StageGateDates
                    stageDates={stageDates}
                    onChange={setStageDates}
                    derivedStart={formData.start_date}
                    derivedEnd={formData.end_date}
                  />
                ) : (
                  <>
                    <FormField label="Start Date" type="date" value={formData.start_date} onChange={(v) => setFormData({ ...formData, start_date: v })} />
                    <FormField label="End Date" type="date" value={formData.end_date} onChange={(v) => setFormData({ ...formData, end_date: v })} />
                    <FormField label="Duration (days)" type="number" value={duration} readOnly={true} />
                  </>
                )}
                <FormField label="% Complete" type="slider" value={formData.percent_complete || 0} onChange={(v) => setFormData({ ...formData, percent_complete: v })} />
                <FormField label="WBS Code" value={formData.wbs_code || ''} onChange={(v) => setFormData({ ...formData, wbs_code: v })} />
              </div>
            </div>
          )}

          {activeTab === 'dependencies' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Predecessors */}
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                  Predecessors ({predecessorTasks.length})
                </div>
                {predecessorTasks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {predecessorTasks.map(pred => {
                      // The link object for this predecessor row — the
                      // editor lets users change link type (FS / SS /
                      // FF / SF) and lag_days inline. Defaults remain
                      // FS + 1 day so adding a predecessor without
                      // touching these controls preserves the previous
                      // hardcoded behaviour exactly.
                      const link = predecessorLinks.find((l) => l.id === pred.id) || { type: 'FS', lag_days: 1 };
                      return (
                        <div key={pred.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--hover-bg)', border: '1px solid var(--divider)', borderRadius: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>{pred.wbs_code || '—'}</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pred.task_name}</span>
                          <select
                            value={link.type}
                            onChange={(e) => updatePredecessor(pred.id, { type: e.target.value })}
                            title="Link type — FS=finish→start, SS=start→start, FF=finish→finish, SF=start→finish"
                            style={{
                              background: 'var(--bg-surface-low)', border: '1px solid var(--border-default)',
                              borderRadius: 4, padding: '2px 4px',
                              fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-primary)',
                              flexShrink: 0,
                            }}
                          >
                            {LINK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <input
                            type="number"
                            step="1"
                            value={link.lag_days ?? 0}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10);
                              updatePredecessor(pred.id, { lag_days: Number.isFinite(n) ? n : 0 });
                            }}
                            title="Lag in days — negative values fast-track (allow successor to begin before predecessor finishes)"
                            style={{
                              background: 'var(--bg-surface-low)', border: '1px solid var(--border-default)',
                              borderRadius: 4, padding: '2px 4px',
                              fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-primary)',
                              width: 48, textAlign: 'right', flexShrink: 0,
                            }}
                            aria-label="Lag in days"
                          />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', flexShrink: 0 }}>d</span>
                          <button onClick={() => removePredecessor(pred.id)} style={{ background: 'none', border: 'none', color: 'var(--status-error)', cursor: 'pointer', fontSize: 12, padding: 2 }}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>No predecessors</div>
                )}

                {/* Add predecessor */}
                {availablePreds.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <select
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) { addPredecessor(e.target.value); e.target.value = ''; } }}
                      style={{
                        width: '100%', background: 'var(--bg-surface-low)', border: '1px solid var(--border-default)',
                        borderRadius: 6, padding: '6px 8px', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-primary)',
                      }}
                    >
                      <option value="">+ Add predecessor...</option>
                      {availablePreds.map(t => (
                        <option key={t.id} value={t.id}>{t.wbs_code ? `${t.wbs_code} — ` : ''}{t.task_name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Successors (read-only) */}
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                  Successors ({successorTasks.length})
                </div>
                {successorTasks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {successorTasks.map(suc => (
                      <div key={suc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--hover-bg)', border: '1px solid var(--divider)', borderRadius: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>{suc.wbs_code || '—'}</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{suc.task_name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>No successors</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'links' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: 'var(--text-muted)',
                lineHeight: 1.4,
              }}>
                Link this task to RFIs, Change Orders, or Action Items so the
                source of any schedule slip is one click away — and so those
                modules can show which tasks they're affecting.
              </div>
              <MultiSelectChips
                label="Related RFIs"
                value={asIdArray(formData.related_rfi_ids)}
                options={rfiOptions}
                onChange={(v) => setFormData({ ...formData, related_rfi_ids: v })}
                placeholder={rfiOptions.length === 0 ? 'No RFIs in project' : 'Add RFI...'}
              />
              <MultiSelectChips
                label="Related Change Orders"
                value={asIdArray(formData.related_change_order_ids)}
                options={changeOrderOptions}
                onChange={(v) => setFormData({ ...formData, related_change_order_ids: v })}
                placeholder={changeOrderOptions.length === 0 ? 'No COs in project' : 'Add change order...'}
              />
              <MultiSelectChips
                label="Related Action Items"
                value={asIdArray(formData.related_action_item_ids)}
                options={actionItemOptions}
                onChange={(v) => setFormData({ ...formData, related_action_item_ids: v })}
                placeholder={actionItemOptions.length === 0 ? 'No action items in project' : 'Add action item...'}
              />
            </div>
          )}

          {activeTab === 'notes' && (
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              style={{
                width: '100%',
                height: 200,
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--border-default)',
                borderRadius: 8,
                padding: 12,
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text-primary)',
                resize: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="Add notes..."
            />
          )}

          {activeTab === 'history' && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
              No history yet
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--divider)' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: '8px 12px',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              padding: '8px 12px',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}

function FormField({ label, type = 'text', value, onChange, readOnly = false, options = [] }) {
  return (
    <div>
      <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      {type === 'select' ? (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg-surface-low)',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            padding: '6px 8px',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--text-primary)',
          }}
        >
          <option value="">—</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : type === 'date' ? (
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg-surface-low)',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            padding: '6px 8px',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--text-primary)',
            boxSizing: 'border-box',
          }}
        />
      ) : type === 'slider' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min="0"
            max="100"
            value={value || 0}
            onChange={(e) => onChange(parseInt(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', minWidth: 32, textAlign: 'right' }}>{value || 0}%</span>
        </div>
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          style={{
            width: '100%',
            background: readOnly ? 'var(--hover-bg)' : 'var(--bg-surface-low)',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            padding: '6px 8px',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--text-primary)',
            boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  );
}

// ── Detailing stage-gate date panel ───────────────────────────────────
//
// Two date pickers per gate (Start + End), one row each for OFA → BFA →
// FFF → Released, plus a read-only derived Bar-Start/Finish line so the
// user can see the Gantt bar anchors that will land on save. Each gate
// row shows its caption ("Back from Approval") so new PMs don't have to
// memorise the acronyms. The currently-active gate (the one the
// schedule "follows" for due-date tracking) gets a left rail in its
// gate colour. A "Clear" affordance per row wipes that single gate
// without disturbing the others.
function StageGateDates({ stageDates, onChange, derivedStart, derivedEnd }) {
  const setGateField = (gate, field, iso) => {
    const next = { ...stageDates };
    const prev = next[gate] || { start: null, end: null };
    next[gate] = { ...prev, [field]: iso || null };
    // If both halves of a gate are now empty, leave the empty object —
    // the apply helper drops it on save so we don't write `{}`.
    onChange(next);
  };
  const clearGate = (gate) => {
    const next = { ...stageDates };
    next[gate] = { start: null, end: null };
    onChange(next);
  };

  // Derived preview: earliest filled start → latest filled end.
  // Mirrors deriveStartEndFromStages on save so the user doesn't have
  // to save-and-look to understand the effect.
  const allDates = [];
  for (const g of DETAILING_STAGE_GATES) {
    const v = stageDates?.[g];
    if (v?.start) allDates.push(v.start);
    if (v?.end)   allDates.push(v.end);
  }
  const sortedAll = allDates.sort();
  const previewStart = sortedAll[0] || null;
  const previewEnd   = sortedAll[sortedAll.length - 1] || null;

  // Which gate is the schedule currently tracking? Highlight it in the
  // panel so the user can see at a glance which window drives the
  // "due when" date.
  const activeGate = getActiveStage(stageDates);
  const dueDate    = getEffectiveDueDate(stageDates);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}>
          Detailing Stage Dates
        </div>
        {activeGate && (
          <div
            title="The gate the schedule is currently tracking — its end date is the live due date."
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.10em',
              color: DETAILING_STAGE_META[activeGate]?.color || 'var(--accent)',
            }}
          >
            ACTIVE · {activeGate}
            {dueDate ? ` · DUE ${dueDate}` : ''}
          </div>
        )}
      </div>

      {DETAILING_STAGE_GATES.map((gate) => {
        const meta  = DETAILING_STAGE_META[gate];
        const v     = stageDates?.[gate] || { start: null, end: null };
        const start = v.start || '';
        const end   = v.end || '';
        const filled = !!(start || end);
        const isActive = gate === activeGate;
        return (
          <div
            key={gate}
            style={{
              display: 'grid',
              gridTemplateColumns: '88px 1fr 1fr auto',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: filled
                ? `color-mix(in srgb, ${meta.color} 8%, var(--bg-surface-low))`
                : 'var(--bg-surface-low)',
              border: `1px solid ${filled ? meta.color : 'var(--border-default)'}`,
              borderLeft: `3px solid ${isActive ? meta.color : (filled ? meta.color : 'var(--border-default)')}`,
              borderRadius: 6,
              boxShadow: isActive
                ? `0 0 0 1px color-mix(in srgb, ${meta.color} 30%, transparent)`
                : 'none',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 800,
                color: meta.color,
                letterSpacing: '0.08em',
              }}>
                {meta.label}
              </span>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 9,
                color: 'var(--text-muted)',
                lineHeight: 1.2,
              }}>
                {meta.caption}
              </span>
            </div>
            <DateInput
              ariaLabel={`${gate} start date`}
              placeholder="start"
              value={start}
              onChange={(iso) => setGateField(gate, 'start', iso)}
            />
            <DateInput
              ariaLabel={`${gate} end date`}
              placeholder="end"
              value={end}
              onChange={(iso) => setGateField(gate, 'end', iso)}
            />
            <button
              type="button"
              onClick={() => clearGate(gate)}
              disabled={!filled}
              aria-label={`Clear ${gate}`}
              style={{
                background: 'transparent',
                border: 'none',
                color: filled ? 'var(--text-muted)' : 'var(--divider)',
                cursor: filled ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                padding: '2px 6px',
              }}
            >
              ✕
            </button>
          </div>
        );
      })}

      {/* Derived bar anchors — helps the user understand how the Gantt
          bar will be placed without saving first. Prefers the live
          preview (which reflects unsaved edits) over the persisted
          derivedStart / derivedEnd props, so the hint stays in sync
          with what they just typed. */}
      <div
        style={{
          marginTop: 2,
          padding: '6px 8px',
          background: 'var(--bg-page)',
          border: '1px dashed var(--divider)',
          borderRadius: 4,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
        }}
      >
        <span>Bar start {previewStart || derivedStart || '—'}</span>
        <span>Bar end {previewEnd || derivedEnd || '—'}</span>
      </div>
    </div>
  );
}

// Inline date input used by the per-gate rows. Kept tiny so we can fit
// two of them side-by-side in a 480px drawer without crowding.
function DateInput({ value, onChange, ariaLabel, placeholder }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      placeholder={placeholder}
      style={{
        width: '100%',
        background: 'var(--bg-surface-low)',
        border: '1px solid var(--border-default)',
        borderRadius: 4,
        padding: '5px 6px',
        fontFamily: 'var(--font-body)',
        fontSize: 10,
        color: 'var(--text-primary)',
        boxSizing: 'border-box',
      }}
    />
  );
}
