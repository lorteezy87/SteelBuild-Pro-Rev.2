import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useTaskLinkOptions } from '@/hooks/useTaskLinkOptions';
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
import DateOrTbdInput from './DateOrTbdInput';

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

const drawerSurface = 'linear-gradient(180deg, rgba(8,12,19,0.99) 0%, rgba(5,8,13,1) 100%)';
const drawerPanel = 'rgba(14,20,30,0.98)';
const drawerPanelStrong = 'rgba(18,25,36,0.99)';
const drawerBorder = 'rgba(135,154,180,0.22)';
const drawerMutedBorder = 'rgba(135,154,180,0.14)';
const drawerText = 'rgba(238,244,252,0.96)';
const drawerMutedText = 'rgba(177,191,211,0.78)';

const drawerControlStyle = {
  width: '100%',
  background: drawerPanelStrong,
  border: `1px solid ${drawerBorder}`,
  borderRadius: 8,
  padding: '8px 10px',
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  color: drawerText,
  boxSizing: 'border-box',
  colorScheme: 'dark',
  outline: 'none',
};

/**
 * Searchable task picker — replaces the plain <select> for adding
 * predecessors / successors. Filters tasks by name or WBS code as
 * the user types. Keyboard-navigable (↑ ↓ Enter Escape).
 */
function SearchableTaskPicker({ tasks, onSelect, placeholder = '+ Search tasks...' }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return tasks.slice(0, 50); // show first 50 when empty
    const q = query.toLowerCase();
    return tasks.filter(t => {
      const name = (t.task_name || '').toLowerCase();
      const wbs = (t.wbs_code || '').toLowerCase();
      const phase = (t.phase || '').toLowerCase();
      return name.includes(q) || wbs.includes(q) || phase.includes(q);
    }).slice(0, 50);
  }, [tasks, query]);

  // Reset highlight when results change
  useEffect(() => { setHighlightIdx(0); }, [filtered.length, query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[highlightIdx];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleSelect = useCallback((t) => {
    onSelect(t.id);
    setQuery('');
    setIsOpen(false);
    setHighlightIdx(0);
  }, [onSelect]);

  const handleKeyDown = (e) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      e.preventDefault();
      return;
    }
    if (!isOpen) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx]);
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  if (tasks.length === 0) return null;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', marginTop: 8 }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            ...drawerControlStyle,
            paddingLeft: 30,
            fontSize: 11,
          }}
        />
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke={drawerMutedText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      {isOpen && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', left: 0, right: 0, top: '100%',
            marginTop: 4,
            background: 'rgba(12,17,25,0.99)',
            border: `1px solid ${drawerBorder}`,
            borderRadius: 8,
            maxHeight: 220,
            overflowY: 'auto',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{
              padding: '12px 14px', textAlign: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: drawerMutedText, letterSpacing: '0.06em',
            }}>
              No matching tasks
            </div>
          ) : (
            filtered.map((t, idx) => (
              <div
                key={t.id}
                onClick={() => handleSelect(t)}
                onMouseEnter={() => setHighlightIdx(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                  background: idx === highlightIdx ? 'rgba(255,255,255,0.06)' : 'transparent',
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${drawerMutedBorder}` : 'none',
                  transition: 'background 0.08s',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
                  color: 'var(--accent)', flexShrink: 0,
                  minWidth: 48, textAlign: 'right',
                }}>
                  {t.wbs_code || '—'}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 11,
                  color: idx === highlightIdx ? drawerText : drawerMutedText,
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.task_name}
                </span>
                {t.phase && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 600,
                    color: drawerMutedText, letterSpacing: '0.06em',
                    textTransform: 'uppercase', flexShrink: 0,
                  }}>
                    {t.phase}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function TaskDetailDrawer({ task, open, onClose, onUpdate, allTasks = [], onDelete, effectiveDates = {} }) {
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

  // Project-scoped option lists for the LINKS tab (RFIs / change orders /
  // action items). Data fetching + option shaping live in the hook; only
  // fetch while the drawer is open.
  const { rfiOptions, changeOrderOptions, actionItemOptions } =
    useTaskLinkOptions(task?.project_id, open);

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

  const duration = (formData.start_date && formData.end_date)
    ? calculateTaskDuration(formData.start_date, formData.end_date)
    : '';

  // When the user edits duration, keep start_date fixed and shift end_date.
  const handleDurationChange = (newDays) => {
    const days = parseInt(newDays, 10);
    if (!Number.isFinite(days) || days < 1) return;
    if (!formData.start_date) {
      toast.error('Set a start date first', { position: 'top-right', duration: 2000 });
      return;
    }
    const start = new Date(formData.start_date + 'T00:00:00');
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    const endStr = end.toISOString().slice(0, 10);
    setFormData({ ...formData, end_date: endStr });
  };
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
        { description: 'Guideline only — edit dates in the Details tab if needed.', position: 'top-right', duration: 3000 }
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

  // Available tasks to add as successors (not self, not already a successor).
  // Adding a successor means writing *this* task as a predecessor on the target.
  const successorIds = new Set(successorTasks.map((s) => s.id));
  const availableSuccessors = allTasks.filter(t =>
    t.id !== task.id && !successorIds.has(t.id) && !predecessorIds.includes(t.id)
  );

  const addSuccessor = (sucId) => {
    const sucTask = allTasks.find((t) => t.id === sucId);
    if (!sucTask) return;
    const sucLinks = parseDeps(sucTask.dependencies);
    if (sucLinks.some((l) => l.id === task.id)) return; // already linked
    const newLink = { id: task.id, type: 'FS', lag_days: 1 };
    const updated = [...sucLinks, newLink];
    const serialized = serializeDependencies(updated);
    // Push the update through the same onUpdate callback used for all
    // schedule-task mutations. The parent (ScheduleGantt) patches the
    // target task, NOT the currently-viewed one.
    onUpdate({ id: sucId, dependencies: serialized });
    toast.info(`Linked as predecessor of "${sucTask.task_name || sucTask.wbs_code || 'task'}"`, { position: 'top-right', duration: 2500 });
  };

  const removeSuccessor = (sucId) => {
    const sucTask = allTasks.find((t) => t.id === sucId);
    if (!sucTask) return;
    const sucLinks = parseDeps(sucTask.dependencies);
    const updated = sucLinks.filter((l) => l.id !== task.id);
    const serialized = updated.length > 0 ? serializeDependencies(updated) : null;
    onUpdate({ id: sucId, dependencies: serialized });
    toast.info(`Removed predecessor link from "${sucTask.task_name || sucTask.wbs_code || 'task'}"`, { position: 'top-right', duration: 2500 });
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(1,4,10,0.72)',
          backdropFilter: 'blur(3px)',
          zIndex: 1200,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: 'min(620px, calc(100vw - 24px))',
          background: drawerSurface,
          borderLeft: `1px solid ${drawerBorder}`,
          boxShadow: '-28px 0 70px rgba(0,0,0,0.66), inset 1px 0 0 rgba(255,255,255,0.04)',
          color: drawerText,
          zIndex: 1201,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${drawerMutedBorder}`, background: 'rgba(12,17,25,0.99)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: drawerMutedText, letterSpacing: '0.12em', marginBottom: 4 }}>
              {formData.task_type}{formData.wbs_code ? ` · ${formData.wbs_code}` : ''}
            </div>
            <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 21, fontWeight: 700, color: drawerText, margin: 0, lineHeight: 1.15 }}>
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
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${drawerMutedBorder}`, borderRadius: 8, cursor: 'pointer', color: drawerMutedText, fontSize: 18, width: 34, height: 34 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${drawerMutedBorder}`, background: 'rgba(9,13,20,0.99)' }}>
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
                color: activeTab === tab.toLowerCase() ? 'var(--accent)' : drawerMutedText,
                background: activeTab === tab.toLowerCase() ? 'rgba(86,176,255,0.12)' : 'transparent',
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
        <div style={{ flex: 1, overflow: 'auto', padding: 24, background: drawerSurface }}>
          {activeTab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Two-column grid for the always-shown identity / status
                  fields. On Detailing tasks the dates panel moves
                  below this block so each gate row has the full
                  drawer width to breathe (4 inputs + label + clear
                  don't fit in a 220px half-column). */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <FormField label="Task Name" value={formData.task_name} onChange={(v) => setFormData({ ...formData, task_name: v })} />
                  <FormField label="Task Type" type="select" value={formData.task_type} onChange={(v) => setFormData({ ...formData, task_type: v })} options={['Fabrication', 'Delivery', 'Install', 'Submittal', 'RFI', 'Milestone', 'Task']} />
                  <FormField label="Phase" type="select" value={formData.phase} onChange={(v) => setFormData({ ...formData, phase: v })} options={PHASES} />
                  <FormField label="Status" type="select" value={formData.status} onChange={(v) => setFormData({ ...formData, status: v })} options={['Not Started', 'In Progress', 'Complete', 'Delayed', 'On Hold']} />
                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <FormField label="Priority" type="select" value={formData.priority} onChange={(v) => setFormData({ ...formData, priority: v })} options={['Critical', 'High', 'Normal', 'Low']} />
                  <FormField label="Assigned To / Resources" value={formData.resource_names || formData.assigned_to || ''} onChange={(v) => setFormData({ ...formData, resource_names: v, assigned_to: v })} />
                  <FormField label="% Complete" type="slider" value={formData.percent_complete || 0} onChange={(v) => setFormData({ ...formData, percent_complete: v })} />
                  <FormField label="WBS Code" value={formData.wbs_code || ''} onChange={(v) => setFormData({ ...formData, wbs_code: v })} />
                </div>
              </div>

              {/* Effective-date banner — shown when predecessors shift the
                  Gantt bar past the stored dates so users understand why
                  the bar and drawer dates differ. */}
              {(() => {
                const eff = task?.id && effectiveDates[task.id];
                if (!eff?.shifted) return null;
                const fmtShort = (iso) => {
                  try { return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
                  catch { return iso; }
                };
                return (
                  <div style={{
                    background: 'rgba(59,130,246,0.10)',
                    border: '1px solid rgba(59,130,246,0.30)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    marginBottom: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'rgba(147,197,253,0.95)', letterSpacing: '0.04em' }}>
                      SHIFTED BY PREDECESSORS
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: drawerText }}>
                      Gantt shows {fmtShort(eff.start)} → {fmtShort(eff.end)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: drawerMutedText }}>
                      Dates below are the stored values — edit them to update the schedule.
                    </span>
                  </div>
                );
              })()}

              {/* Dates section — full-width so date pickers don't get
                  squished. Detailing tasks render the four-gate panel
                  (IFA / OFA / BFA / OFS / IFC / Released, each with start + end);
                  every other phase gets the simple Start / End / Duration
                  trio. The Gantt bar still renders from start_date /
                  end_date, derived from the filled gates at save time. */}
              {isDetailing ? (
                <StageGateDates
                  stageDates={stageDates}
                  onChange={setStageDates}
                  derivedStart={formData.start_date}
                  derivedEnd={formData.end_date}
                />
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 120px',
                  gap: 12,
                }}>
                  <div>
                    <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: drawerMutedText, display: 'block', marginBottom: 4 }}>Start Date</label>
                    <DateOrTbdInput
                      value={formData.start_date}
                      onChange={(v) => setFormData({ ...formData, start_date: v })}
                      inputStyle={{
                        width: '100%',
                        ...drawerControlStyle,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: drawerMutedText, display: 'block', marginBottom: 4 }}>End Date</label>
                    <DateOrTbdInput
                      value={formData.end_date}
                      onChange={(v) => setFormData({ ...formData, end_date: v })}
                      inputStyle={{
                        width: '100%',
                        ...drawerControlStyle,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: drawerMutedText, display: 'block', marginBottom: 4 }}>Duration (days)</label>
                    <input
                      type="number"
                      min="1"
                      value={duration}
                      onChange={(e) => handleDurationChange(e.target.value)}
                      placeholder="—"
                      title="Edit duration to auto-shift the end date"
                      style={{
                        ...drawerControlStyle,
                        width: '100%',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Schedule flags — keeps the dashboard's Critical Path
                  panel and Milestones panel in sync. Both ride on
                  metadata so we don't need a schema migration. */}
              <div style={{
                display: 'flex', gap: 12, flexWrap: 'wrap',
                padding: '10px 12px',
                background: drawerPanel,
                border: `1px solid ${drawerMutedBorder}`,
                borderRadius: 8,
              }}>
                <ScheduleFlag
                  label="Mark as Milestone"
                  checked={formData.task_type === 'Milestone'}
                  onChange={(v) => setFormData({
                    ...formData,
                    task_type: v ? 'Milestone' : (formData.task_type === 'Milestone' ? 'Task' : formData.task_type),
                  })}
                  hint="Surfaces this task on the dashboard's Key Milestones panel."
                />
                <ScheduleFlag
                  label="Mark as Critical Path"
                  checked={!!formData.metadata?.is_critical}
                  onChange={(v) => setFormData({
                    ...formData,
                    metadata: { ...(formData.metadata || {}), is_critical: !!v },
                  })}
                  hint="Surfaces this task on the dashboard's Critical Path panel."
                />
              </div>
            </div>
          )}

          {activeTab === 'dependencies' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Predecessors */}
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, color: drawerText, marginBottom: 8 }}>
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
                        <div key={pred.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: drawerPanel, border: `1px solid ${drawerMutedBorder}`, borderRadius: 8 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>{pred.wbs_code || '—'}</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: drawerMutedText, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pred.task_name}</span>
                          <select
                            value={link.type}
                            onChange={(e) => updatePredecessor(pred.id, { type: e.target.value })}
                            title="Link type — FS=finish→start, SS=start→start, FF=finish→finish, SF=start→finish"
                            style={{
                              background: drawerPanelStrong, border: `1px solid ${drawerBorder}`,
                              borderRadius: 6, padding: '3px 5px',
                              fontFamily: 'var(--font-mono)', fontSize: 9, color: drawerText,
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
                              background: drawerPanelStrong, border: `1px solid ${drawerBorder}`,
                              borderRadius: 6, padding: '3px 5px',
                              fontFamily: 'var(--font-mono)', fontSize: 9, color: drawerText,
                              width: 48, textAlign: 'right', flexShrink: 0,
                            }}
                            aria-label="Lag in days"
                          />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: drawerMutedText, flexShrink: 0 }}>d</span>
                          <button onClick={() => removePredecessor(pred.id)} style={{ background: 'none', border: 'none', color: 'var(--status-error)', cursor: 'pointer', fontSize: 12, padding: 2 }}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: drawerMutedText, padding: '8px 0' }}>No predecessors</div>
                )}

                {/* Add predecessor */}
                <SearchableTaskPicker
                  tasks={availablePreds}
                  onSelect={(id) => addPredecessor(id)}
                  placeholder="+ Search predecessors..."
                />
              </div>

              {/* Successors — editable: add/remove tasks that depend on this one */}
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, color: drawerText, marginBottom: 8 }}>
                  Successors ({successorTasks.length})
                </div>
                {successorTasks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {successorTasks.map(suc => (
                      <div key={suc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: drawerPanel, border: `1px solid ${drawerMutedBorder}`, borderRadius: 8 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>{suc.wbs_code || '—'}</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: drawerMutedText, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{suc.task_name}</span>
                        <button
                          onClick={() => removeSuccessor(suc.id)}
                          title="Remove successor link"
                          style={{ background: 'none', border: 'none', color: 'var(--status-error)', cursor: 'pointer', padding: '2px 6px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, flexShrink: 0 }}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: drawerMutedText, padding: '8px 0' }}>No successors</div>
                )}
                <SearchableTaskPicker
                  tasks={availableSuccessors}
                  onSelect={(id) => addSuccessor(id)}
                  placeholder="+ Search successors..."
                />
              </div>
            </div>
          )}

          {activeTab === 'links' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: drawerMutedText,
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
                ...drawerControlStyle,
                padding: 12,
                resize: 'none',
              }}
              placeholder="Add notes..."
            />
          )}

          {activeTab === 'history' && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: drawerMutedText, textAlign: 'center', padding: '40px 0' }}>
              No history yet
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, padding: 18, borderTop: `1px solid ${drawerMutedBorder}`, background: 'rgba(7,10,16,0.99)' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.025)',
              border: `1px solid ${drawerBorder}`,
              borderRadius: 8,
              padding: '10px 12px',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: drawerMutedText,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, rgba(86,176,255,0.98) 0%, rgba(35,134,230,0.98) 100%)',
              border: '1px solid rgba(86,176,255,0.4)',
              borderRadius: 8,
              padding: '10px 12px',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              color: '#04111f',
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
      <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: drawerMutedText, display: 'block', marginBottom: 5 }}>
        {label}
      </label>
      {type === 'select' ? (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...drawerControlStyle,
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
            ...drawerControlStyle,
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
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: drawerMutedText, minWidth: 32, textAlign: 'right' }}>{value || 0}%</span>
        </div>
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          style={{
            ...drawerControlStyle,
            background: readOnly ? 'rgba(255,255,255,0.035)' : drawerControlStyle.background,
            color: readOnly ? drawerMutedText : drawerText,
          }}
        />
      )}
    </div>
  );
}

// ── Schedule flag toggle (Milestone / Critical Path) ─────────────────
function ScheduleFlag({ label, checked, onChange, hint }) {
  return (
    <label
      title={hint}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        userSelect: 'none',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: checked ? 'var(--accent)' : drawerMutedText,
      }}
    >
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--accent)' }}
      />
      {label}
    </label>
  );
}

// ── Detailing stage-gate date panel ───────────────────────────────────
//
// Two date pickers per gate (Start + End), one row each for OFA → BFA →
// IFC → Released, plus a read-only derived Bar-Start/Finish line so the
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
          color: drawerMutedText,
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
              gridTemplateColumns: '112px minmax(0, 1fr) minmax(0, 1fr) 28px',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              background: filled
                ? `linear-gradient(90deg, color-mix(in srgb, ${meta.color} 16%, ${drawerPanelStrong}) 0%, ${drawerPanelStrong} 70%)`
                : drawerPanel,
              border: `1px solid ${filled ? `color-mix(in srgb, ${meta.color} 48%, ${drawerMutedBorder})` : drawerMutedBorder}`,
              borderLeft: `3px solid ${isActive ? meta.color : (filled ? meta.color : drawerBorder)}`,
              borderRadius: 8,
              boxShadow: isActive
                ? `0 0 0 1px color-mix(in srgb, ${meta.color} 34%, transparent), 0 14px 28px rgba(0,0,0,0.25)`
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
                color: drawerMutedText,
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
                color: filled ? drawerMutedText : 'rgba(135,154,180,0.3)',
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
          background: 'rgba(255,255,255,0.025)',
          border: `1px dashed ${drawerMutedBorder}`,
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: drawerMutedText,
          letterSpacing: '0.04em',
        }}
      >
        <span>Bar start {previewStart || derivedStart || '—'}</span>
        <span>Bar end {previewEnd || derivedEnd || '—'}</span>
      </div>
    </div>
  );
}

// Inline date input used by the per-gate rows. The dates panel now
// sits full-width below the 2-col grid in the drawer, so each input
// has plenty of room — no need to compress font size or padding the
// way the cramped half-column layout once required.
function DateInput({ value, onChange, ariaLabel, placeholder }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
        letterSpacing: '0.10em', textTransform: 'uppercase',
        color: drawerMutedText,
      }}>
        {placeholder}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        style={{
          ...drawerControlStyle,
          minWidth: 0,
        }}
      />
    </label>
  );
}
