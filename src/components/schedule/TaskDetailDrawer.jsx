import React, { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { calculateTaskDuration } from './scheduleUtils';
import { PHASES } from '../../utils/phases';

function parseDeps(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default function TaskDetailDrawer({ task, open, onClose, onUpdate, allTasks = [], onDelete }) {
  const [formData, setFormData] = useState(task || {});
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    setFormData(task || {});
  }, [task]);

  if (!open || !task) return null;

  const handleSave = () => {
    if (!onUpdate) return;
    const { id, created_at, updated_at, created_date, updated_date, ...rest } = formData;
    onUpdate({ ...rest, id: task.id });
  };

  const duration = calculateTaskDuration(formData.start_date, formData.end_date);
  const predecessorIds = parseDeps(formData.dependencies);
  const predecessorTasks = allTasks.filter((t) => predecessorIds.includes(t.id));
  const successorTasks = allTasks.filter((t) => parseDeps(t.dependencies).includes(task.id));

  const addPredecessor = (predId) => {
    const current = parseDeps(formData.dependencies);
    if (current.includes(predId)) return;
    const updated = [...current, predId];
    setFormData({ ...formData, dependencies: JSON.stringify(updated) });
  };

  const removePredecessor = (predId) => {
    const current = parseDeps(formData.dependencies);
    const updated = current.filter((id) => id !== predId);
    setFormData({
      ...formData,
      dependencies: updated.length > 0 ? JSON.stringify(updated) : null,
    });
  };

  const availablePreds = allTasks.filter(
    (t) => t.id !== task.id && !predecessorIds.includes(t.id)
  );

  const priorityTone = {
    Critical: 'var(--status-error)',
    High: 'var(--status-warning)',
    Normal: 'var(--accent)',
    Low: 'var(--text-muted)',
  }[formData.priority] || 'var(--text-muted)';

  const statusTone = {
    Complete: 'var(--status-success)',
    'In Progress': 'var(--accent)',
    Delayed: 'var(--status-error)',
    'On Hold': 'var(--status-warning)',
    'Not Started': 'var(--text-muted)',
  }[formData.status] || 'var(--text-muted)';

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.52)',
          zIndex: 998,
        }}
      />

      <div
        className="sbp-opaque-sidebar"
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: 640,
          maxWidth: '92vw',
          background: 'var(--bg-surface-low)',
          borderLeft: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.55)',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '18px 20px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: 'var(--text-muted)',
                letterSpacing: '0.12em',
                marginBottom: 4,
              }}
            >
              {formData.task_type}
              {formData.wbs_code ? ` · ${formData.wbs_code}` : ''}
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                lineHeight: 0.95,
              }}
            >
              {formData.task_name}
            </h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <span style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: statusTone, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
                {formData.status || 'Not Started'}
              </span>
              <span style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: priorityTone, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
                {formData.priority || 'Normal'} Priority
              </span>
              <span style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
                {duration || '0d'} Duration
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {onDelete && (
              <button
                onClick={() => {
                  if (window.confirm('Delete this task?')) onDelete(task.id);
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
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 20,
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            background: 'var(--bg-sidebar)',
          }}
        >
          {['DETAILS', 'DEPENDENCIES', 'NOTES', 'HISTORY'].map((tab) => (
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
                borderBottom:
                  activeTab === tab.toLowerCase()
                    ? '2px solid var(--accent)'
                    : '1px solid transparent',
                cursor: 'pointer',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {activeTab === 'details' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InspectorSection title="Task Setup">
                <FormField
                  label="Task Name"
                  value={formData.task_name}
                  onChange={(v) => setFormData({ ...formData, task_name: v })}
                />
                <FormField
                  label="Task Type"
                  type="select"
                  value={formData.task_type}
                  onChange={(v) => setFormData({ ...formData, task_type: v })}
                  options={['Fabrication', 'Delivery', 'Install', 'Submittal', 'RFI', 'Milestone', 'Task']}
                />
                <FormField
                  label="Phase"
                  type="select"
                  value={formData.phase}
                  onChange={(v) => setFormData({ ...formData, phase: v })}
                  options={PHASES}
                />
                <FormField
                  label="Status"
                  type="select"
                  value={formData.status}
                  onChange={(v) => setFormData({ ...formData, status: v })}
                  options={['Not Started', 'In Progress', 'Complete', 'Delayed', 'On Hold']}
                />
                <FormField
                  label="Priority"
                  type="select"
                  value={formData.priority}
                  onChange={(v) => setFormData({ ...formData, priority: v })}
                  options={['Critical', 'High', 'Normal', 'Low']}
                />
                <FormField
                  label="Assigned To / Resources"
                  value={formData.resource_names || formData.assigned_to || ''}
                  onChange={(v) =>
                    setFormData({ ...formData, resource_names: v, assigned_to: v })
                  }
                />
              </InspectorSection>

              <InspectorSection title="Dates & Progress">
                <FormField
                  label="Start Date"
                  type="date"
                  value={formData.start_date}
                  onChange={(v) => setFormData({ ...formData, start_date: v })}
                />
                <FormField
                  label="End Date"
                  type="date"
                  value={formData.end_date}
                  onChange={(v) => setFormData({ ...formData, end_date: v })}
                />
                <FormField label="Duration (days)" type="number" value={duration} readOnly />
                <FormField
                  label="% Complete"
                  type="slider"
                  value={formData.percent_complete || 0}
                  onChange={(v) => setFormData({ ...formData, percent_complete: v })}
                />
                <FormField
                  label="WBS Code"
                  value={formData.wbs_code || ''}
                  onChange={(v) => setFormData({ ...formData, wbs_code: v })}
                />
              </InspectorSection>
            </div>
          )}

          {activeTab === 'dependencies' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <InspectorSection title={`Predecessors (${predecessorTasks.length})`}>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: 8,
                    display: 'none',
                  }}
                />
                {predecessorTasks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {predecessorTasks.map((pred) => (
                      <div
                        key={pred.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 10px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 6,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color: 'var(--accent)',
                            flexShrink: 0,
                          }}
                        >
                          {pred.wbs_code || '—'}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 11,
                            color: 'var(--text-secondary)',
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {pred.task_name}
                        </span>
                        <button
                          onClick={() => removePredecessor(pred.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--status-error)',
                            cursor: 'pointer',
                            fontSize: 12,
                            padding: 2,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      padding: '8px 0',
                    }}
                  >
                    No predecessors
                  </div>
                )}

                {availablePreds.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (value) addPredecessor(value);
                      }}
                    >
                      <SelectTrigger className="h-8 text-[11px]">
                        <SelectValue placeholder="+ Add predecessor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePreds.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.wbs_code ? `${t.wbs_code} - ` : ''}{t.task_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </InspectorSection>

              <InspectorSection title={`Successors (${successorTasks.length})`}>
                <div
                  style={{
                    display: 'none',
                  }}
                />
                {successorTasks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {successorTasks.map((suc) => (
                      <div
                        key={suc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 10px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 6,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color: 'var(--accent)',
                            flexShrink: 0,
                          }}
                        >
                          {suc.wbs_code || '—'}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 11,
                            color: 'var(--text-secondary)',
                            flex: 1,
                          }}
                        >
                          {suc.task_name}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      padding: '8px 0',
                    }}
                  >
                    No successors
                  </div>
                )}
              </InspectorSection>
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
                boxSizing: 'border-box',
              }}
              placeholder="Add notes..."
            />
          )}

          {activeTab === 'history' && (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '40px 0',
              }}
            >
              No history yet
            </div>
          )}
        </div>

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
  const fieldStyle = {
    width: '100%',
    background: readOnly ? 'rgba(255,255,255,0.03)' : 'var(--bg-sidebar)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 6,
    padding: '6px 8px',
    fontFamily: 'var(--font-body)',
    fontSize: 11,
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
  };

  return (
    <div>
      <label
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          display: 'block',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {type === 'select' ? (
        <Select value={value || ''} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-[11px]">
            <SelectValue placeholder="-" />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : type === 'date' ? (
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={fieldStyle}
        />
      ) : type === 'slider' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min="0"
            max="100"
            value={value || 0}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            style={{ flex: 1 }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              minWidth: 32,
              textAlign: 'right',
            }}
          >
            {value || 0}%
          </span>
        </div>
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          style={fieldStyle}
        />
      )}
    </div>
  );
}

function InspectorSection({ title, children }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 8,
          color: 'var(--text-muted)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
