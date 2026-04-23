import React from 'react';
import { formatDateShort, calculateTaskDuration } from './scheduleUtils';

const TASK_TYPE_COLORS = {
  Fabrication: 'var(--accent)',
  Delivery: '#00B8D9',
  Install: 'var(--status-success-bright)',
  Submittal: '#0D9488',
  RFI: 'var(--status-warning-bright)',
  Milestone: 'var(--status-warning-bright)',
  Task: 'rgba(160,175,210,0.5)',
};

export default function GanttTaskList({ tasks = [], onSelectTask, selectedTaskId, onTaskDoubleClick, expandedIds, onToggleExpand }) {
  if (!tasks || tasks.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: 12 }}>
        No tasks found
      </div>
    );
  }

  const getRowLevel = (task) => {
    let level = 0;
    let parentId = task.parent_task_id;
    while (parentId) {
      const parent = tasks.find(t => t.id === parentId);
      if (!parent) break;
      level++;
      parentId = parent.parent_task_id;
    }
    return level;
  };

  const hasChildren = (taskId) => tasks.some(t => t.parent_task_id === taskId);
  const isExpanded = (taskId) => expandedIds.includes(taskId);

  const filteredTasks = tasks.filter(t => {
    let parentId = t.parent_task_id;
    while (parentId) {
      if (!isExpanded(parentId)) return false;
      const parent = tasks.find(p => p.id === parentId);
      if (!parent) break;
      parentId = parent.parent_task_id;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface-low)', borderRight: '1px solid var(--border-default)' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 86px 86px 44px 44px 80px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-sidebar)', padding: '0 12px', height: 28, alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.10em', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>WBS</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.10em', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Task Name</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.10em', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Start</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.10em', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>End</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.10em', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Dur</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.10em', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>%</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.10em', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Status</div>
      </div>

      {/* Task Rows */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {filteredTasks.map((task, idx) => {
          const level = getRowLevel(task);
          const hasChild = hasChildren(task.id);
          const isExp = isExpanded(task.id);
          const duration = calculateTaskDuration(task.start_date, task.end_date);
          const isSelected = selectedTaskId === task.id;

          return (
            <div
              key={task.id}
              onClick={() => onSelectTask(task)}
              onDoubleClick={() => onTaskDoubleClick(task)}
              style={{
                display: 'grid',
                gridTemplateColumns: '48px 1fr 86px 86px 44px 44px 80px',
                borderBottom: '1px solid var(--divider)',
                background: isSelected ? 'var(--accent-muted)' : idx % 2 === 0 ? 'transparent' : 'var(--hover-bg)',
                padding: '0 12px',
                height: 34,
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.background = 'var(--hover-bg)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'var(--hover-bg)';
              }}
            >
              {/* WBS */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {task.wbs_code || '—'}
              </div>

              {/* Task Name with indent */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                {hasChild && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpand(task.id);
                    }}
                    style={{
                      width: 20,
                      height: 20,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: 12,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isExp ? '▼' : '▶'}
                  </button>
                )}
                {task.is_milestone && (
                  <span style={{ fontSize: 12, color: 'var(--status-warning-bright)', marginRight: 4 }}>◆</span>
                )}
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    fontWeight: level === 0 ? 600 : 400,
                    color: 'var(--text-primary)',
                    paddingLeft: level > 0 ? level * 16 : 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.task_name}
                </span>
              </div>

              {/* Start Date */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                {formatDateShort(task.start_date)}
              </div>

              {/* End Date */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                {formatDateShort(task.end_date)}
              </div>

              {/* Duration */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                {duration}d
              </div>

              {/* Percent */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                {task.percent_complete || 0}%
              </div>

              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span
                  style={{
                    background: task.status === 'Complete' ? 'var(--success-muted)' : task.status === 'In Progress' ? 'var(--accent-muted)' : 'var(--bg-surface-high)',
                    color: task.status === 'Complete' ? 'var(--status-success)' : task.status === 'In Progress' ? 'var(--accent)' : 'var(--text-muted)',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    fontWeight: 600,
                  }}
                >
                  {task.status === 'Not Started' ? 'Pending' : task.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}