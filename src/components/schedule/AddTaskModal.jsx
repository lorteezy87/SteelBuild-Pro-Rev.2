import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PHASES } from '../../utils/phases';

export default function AddTaskModal({ open, onClose, onSubmit, nextTaskNumber, projectName, prefilledDate, isSaving = false, existingTasks }) {
  const [formData, setFormData] = useState({
    task_name: '',
    task_type: 'Task',
    phase: 'Fabrication',
    start_date: prefilledDate || new Date().toISOString().split('T')[0],
    end_date: prefilledDate || new Date().toISOString().split('T')[0],
    status: 'Not Started',
    priority: 'Normal',
    resource_names: '',
    parent_task_id: null,
  });

  useEffect(() => {
    if (open) {
      // Full reset each time the modal opens so stale values don't persist
      setFormData({
        task_name: '',
        task_type: 'Task',
        phase: 'Fabrication',
        start_date: prefilledDate || new Date().toISOString().split('T')[0],
        end_date: prefilledDate || new Date().toISOString().split('T')[0],
        status: 'Not Started',
        priority: 'Normal',
        resource_names: '',
        parent_task_id: null,
      });
    }
  }, [open, prefilledDate]);

  const handleSubmit = () => {
    if (!isSaving && formData.task_name && formData.start_date && formData.end_date) {
      onSubmit(formData);
      // Form will reset naturally when modal unmounts on success.
      // Do NOT reset here — keeps data visible while mutation is in flight.
    }
  };

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 998 }} />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 580,
        background: 'var(--bg-surface)',
        border: '1px solid var(--accent-border)',
        borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        zIndex: 999,
        padding: 24,
      }}>
        <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: 4 }}>
          New Task — {nextTaskNumber}
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', margin: '0 0 20px 0', letterSpacing: '0.08em' }}>
          {projectName}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FormField label="Task Name *" value={formData.task_name} onChange={(v) => setFormData({ ...formData, task_name: v })} />
            <FormField label="Task Type *" type="select" value={formData.task_type} onChange={(v) => setFormData({ ...formData, task_type: v })} options={['Fabrication', 'Delivery', 'Install', 'Submittal', 'RFI', 'Milestone', 'Task']} />
            <FormField label="Phase" type="select" value={formData.phase} onChange={(v) => setFormData({ ...formData, phase: v })} options={PHASES} />
            <FormField label="Status" type="select" value={formData.status} onChange={(v) => setFormData({ ...formData, status: v })} options={['Not Started', 'In Progress', 'Complete', 'Delayed', 'On Hold']} />
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FormField label="Start Date *" type="date" value={formData.start_date} onChange={(v) => setFormData({ ...formData, start_date: v })} />
            <FormField label="End Date *" type="date" value={formData.end_date} onChange={(v) => setFormData({ ...formData, end_date: v })} />
            <FormField label="Priority" type="select" value={formData.priority} onChange={(v) => setFormData({ ...formData, priority: v })} options={['Critical', 'High', 'Normal', 'Low']} />
            <FormField label="Resources / Assigned To" value={formData.resource_names} onChange={(v) => setFormData({ ...formData, resource_names: v })} />
            <FormField
              label="Parent Task"
              type="select"
              value={formData.parent_task_id || ""}
              onChange={(v) => setFormData({ ...formData, parent_task_id: v || null })}
              options={(existingTasks || []).map(t => ({ value: t.id, label: `${t.wbs_code ? t.wbs_code + " \u2014 " : ""}${t.task_name}` }))}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <Button onClick={onClose} variant="outline" style={{ flex: 1 }} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSaving || !formData.task_name || !formData.start_date || !formData.end_date} style={{ flex: 1, background: 'var(--accent)', color: 'white', opacity: isSaving ? 0.6 : 1 }}>
            {isSaving ? 'Creating...' : 'Create Task →'}
          </Button>
        </div>
      </div>
    </>
  );
}

function FormField({ label, type = 'text', value, onChange, options = [] }) {
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
          <option value="">—</option>
          {options.map(opt => {
            const isObj = typeof opt === 'object';
            return <option key={isObj ? opt.value : opt} value={isObj ? opt.value : opt}>{isObj ? opt.label : opt}</option>;
          })}
        </select>
      ) : (
        <input
          type={type}
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
        />
      )}
    </div>
  );
}