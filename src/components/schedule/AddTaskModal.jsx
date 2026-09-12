import React, { useState, useEffect, useCallback, useRef, useId } from 'react';
import { todayLocalISO } from "@/lib/dateMath";
import { Button } from '@/components/ui/button';
import { PHASES } from '../../utils/phases';
import {
  SCHEDULE_STATUSES,
  SCHEDULE_TASK_TYPES,
  SCHEDULE_PRIORITIES,
  DEFAULT_SCHEDULE_STATUS,
  DEFAULT_SCHEDULE_PRIORITY,
} from '@/lib/schedule/taskStatus';
import { durationFromDates, finishFromDuration } from '@/lib/schedule/duration';
import { serializeDependencies } from '@/services/scheduleCascade';
import DateOrTbdInput from './DateOrTbdInput';
import SearchableTaskPicker from './SearchableTaskPicker';

/**
 * New Task — one Bulk-Add row.
 *
 * Audit §4.1. The two add paths were backwards: `BulkAddTaskModal`, behind the
 * secondary button, was the better editor — a real duration field that computes
 * the finish, arrow-key cell navigation, paste-friendly rows — while the
 * primary "+ New Task" had:
 *
 *   - no duration field, so both dates had to be typed by hand
 *   - no predecessor field, so linking meant creating the task and reopening
 *     the drawer: two steps for the most common thing you do after adding one
 *   - a flat <select> of every task on the project for Parent, unsearchable,
 *     while SearchableTaskPicker already existed and was used elsewhere
 *   - no Enter to submit and no Escape to close
 *   - a status list that did not match Bulk Add's, both feeding one CHECK
 *
 * This is the same field set as a Bulk Add row, in a single-row form, with the
 * keyboard behaviour the audit asked for: Enter saves and opens the next.
 *
 * Choosing a predecessor writes the link but deliberately does NOT move the
 * dates. The drawer shifts them because it is editing a task whose stored dates
 * are already committed; here the full-scope cascade in Schedule.tsx positions
 * the bar from the link the moment the task exists, so shifting the stored
 * dates as well would bake the offset in twice.
 */

const emptyForm = (prefilledDate) => ({
  task_name: '',
  task_type: 'Task',
  phase: 'Fabrication',
  start_date: prefilledDate || todayLocalISO(),
  end_date: prefilledDate || todayLocalISO(),
  status: DEFAULT_SCHEDULE_STATUS,
  priority: DEFAULT_SCHEDULE_PRIORITY,
  resource_names: '',
  parent_task_id: null,
  predecessor_id: null,
});

/**
 * Fields that carry over to the next task when saving with "Save & Add Next".
 *
 * Someone entering a fabrication sequence adds ten tasks in the same phase, on
 * the same crew, under the same parent. Clearing all of that between rows is
 * what made the old modal feel like ten separate forms.
 */
const STICKY_KEYS = ['task_type', 'phase', 'start_date', 'end_date', 'status', 'priority', 'resource_names', 'parent_task_id'];

export default function AddTaskModal({
  open,
  onClose,
  onSubmit,
  nextTaskNumber = '',
  projectName = '',
  prefilledDate = '',
  isSaving = false,
  existingTasks,
}) {
  const [formData, setFormData] = useState(() => emptyForm(prefilledDate));
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (open) {
      // Full reset each time the modal opens so stale values don't persist
      setFormData(emptyForm(prefilledDate));
      setBusy(false);
    }
  }, [open, prefilledDate]);

  /**
   * Duration ⇄ dates, on the one inclusive convention (§2.4).
   *
   * Mon → Fri is 5 days and a same-day task is 1, matching the stored column,
   * its database trigger, and what a P6 or MS Project export means. Editing
   * either end recomputes the other rather than letting the three drift.
   */
  const patch = useCallback((key, value) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'duration') {
        const end = finishFromDuration(next.start_date, value);
        if (end) next.end_date = end;
      } else if (key === 'start_date') {
        const days = durationFromDates(prev.start_date, prev.end_date);
        const end = days !== null ? finishFromDuration(value, days) : null;
        if (end) next.end_date = end;
      }
      return next;
    });
  }, []);

  const durationDays = durationFromDates(formData.start_date, formData.end_date);
  const canSave = Boolean(formData.task_name.trim()) && !busy && !isSaving;

  const buildPayload = () => ({
    task_name: formData.task_name.trim(),
    task_type: formData.task_type,
    phase: formData.phase,
    start_date: formData.start_date || null,
    end_date: formData.end_date || null,
    // Send the derived value, never a separately typed one: the dates are the
    // source of truth and the column mirrors them.
    duration: durationFromDates(formData.start_date, formData.end_date),
    status: formData.status,
    priority: formData.priority,
    resource_names: formData.resource_names || null,
    parent_task_id: formData.parent_task_id || null,
    dependencies: formData.predecessor_id
      ? serializeDependencies([{ id: formData.predecessor_id, type: 'FS', lag_days: 1 }])
      : null,
  });

  /**
   * @param {boolean} addAnother keep the modal open and start the next task
   */
  const handleSubmit = async (addAnother) => {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSubmit(buildPayload());
      if (addAnother) {
        setFormData((prev) => {
          const next = emptyForm(prefilledDate);
          for (const key of STICKY_KEYS) next[key] = prev[key];
          return next;
        });
        // Focus after React has re-rendered the cleared field.
        requestAnimationFrame(() => nameRef.current?.focus());
      } else {
        onClose();
      }
    } catch {
      // The mutation's onError has already told the user what failed. Keep the
      // form exactly as typed so it can be corrected and retried.
    } finally {
      setBusy(false);
    }
  };

  // Enter saves and opens the next; Escape closes. No <form> (house rule), so
  // both are wired by hand — the Task List's inline editor does the same.
  // Enter inside the predecessor/parent search must NOT submit: the picker
  // uses it to choose the highlighted row.
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Enter') return;
    if (e.target?.dataset?.picker === 'true' || e.target?.closest?.('[data-picker-wrap="true"]')) return;
    e.preventDefault();
    void handleSubmit(e.shiftKey);
  };

  if (!open) return null;

  const saving = busy || isSaving;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'color-mix(in srgb, var(--sbd-gantt-bg) 86%, transparent)',
          backdropFilter: 'blur(10px)',
          zIndex: 998,
        }}
      />
      <div
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 620,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: 'var(--bg-surface-secondary)',
          border: '1px solid var(--accent-border)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          zIndex: 999,
          padding: 24,
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: 4 }}>
          New Task{nextTaskNumber ? ` — ${nextTaskNumber}` : ''}
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', margin: '0 0 20px 0', letterSpacing: '0.08em' }}>
          {projectName}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FormField label="Task Name *" value={formData.task_name} onChange={(v) => patch('task_name', v)} inputRef={nameRef} autoFocus />
            <FormField label="Task Type *" type="select" value={formData.task_type} onChange={(v) => patch('task_type', v)} options={SCHEDULE_TASK_TYPES} />
            <FormField label="Phase" type="select" value={formData.phase} onChange={(v) => patch('phase', v)} options={PHASES} />
            <FormField label="Status" type="select" value={formData.status} onChange={(v) => patch('status', v)} options={SCHEDULE_STATUSES} />
            <FormField label="Priority" type="select" value={formData.priority} onChange={(v) => patch('priority', v)} options={SCHEDULE_PRIORITIES} />
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FormField label="Start Date" type="date" value={formData.start_date} onChange={(v) => patch('start_date', v)} />
            <FormField
              label="Duration (days)"
              type="number"
              value={durationDays ?? ''}
              onChange={(v) => patch('duration', v)}
              placeholder="—"
              hint="Inclusive: Mon → Fri is 5 days, a same-day task is 1."
            />
            <FormField label="End Date" type="date" value={formData.end_date} onChange={(v) => patch('end_date', v)} />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: -4 }}>
              Use TBD when the task is real but the schedule window is not known yet.
            </div>
            <FormField label="Resources / Assigned To" value={formData.resource_names} onChange={(v) => patch('resource_names', v)} />
          </div>
        </div>

        {/* Parent + predecessor — searchable, not a flat list of every task
            on the project (§4.1). Wrapped so Enter inside a picker chooses the
            highlighted row instead of submitting the form. */}
        <div data-picker-wrap="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={LABEL_STYLE}>Parent Task</label>
            <SearchableTaskPicker
              tasks={existingTasks || []}
              value={formData.parent_task_id}
              onSelect={(id) => patch('parent_task_id', id)}
              onClear={() => patch('parent_task_id', null)}
              placeholder="Search tasks…"
            />
          </div>
          <div>
            <label style={LABEL_STYLE}>Predecessor</label>
            <SearchableTaskPicker
              tasks={existingTasks || []}
              value={formData.predecessor_id}
              onSelect={(id) => patch('predecessor_id', id)}
              onClear={() => patch('predecessor_id', null)}
              placeholder="Search tasks…"
            />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 4 }}>
              Finish-to-start, 1 day lag. The Gantt places the bar from the link.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button onClick={onClose} variant="outline" style={{ flex: 1 }} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => handleSubmit(true)}
            variant="outline"
            style={{ flex: 1.4 }}
            disabled={!canSave}
            title="Save this task and start another (Shift+Enter)"
          >
            {saving ? 'Saving…' : 'Save & Add Next'}
          </Button>
          <Button
            onClick={() => handleSubmit(false)}
            disabled={!canSave}
            style={{ flex: 1.4, background: 'var(--accent)', color: 'var(--on-accent)', opacity: saving ? 0.6 : 1 }}
            title="Save and close (Enter)"
          >
            {saving ? 'Creating…' : 'Create Task →'}
          </Button>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em', marginTop: 10, textAlign: 'right' }}>
          ENTER SAVES · SHIFT+ENTER SAVES &amp; ADDS NEXT · ESC CLOSES
        </div>
      </div>
    </>
  );
}

const LABEL_STYLE = {
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: 4,
};

const CONTROL_STYLE = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--accent-border)',
  borderRadius: 6,
  padding: '6px 8px',
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  color: 'var(--text-primary)',
};

function FormField({ label, type = 'text', value, onChange, options = [], placeholder, hint, inputRef, autoFocus }) {
  // A real label/control pairing, not a floating <label>: it gives the field a
  // click target and an accessible name. The old modal had neither.
  const id = useId();
  return (
    <div>
      <label htmlFor={id} style={LABEL_STYLE}>{label}</label>
      {type === 'select' ? (
        <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)} style={CONTROL_STYLE}>
          <option value="">—</option>
          {options.map((opt) => {
            const isObj = typeof opt === 'object';
            return <option key={isObj ? opt.value : opt} value={isObj ? opt.value : opt}>{isObj ? opt.label : opt}</option>;
          })}
        </select>
      ) : type === 'date' ? (
        <DateOrTbdInput id={id} value={value} onChange={onChange} inputStyle={CONTROL_STYLE} />
      ) : (
        <input
          id={id}
          ref={inputRef}
          autoFocus={autoFocus}
          type={type}
          min={type === 'number' ? 1 : undefined}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={CONTROL_STYLE}
        />
      )}
      {hint && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
