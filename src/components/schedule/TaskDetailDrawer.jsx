import React, { useState, useEffect } from 'react';
import { calculateTaskDuration } from './scheduleUtils';
import { PHASES } from '../../utils/phases';

export default function TaskDetailDrawer({ task, open, onClose, onUpdate, allTasks = [], onDelete }) {
  const [formData, setFormData] = useState(task || {});
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    setFormData(task || {});
  }, [task]);

  if (!open || !task) return null;

  const handleSave = () => {
    if (onUpdate) onUpdate({ ...formData, id: task.id });
  };

  const duration = calculateTaskDuration(formData.start_date, formData.end_date);

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
          borderLeft: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 4 }}>
              {formData.task_type}
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
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'var(--bg-sidebar)' }}>
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
              </div>

              {/* Right column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <FormField label="Start Date" type="date" value={formData.start_date} onChange={(v) => setFormData({ ...formData, start_date: v })} />
                <FormField label="End Date" type="date" value={formData.end_date} onChange={(v) => setFormData({ ...formData, end_date: v })} />
                <FormField label="Duration (days)" type="number" value={duration} readOnly={true} />
                <FormField label="% Complete" type="slider" value={formData.percent_complete || 0} onChange={(v) => setFormData({ ...formData, percent_complete: v })} />
                <FormField label="WBS Code" value={formData.wbs_code} onChange={(v) => setFormData({ ...formData, wbs_code: v })} />
              </div>
            </div>
          )}

          {activeTab === 'dependencies' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Predecessors</div>
                {formData.predecessor_ids ? (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {formData.predecessor_ids}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)' }}>None</div>
                )}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Successors</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)' }}>None</div>
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
                background: 'var(--bg-sidebar)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 8,
                padding: 12,
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text-primary)',
                resize: 'none',
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
        <div style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
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
            background: 'var(--bg-sidebar)',
            border: '1px solid rgba(255,255,255,0.10)',
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
            background: 'var(--bg-sidebar)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 6,
            padding: '6px 8px',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--text-primary)',
            }}
            />
      ) : type === 'slider' ? (
        <input
          type="range"
          min="0"
          max="100"
          value={value || 0}
          onChange={(e) => onChange(parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          style={{
            width: '100%',
            background: readOnly ? 'rgba(255,255,255,0.03)' : 'var(--bg-sidebar)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 6,
            padding: '6px 8px',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--text-primary)',
          }}
        />
      )}
    </div>
  );
}