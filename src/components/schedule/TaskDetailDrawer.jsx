import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { calculateTaskDuration, computeAutoScheduledDates } from './scheduleUtils';
import { PHASES } from '../../utils/phases';
import {
  DETAILING_STAGE_GATES,
  DETAILING_STAGE_META,
  getStageDates,
  applyStageDatesToTask,
  usesStageDates,
} from '../../lib/stageDates';

/**
 * Parse the `dependencies` TEXT column.
 * Stored as JSON array of task IDs: ["uuid1","uuid2"]
 * Returns an array of ID strings.
 */
function parseDeps(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
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
    onUpdate({ ...rest, ...patch, id: task.id });
  };

  const duration = calculateTaskDuration(formData.start_date, formData.end_date);
  const predecessorIds = parseDeps(formData.dependencies);
  const predecessorTasks = allTasks.filter(t => predecessorIds.includes(t.id));
  const successorTasks = allTasks.filter(t => {
    const deps = parseDeps(t.dependencies);
    return deps.includes(task.id);
  });

  // Dependency management
  //
  // Adding a predecessor auto-shifts start/end so the task lines up
  // behind the LATEST predecessor's finish (FS + 1 day), preserving
  // this task's current duration. The suggestion is written into
  // formData — the user can still edit start_date or end_date in the
  // Details tab before hitting Save, without removing the dependency.
  // We only pull dates FORWARD; if the user's current start already
  // satisfies the constraint, nothing is changed.
  const addPredecessor = (predId) => {
    const current = parseDeps(formData.dependencies);
    if (current.includes(predId)) return;
    const updated = [...current, predId];

    // Compute auto-shift using every predecessor (existing + the new one),
    // so adding a predecessor that finishes before the current ones
    // doesn't pull the task backwards.
    const allPredTasks = allTasks.filter(t => updated.includes(t.id));
    const shift = computeAutoScheduledDates(formData, allPredTasks);

    if (shift) {
      setFormData({
        ...formData,
        dependencies: JSON.stringify(updated),
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
      setFormData({ ...formData, dependencies: JSON.stringify(updated) });
    }
  };

  const removePredecessor = (predId) => {
    const current = parseDeps(formData.dependencies);
    const updated = current.filter(id => id !== predId);
    setFormData({ ...formData, dependencies: updated.length > 0 ? JSON.stringify(updated) : null });
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
          {['DETAILS', 'DEPENDENCIES', 'NOTES', 'HISTORY'].map(tab => (
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
                    {predecessorTasks.map(pred => (
                      <div key={pred.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--hover-bg)', border: '1px solid var(--divider)', borderRadius: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>{pred.wbs_code || '—'}</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pred.task_name}</span>
                        <button onClick={() => removePredecessor(pred.id)} style={{ background: 'none', border: 'none', color: 'var(--status-error)', cursor: 'pointer', fontSize: 12, padding: 2 }}>✕</button>
                      </div>
                    ))}
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
// Four date pickers, one per gate (OFA → BFA → FFF → Released), plus a
// read-only derived Start/Finish line so the user can see the Gantt
// bar anchors that will land on save. Each gate row shows its caption
// ("Back from Approval") so new PMs don't have to memorise the
// acronyms. A "Clear" affordance per row wipes that single gate
// without disturbing the others.
function StageGateDates({ stageDates, onChange, derivedStart, derivedEnd }) {
  const setGate = (gate, iso) => {
    const next = { ...stageDates };
    if (iso) next[gate] = iso;
    else delete next[gate];
    onChange(next);
  };
  const filled = DETAILING_STAGE_GATES.filter((g) => stageDates[g]);
  // Derived preview: earliest filled = bar start, latest = bar end.
  // Mirrors applyStageDatesToTask's logic; shown live so the user
  // doesn't have to save-and-look to understand the effect.
  const sorted = [...filled].sort((a, b) => (stageDates[a] || '').localeCompare(stageDates[b] || ''));
  const previewStart = sorted[0] ? stageDates[sorted[0]] : null;
  const previewEnd   = sorted.length ? stageDates[sorted[sorted.length - 1]] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
      {DETAILING_STAGE_GATES.map((gate) => {
        const meta = DETAILING_STAGE_META[gate];
        const value = stageDates[gate] || '';
        return (
          <div
            key={gate}
            style={{
              display: 'grid',
              gridTemplateColumns: '88px 1fr auto',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: value
                ? `color-mix(in srgb, ${meta.color} 8%, var(--bg-surface-low))`
                : 'var(--bg-surface-low)',
              border: `1px solid ${value ? meta.color : 'var(--border-default)'}`,
              borderRadius: 6,
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
            <input
              type="date"
              value={value}
              onChange={(e) => setGate(gate, e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                padding: '5px 8px',
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setGate(gate, null)}
              disabled={!value}
              aria-label={`Clear ${gate}`}
              style={{
                background: 'transparent',
                border: 'none',
                color: value ? 'var(--text-muted)' : 'var(--divider)',
                cursor: value ? 'pointer' : 'not-allowed',
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
      {/* Derived anchors — helps the user understand how the Gantt bar
          will be placed without saving first. Prefers the live preview
          (which reflects unsaved edits) over the persisted derivedStart
          / derivedEnd props, so the hint stays in sync with what they
          just typed. */}
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
