import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useTaskLinkOptions } from '@/hooks/useTaskLinkOptions';
import { calculateTaskDuration, computeAutoScheduledDates } from './scheduleUtils';
import { PHASES } from '../../utils/phases';
import {
  getStageDates,
  applyStageDatesToTask,
  usesStageDates,
} from '../../lib/stageDates';
import {
  addDaysIso,
  serializeDependencies,
  LINK_TYPES,
} from '../../services/scheduleCascade';
import MultiSelectChips from '@/components/shared/MultiSelectChips';
import { logActivity } from '@/services/auditLogger';
import DateOrTbdInput from './DateOrTbdInput';
import { validReparentTargets } from '@/lib/schedule/hierarchy';
import { isSummaryTask, buildParentIdSet } from '@/lib/schedule/summaryTasks';
import { asIdArray, sameIdSet, parseDeps } from './taskDetailDerive';
import {
  SearchableTaskPicker,
  FormField,
  ScheduleFlag,
  StageGateDates,
  drawerControlStyle,
  drawerText,
  drawerMutedText,
  drawerBorder,
  drawerMutedBorder,
  drawerPanel,
  drawerPanelStrong,
  drawerSurface,
} from './taskDetailPrimitives';

export default function TaskDetailDrawer({ task, open, onClose, onUpdate, onReparent, allTasks = [], onDelete, effectiveDates = {} }) {
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

  // Summary/parent tasks have their start_date/end_date DERIVED from children by
  // the DB rollup trigger — any value typed here is overwritten on the next
  // child change. Detect via the canonical predicate (row flags OR appearing as
  // another task's parent_task_id across allTasks) and render the date/duration
  // controls read-only so users aren't misled into editing a derived field.
  const summaryParentIds = buildParentIdSet(allTasks);
  const isSummary = isSummaryTask(task, summaryParentIds);

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
    // UTC-safe: new Date(str+'T00:00:00') (local) + toISOString() (UTC) shifts
    // end_date by a day under a non-zero UTC offset. addDaysIso does the
    // arithmetic in UTC — timezone-independent. (days is already guarded ≥1.)
    const endStr = addDaysIso(formData.start_date, days);
    if (!endStr) return; // unparseable start_date — leave dates untouched
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

  // Parent picker — valid reparent targets exclude self + all descendants
  // so the picker can never offer an illegal parent. The DB cycle trigger
  // is defense-in-depth.
  const parentTargetIds = validReparentTargets(allTasks, task.id);
  const parentOptions = allTasks.filter((t) => parentTargetIds.has(t.id));
  const currentParent = task.parent_task_id
    ? allTasks.find((t) => t.id === task.parent_task_id)
    : null;

  // Route parent changes through the shared, audited reparent writer
  // (sort_order append + audit entry) so the drawer matches the drag and
  // bulk-reparent paths. Falls back to a bare parent_task_id patch if the
  // host page didn't wire onReparent, so the drawer still works standalone.
  const applyParent = onReparent || ((childId, newParentId) => onUpdate({ id: childId, parent_task_id: newParentId }));

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
          background: 'color-mix(in srgb, var(--sbd-gantt-bg) 72%, transparent)',
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
          boxShadow: 'var(--shadow-lg)',
          color: drawerText,
          zIndex: 1201,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${drawerMutedBorder}`, background: 'var(--bg-surface-low)' }}>
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
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{ background: drawerPanelStrong, border: `1px solid ${drawerMutedBorder}`, borderRadius: 8, cursor: 'pointer', color: drawerMutedText, fontSize: 18, width: 34, height: 34 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${drawerMutedBorder}`, background: 'var(--bg-surface-low)' }}>
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
                    background: 'var(--accent-muted)',
                    border: '1px solid var(--accent-border)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    marginBottom: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                        disabled={isSummary}
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
                        disabled={isSummary}
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
                        readOnly={isSummary}
                        disabled={isSummary}
                        placeholder="—"
                        title={isSummary ? 'Derived from children — not editable' : 'Edit duration to auto-shift the end date'}
                        style={{
                          ...drawerControlStyle,
                          width: '100%',
                          ...(isSummary ? { opacity: 0.55, cursor: 'not-allowed', background: drawerPanelStrong, color: drawerMutedText } : {}),
                        }}
                      />
                    </div>
                  </div>
                  {isSummary && (
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.04em',
                      color: drawerMutedText, lineHeight: 1.4,
                      padding: '6px 8px',
                      background: drawerPanel,
                      border: `1px dashed ${drawerMutedBorder}`,
                      borderRadius: 2,
                    }}>
                      Summary task — dates roll up from child tasks (earliest start, latest finish) and can't be edited directly.
                    </div>
                  )}
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

              {/* Parent task picker — lets a user set or clear the hierarchy
                  parent directly from the drawer (there is no drag-reparent on
                  mobile / when the Gantt indent buttons aren't visible). Routes
                  through applyParent → the shared audited reparent writer so the
                  drawer matches the drag and bulk-reparent paths (sort_order +
                  audit). parentOptions already excludes self + descendants; the
                  DB cycle trigger is defense-in-depth. */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
                  PARENT TASK
                </label>
                {currentParent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                      {currentParent.wbs_code ? `${currentParent.wbs_code} — ` : ''}{currentParent.task_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => applyParent(task.id, null)}
                      style={{ fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--divider)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
                    >
                      Promote to top level
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Top level (no parent)</div>
                )}
                <SearchableTaskPicker
                  tasks={parentOptions}
                  onSelect={(id) => applyParent(task.id, id)}
                  placeholder="+ Set parent task…"
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
        <div style={{ display: 'flex', gap: 10, padding: 18, borderTop: `1px solid ${drawerMutedBorder}`, background: 'var(--bg-surface-low)' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: drawerPanel,
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
              background: 'var(--accent)',
              border: '1px solid var(--accent-border)',
              borderRadius: 8,
              padding: '10px 12px',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--on-accent)',
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
