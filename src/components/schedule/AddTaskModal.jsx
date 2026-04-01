import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PHASES } from '../../utils/phases';

export default function AddTaskModal({ open, onClose, onSubmit, nextTaskNumber, projectName, prefilledDate, allTasks = [] }) {
  const [formData, setFormData] = useState({
    task_name: '',
    task_type: 'Task',
    phase: 'Fabrication',
    start_date: prefilledDate || new Date().toISOString().split('T')[0],
    end_date: prefilledDate || new Date().toISOString().split('T')[0],
    status: 'Not Started',
    priority: 'Normal',
    predecessor_wbs: '',
  });

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      start_date: prefilledDate || new Date().toISOString().split('T')[0],
      end_date: prefilledDate || new Date().toISOString().split('T')[0],
    }));
  }, [prefilledDate, open]);

  const handleSubmit = () => {
    if (formData.task_name && formData.start_date && formData.end_date) {
      onSubmit(formData);
      setFormData({
        task_name: '',
        task_type: 'Task',
        phase: 'Fabrication',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        status: 'Not Started',
        priority: 'Normal',
        predecessor_wbs: '',
      });
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
            <FormField label="Predecessor WBS Codes" value={formData.predecessor_wbs} onChange={(v) => setFormData({ ...formData, predecessor_wbs: v })} placeholder="Comma-separated WBS codes" />
          </div>
        </div>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 16 }}>
          Available predecessor WBS: {allTasks.filter(task => task.wbs_code).slice(0, 12).map(task => task.wbs_code).join(', ') || 'None yet'}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <Button onClick={onClose} variant="outline" style={{ flex: 1 }}>Cancel</Button>
          <Button onClick={handleSubmit} style={{ flex: 1, background: 'var(--accent)', color: 'white' }}>Create Task →</Button>
        </div>
      </div>
    </>
  );
}

function FormField({ label, type = 'text', value, onChange, options = [], placeholder }) {
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
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
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
