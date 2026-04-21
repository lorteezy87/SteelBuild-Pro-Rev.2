import React, { useState } from 'react';
import { calculateTaskDuration, formatDateShort } from './scheduleUtils';

const TASK_TYPE_COLORS = {
  Fabrication: 'var(--accent)',
  Delivery: '#00B8D9',
  Install: 'var(--status-success-bright)',
  Submittal: '#8B5CF6',
  RFI: 'var(--status-warning-bright)',
  Milestone: 'var(--status-warning-bright)',
  Task: 'rgba(160,175,210,0.5)',
};

function getGroups(tasks, groupBy, sortBy = 'start_date', sortAsc = true) {
  const groups = {};

  tasks.forEach(task => {
    let key;
    if (groupBy === 'phase') key = task.phase || 'Other';
    else if (groupBy === 'type') key = task.task_type || 'Other';
    else if (groupBy === 'status') key = task.status || 'Other';
    else key = 'All';

    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
  });

  Object.keys(groups).forEach(key => {
    groups[key].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  });

  return groups;
}

export default function ListView({ tasks = [], onSelectTask, groupBy = 'phase', onTaskUpdate }) {
  const [editingPct, setEditingPct] = useState(null); // { taskId, value }
  const [sortBy, setSortBy] = useState('start_date');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(Object.keys(getGroups(tasks, groupBy))));

  const PHASE_ORDER = ['Detailing', 'Fabrication', 'Delivery', 'Erection', 'Closeout'];

  const groups = getGroups(tasks, groupBy, sortBy, sortAsc);
  const groupKeys = Object.keys(groups).sort((a, b) => {
    if (groupBy === 'phase') {
      const ai = PHASE_ORDER.indexOf(a);
      const bi = PHASE_ORDER.indexOf(b);
      const ai2 = ai === -1 ? 999 : ai;
      const bi2 = bi === -1 ? 999 : bi;
      return ai2 - bi2;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const toggleGroup = (groupKey) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(groupKey)) newSet.delete(groupKey);
    else newSet.add(groupKey);
    setExpandedGroups(newSet);
  };

  const totalTasks = tasks.length;
  const avgCompletion = tasks.length > 0 ? Math.round(tasks.reduce((s, t) => s + (t.percent_complete || 0), 0) / tasks.length) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface-low)' }}>
      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', fontSize: 12 }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '48px 1fr 80px 86px 86px 44px 44px 80px',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-sidebar)',
          borderBottom: '1px solid var(--border-default)',
          padding: '0 12px',
          height: 28,
          alignItems: 'center',
          zIndex: 10,
        }}>
          {['WBS', 'Task Name', 'Type', 'Start', 'End', 'Dur', '%', 'Status'].map(col => (
            <div
              key={col}
              onClick={() => {
                if (col !== 'WBS') {
                  const newSort = col.toLowerCase().replace(/\s/g, '_');
                  if (sortBy === newSort) setSortAsc(!sortAsc);
                  else setSortBy(newSort);
                }
              }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                letterSpacing: '0.10em',
                color: 'var(--text-muted)',
                fontWeight: 600,
                textTransform: 'uppercase',
                cursor: col !== 'WBS' ? 'pointer' : 'default',
              }}
            >
              {col} {sortBy === col.toLowerCase().replace(/\s/g, '_') && (sortAsc ? '▲' : '▼')}
            </div>
          ))}
        </div>

        {/* Groups */}
        {groupKeys.map(groupKey => {
          const groupTasks = groups[groupKey];
          const isExpanded = expandedGroups.has(groupKey);

          return (
            <div key={groupKey}>
              {/* Group header */}
              <div
                onClick={() => toggleGroup(groupKey)}
                style={{
                  background: 'var(--accent-muted)',
                  borderLeft: '3px solid var(--accent)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  height: 32,
                  padding: '0 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                <span>{isExpanded ? '▼' : '▶'}</span>
                {groupKey}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                  {groupTasks.length}
                </span>
              </div>

              {/* Group tasks */}
              {isExpanded && groupTasks.map((task, idx) => {
                const duration = calculateTaskDuration(task.start_date, task.end_date);
                return (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '48px 1fr 80px 86px 86px 44px 44px 80px',
                      borderBottom: '1px solid var(--divider)',
                      background: idx % 2 === 0 ? 'transparent' : 'var(--hover-bg)',
                      padding: '0 12px',
                      height: 34,
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'var(--hover-bg)')}
                  >
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                      {task.wbs_code || '—'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      {task.is_milestone && <span style={{ color: 'var(--status-warning-bright)' }}>◆</span>}
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.task_name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ background: `${TASK_TYPE_COLORS[task.task_type] || TASK_TYPE_COLORS.Task}40`, color: TASK_TYPE_COLORS[task.task_type] || TASK_TYPE_COLORS.Task, borderRadius: 4, padding: '2px 6px', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600 }}>
                        {task.task_type}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)' }}>
                      {formatDateShort(task.start_date)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)' }}>
                      {formatDateShort(task.end_date)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)' }}>
                      {duration}d
                    </div>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (task.linked_entity_type && task.linked_entity_type !== 'none') return; // read-only for mapped tasks
                        setEditingPct({ taskId: task.id, value: task.percent_complete || 0 });
                      }}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', cursor: (!task.linked_entity_type || task.linked_entity_type === 'none') ? 'text' : 'default' }}
                    >
                      {editingPct?.taskId === task.id ? (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          autoFocus
                          value={editingPct.value}
                          onChange={(e) => { const val = e.target?.value; setEditingPct({ taskId: task.id, value: parseInt(val) || 0 }); }}
                          onBlur={() => {
                            if (onTaskUpdate) onTaskUpdate({ id: task.id, percent_complete: editingPct.value });
                            setEditingPct(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.target.blur();
                            if (e.key === 'Escape') setEditingPct(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: 38, padding: '1px 3px', fontFamily: 'var(--font-mono)', fontSize: 9, textAlign: 'center', background: 'var(--bg-sidebar)', border: '1px solid var(--accent)', borderRadius: 3, color: 'var(--accent)' }}
                        />
                      ) : (
                        <span title={(!task.linked_entity_type || task.linked_entity_type === 'none') ? 'Click to edit' : 'Managed by linked entity'}>
                          {task.percent_complete || 0}%
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ background: task.status === 'Complete' ? 'var(--success-muted)' : task.status === 'In Progress' ? 'var(--accent-muted)' : 'var(--bg-surface-high)', color: task.status === 'Complete' ? 'var(--status-success)' : task.status === 'In Progress' ? 'var(--accent)' : 'var(--text-muted)', borderRadius: 4, padding: '2px 6px', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600 }}>
                        {task.status === 'Not Started' ? 'Pending' : task.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr 80px 86px 86px 44px 44px 80px',
        borderTop: '1px solid var(--border-strong)',
        background: 'var(--accent-muted)',
        padding: '8px 12px',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-primary)',
      }}>
        <div />
        <div>TOTAL</div>
        <div />
        <div />
        <div />
        <div />
        <div style={{ textAlign: 'center' }}>{avgCompletion}%</div>
        <div style={{ textAlign: 'center' }}>{totalTasks} tasks</div>
      </div>
    </div>
  );
}