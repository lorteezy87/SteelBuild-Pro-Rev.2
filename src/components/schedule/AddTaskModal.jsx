import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PHASES } from '../../utils/phases';
import { getTaskHierarchyDepth, sortTasksHierarchically } from './scheduleUtils';

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Complete', 'Delayed', 'On Hold'];
const PRIORITY_OPTIONS = ['Critical', 'High', 'Normal', 'Low'];
const TASK_TYPE_OPTIONS = ['Fabrication', 'Delivery', 'Install', 'Submittal', 'RFI', 'Milestone', 'Task'];

const createInitialSingleForm = (prefilledDate, parentTaskId = '') => ({
  task_name: '',
  task_type: 'Task',
  phase: 'Fabrication',
  start_date: prefilledDate || new Date().toISOString().split('T')[0],
  end_date: prefilledDate || new Date().toISOString().split('T')[0],
  status: 'Not Started',
  priority: 'Normal',
  predecessor_wbs: '',
  parent_task_id: parentTaskId,
});

const createInitialBulkForm = (prefilledDate) => ({
  bulk_text: '',
  phase: 'Fabrication',
  start_date: prefilledDate || new Date().toISOString().split('T')[0],
  end_date: prefilledDate || new Date().toISOString().split('T')[0],
  status: 'Not Started',
  priority: 'Normal',
  task_type: 'Task',
});

export default function AddTaskModal({
  open,
  onClose,
  onSubmit,
  onBulkSubmit,
  nextTaskNumber,
  projectName,
  prefilledDate,
  allTasks = [],
  initialMode = 'single',
  initialParentTaskId = '',
}) {
  const [mode, setMode] = useState(initialMode);
  const [singleForm, setSingleForm] = useState(createInitialSingleForm(prefilledDate, initialParentTaskId));
  const [bulkForm, setBulkForm] = useState(createInitialBulkForm(prefilledDate));

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setSingleForm(createInitialSingleForm(prefilledDate, initialParentTaskId));
    setBulkForm(createInitialBulkForm(prefilledDate));
  }, [prefilledDate, open, initialMode, initialParentTaskId]);

  const orderedTasks = useMemo(() => sortTasksHierarchically(allTasks), [allTasks]);

  const resetAndClose = () => {
    setSingleForm(createInitialSingleForm(prefilledDate, initialParentTaskId));
    setBulkForm(createInitialBulkForm(prefilledDate));
    onClose();
  };

  const handleSingleSubmit = () => {
    if (singleForm.task_name && singleForm.start_date && singleForm.end_date) {
      onSubmit({
        ...singleForm,
        parent_task_id: singleForm.parent_task_id || null,
      });
      resetAndClose();
    }
  };

  const handleBulkSubmit = () => {
    if (!bulkForm.bulk_text.trim() || !onBulkSubmit) return;
    onBulkSubmit(bulkForm);
    resetAndClose();
  };

  if (!open) return null;

  return (
    <>
      <div onClick={resetAndClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 998 }} />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 760,
        maxWidth: 'calc(100vw - 32px)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--accent-border)',
        borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        zIndex: 999,
        padding: 24,
      }}>
        <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: 4 }}>
          New Task {nextTaskNumber ? `- ${nextTaskNumber}` : ''}
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', margin: '0 0 20px 0', letterSpacing: '0.08em' }}>
          {projectName}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {[
            { id: 'single', label: 'Single Task' },
            { id: 'bulk', label: 'Bulk Add' },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => setMode(option.id)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${mode === option.id ? 'var(--accent-border)' : 'var(--border-default)'}`,
                background: mode === option.id ? 'var(--accent-muted)' : 'var(--bg-sidebar)',
                color: mode === option.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === 'single' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <FormField label="Task Name *" value={singleForm.task_name} onChange={(v) => setSingleForm({ ...singleForm, task_name: v })} />
                <FormField label="Task Type *" type="select" value={singleForm.task_type} onChange={(v) => setSingleForm({ ...singleForm, task_type: v })} options={TASK_TYPE_OPTIONS} />
                <FormField label="Phase" type="select" value={singleForm.phase} onChange={(v) => setSingleForm({ ...singleForm, phase: v })} options={PHASES} />
                <FormField label="Status" type="select" value={singleForm.status} onChange={(v) => setSingleForm({ ...singleForm, status: v })} options={STATUS_OPTIONS} />
                <FormField
                  label="Parent Task"
                  type="select"
                  value={singleForm.parent_task_id || ''}
                  onChange={(v) => setSingleForm({ ...singleForm, parent_task_id: v })}
                  options={orderedTasks.map((task) => ({
                    value: task.id,
                    label: `${'— '.repeat(getTaskHierarchyDepth(task, orderedTasks))}${task.wbs_code || 'WBS Pending'} · ${task.task_name}`,
                  }))}
                  allowBlank
                  renderOption={(option) => option.label}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <FormField label="Start Date *" type="date" value={singleForm.start_date} onChange={(v) => setSingleForm({ ...singleForm, start_date: v })} />
                <FormField label="End Date *" type="date" value={singleForm.end_date} onChange={(v) => setSingleForm({ ...singleForm, end_date: v })} />
                <FormField label="Priority" type="select" value={singleForm.priority} onChange={(v) => setSingleForm({ ...singleForm, priority: v })} options={PRIORITY_OPTIONS} />
                <FormField label="Predecessor WBS Codes" value={singleForm.predecessor_wbs} onChange={(v) => setSingleForm({ ...singleForm, predecessor_wbs: v })} placeholder="Comma-separated WBS codes" />
              </div>
            </div>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 16 }}>
              Available predecessor WBS: {allTasks.filter(task => task.wbs_code).slice(0, 12).map(task => task.wbs_code).join(', ') || 'None yet'}
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Bulk Task Paste
              </label>
              <textarea
                value={bulkForm.bulk_text}
                onChange={(e) => setBulkForm({ ...bulkForm, bulk_text: e.target.value })}
                placeholder={[
                  'One task per line. Indent with 2 spaces or a tab to create subtasks.',
                  'Format: Task Name | Phase | Start | Finish | Status | Priority | Predecessor WBS',
                  'Example:',
                  'Steel Release',
                  '  Review embeds | Detailing | 2026-04-03 | 2026-04-05 | Not Started | High',
                  '  Final approve stair set | Detailing | 2026-04-06 | 2026-04-07 | Not Started | Critical | 2.1',
                ].join('\n')}
                style={{
                  width: '100%',
                  minHeight: 260,
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: '#FFFFFF',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FormField label="Default Phase" type="select" value={bulkForm.phase} onChange={(v) => setBulkForm({ ...bulkForm, phase: v })} options={PHASES} />
              <FormField label="Default Start" type="date" value={bulkForm.start_date} onChange={(v) => setBulkForm({ ...bulkForm, start_date: v })} />
              <FormField label="Default Finish" type="date" value={bulkForm.end_date} onChange={(v) => setBulkForm({ ...bulkForm, end_date: v })} />
              <FormField label="Default Status" type="select" value={bulkForm.status} onChange={(v) => setBulkForm({ ...bulkForm, status: v })} options={STATUS_OPTIONS} />
              <FormField label="Default Priority" type="select" value={bulkForm.priority} onChange={(v) => setBulkForm({ ...bulkForm, priority: v })} options={PRIORITY_OPTIONS} />
              <FormField label="Default Task Type" type="select" value={bulkForm.task_type} onChange={(v) => setBulkForm({ ...bulkForm, task_type: v })} options={TASK_TYPE_OPTIONS} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <Button onClick={resetAndClose} variant="outline" style={{ flex: 1 }}>Cancel</Button>
          <Button
            onClick={mode === 'single' ? handleSingleSubmit : handleBulkSubmit}
            style={{ flex: 1, background: 'var(--accent)', color: 'white' }}
          >
            {mode === 'single' ? 'Create Task' : 'Create Tasks'}
          </Button>
        </div>
      </div>
    </>
  );
}

function FormField({ label, type = 'text', value, onChange, options = [], placeholder, allowBlank = false, renderOption }) {
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
            background: 'var(--bg-sidebar)',
            border: '1px solid var(--accent-border)',
            borderRadius: 6,
            padding: '6px 8px',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: '#FFFFFF',
          }}
        >
          {allowBlank ? <option value="">— None —</option> : null}
          {options.map((opt) => {
            const option = typeof opt === 'string' ? { value: opt, label: opt } : opt;
            return (
              <option key={option.value} value={option.value}>
                {renderOption ? renderOption(option) : option.label}
              </option>
            );
          })}
        </select>
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            background: 'var(--bg-sidebar)',
            border: '1px solid var(--accent-border)',
            borderRadius: 6,
            padding: '6px 8px',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: '#FFFFFF',
          }}
        />
      )}
    </div>
  );
}
