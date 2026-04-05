import React, { useRef, useState } from 'react';
import { getDateRangeForTasks, calculateTaskDuration, getDaysBetween, formatDateShort } from './scheduleUtils';

const TASK_TYPE_COLORS = {
Fabrication: { gradient: 'var(--accent)', solid: 'var(--accent)' },
Delivery: { gradient: 'linear-gradient(90deg, #00B8D9, #0090B8)', solid: '#00B8D9' },
Install: { gradient: 'linear-gradient(90deg, #00D68F, #00A86B)', solid: '#00D68F' },
Submittal: { gradient: 'linear-gradient(90deg, #8B5CF6, #6D40D4)', solid: '#8B5CF6' },
RFI: { gradient: 'linear-gradient(90deg, #FFB400, #FF8C00)', solid: '#FFB400' },
Milestone: { gradient: 'none', solid: '#FFB400' },
Task: { gradient: 'linear-gradient(90deg, rgba(160,175,210,0.4), rgba(130,145,180,0.4))', solid: 'rgba(160,175,210,0.5)' },
};

export default function GanttTimeline({ tasks = [], selectedTaskId, zoomLevel = 'week', expandedIds, filteredTasks = [] }) {
  const scrollContainerRef = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const { minDate, maxDate } = getDateRangeForTasks(tasks);
  
  // Generate date columns
  let columns = [];
  let current = new Date(minDate);
  let pxPerDay = 24; // pixels per day, adjust with zoom

  if (zoomLevel === 'day') {
    pxPerDay = 32;
  } else if (zoomLevel === 'week') {
    pxPerDay = 24;
  } else if (zoomLevel === 'month') {
    pxPerDay = 8;
  }

  while (current <= maxDate) {
    columns.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const timelineWidth = columns.length * pxPerDay;
  const today = new Date();

  // Get visible tasks (respecting parent collapse)
  const visibleTasks = (filteredTasks && filteredTasks.length > 0 ? filteredTasks : tasks).filter(t => {
    let parentId = t.parent_task_id;
    while (parentId) {
      if (!expandedIds.includes(parentId)) return false;
      const parent = tasks.find(p => p.id === parentId);
      if (!parent) break;
      parentId = parent.parent_task_id;
    }
    return true;
  });

  const getTaskBarPosition = (task) => {
    const taskStart = new Date(task.start_date);
    const daysFromStart = getDaysBetween(minDate, taskStart);
    const left = daysFromStart * pxPerDay;
    const duration = calculateTaskDuration(task.start_date, task.end_date);
    const width = Math.max(4, duration * pxPerDay);
    return { left, width };
  };

  const getTodayPosition = () => {
    const daysFromStart = getDaysBetween(minDate, today);
    return daysFromStart * pxPerDay;
  };

  const todayPos = getTodayPosition();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface-low)', overflow: 'hidden' }}>
      {/* Timeline Header */}
      <div style={{ height: 44, borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'var(--bg-sidebar)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', height: '100%' }}>
          {/* Months row */}
          <div style={{ height: 20, display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', width: timelineWidth }}>
            {columns.map((col, i) => {
              const isNewMonth = i === 0 || col.getMonth() !== columns[i - 1].getMonth();
              if (!isNewMonth) return null;
              const daysInMonth = columns.filter(c => c.getMonth() === col.getMonth()).length;
              return (
                <div
                  key={`month-${i}`}
                  style={{
                    width: daysInMonth * pxPerDay,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 8,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    color: 'var(--text-muted)',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {col.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </div>
              );
            })}
          </div>

          {/* Days/Weeks row */}
          <div style={{ height: 24, display: 'flex', width: timelineWidth }}>
            {columns.map((col, i) => {
              const isSunday = col.getDay() === 0;
              const showLabel = zoomLevel === 'day' || (zoomLevel === 'week' && col.getDay() === 1) || (zoomLevel === 'month' && col.getDate() === 1);
              return (
                <div
                  key={`day-${i}`}
                  style={{
                    width: pxPerDay,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    color: isSunday ? 'var(--warning-muted)' : 'var(--text-muted)',
                  }}
                >
                  {showLabel && formatDateShort(col)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Timeline Rows */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
          background: 'var(--bg-surface-low)',
        }}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
        {/* Today indicator */}
        <div
          style={{
            position: 'absolute',
            left: todayPos,
            top: 0,
            bottom: 0,
            width: pxPerDay,
            background: 'rgba(0,229,255,0.06)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: pxPerDay / 2 - 1,
              width: 2,
              height: '100%',
              background: 'var(--accent)',
              boxShadow: '0 0 8px var(--accent-muted)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 2,
              left: pxPerDay / 2 - 16,
              background: 'var(--accent)',
              borderRadius: 3,
              padding: '1px 4px',
              fontFamily: 'var(--font-mono)',
              fontSize: 7,
              color: 'white',
              fontWeight: 700,
              zIndex: 10,
            }}
          >
            TODAY
          </div>
        </div>

        {/* Task Rows */}
        {visibleTasks.map((task, idx) => {
          const { left, width } = getTaskBarPosition(task);
          const colors = TASK_TYPE_COLORS[task.task_type] || TASK_TYPE_COLORS.Task;
          const isSelected = selectedTaskId === task.id;

          return (
            <div
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 34,
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: isSelected ? 'var(--accent-muted)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                position: 'relative',
              }}
            >
              {/* Bar container */}
              <div
                style={{
                  position: 'absolute',
                  left: `${left}px`,
                  width: `${width}px`,
                  height: 18,
                  top: 8,
                  background: task.is_milestone ? 'none' : colors.gradient,
                  borderRadius: 4,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  border: isSelected ? '1px solid var(--accent)' : 'none',
                }}
              >
                {/* Milestone diamond */}
                {task.is_milestone && (
                  <div
                    style={{
                      position: 'absolute',
                      left: left > 0 ? 0 : -6,
                      width: 12,
                      height: 12,
                      background: '#FFB400',
                      border: '2px solid rgba(255,180,0,0.5)',
                      transform: 'rotate(45deg)',
                      marginTop: 4,
                    }}
                  />
                )}

                {/* Progress overlay */}
                {!task.is_milestone && task.percent_complete > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: `${task.percent_complete}%`,
                      background: 'rgba(255,255,255,0.20)',
                      borderRadius: 4,
                    }}
                  />
                )}

                {/* Bar label — inside if wide enough, outside (right) if narrow */}
                {!task.is_milestone && (
                  width > 40 ? (
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 9,
                        fontWeight: 600,
                        color: 'white',
                        padding: '0 6px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        zIndex: 2,
                      }}
                    >
                      {task.task_name}
                    </span>
                  ) : (
                    <span
                      style={{
                        position: 'absolute',
                        left: width + 4,
                        fontFamily: 'var(--font-body)',
                        fontSize: 9,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        zIndex: 2,
                        pointerEvents: 'none',
                      }}
                    >
                      {task.task_name}
                    </span>
                  )
                )}
              </div>

              {/* Delayed indicator */}
              {task.status === 'Delayed' && new Date() > new Date(task.end_date) && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${left + width}px`,
                    width: `${getDaysBetween(task.end_date, new Date().toISOString().split('T')[0]) * pxPerDay}px`,
                    height: 18,
                    top: 8,
                    background: 'repeating-linear-gradient(45deg, #FF3D3D, #FF3D3D 10px, rgba(255,61,61,0.3) 10px, rgba(255,61,61,0.3) 20px)',
                    borderRadius: 4,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}