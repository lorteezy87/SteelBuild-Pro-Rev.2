import React, { useState } from 'react';
import { getDaysBetween } from './scheduleUtils';

const TASK_TYPE_COLORS = {
  Fabrication: 'var(--accent)',
  Delivery: '#00B8D9',
  Install: '#00D68F',
  Submittal: '#8B5CF6',
  RFI: '#FFB400',
  Milestone: '#FFB400',
  Task: 'rgba(160,175,210,0.5)',
};

export default function CalendarView({ tasks = [], onSelectTask, onAddTask, selectedDate, onSelectDate }) {
  const [currentDate, setCurrentDate] = useState(new Date(selectedDate || new Date()));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Create calendar grid
  const calendarDays = [];
  // Previous month
  for (let i = firstDay - 1; i >= 0; i--) {
    calendarDays.push({
      date: new Date(year, month - 1, daysInPrevMonth - i),
      isCurrentMonth: false,
    });
  }
  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push({
      date: new Date(year, month, i),
      isCurrentMonth: true,
    });
  }
  // Next month
  const remainingDays = 42 - calendarDays.length;
  for (let i = 1; i <= remainingDays; i++) {
    calendarDays.push({
      date: new Date(year, month + 1, i),
      isCurrentMonth: false,
    });
  }

  const today = new Date();
  const isToday = (date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const isWeekend = (date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  // Get tasks for a specific date
  const getTasksForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return tasks.filter(t => {
      const start = new Date(t.start_date);
      const end = new Date(t.end_date);
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d >= start && d <= end;
    });
  };

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--bg-surface-low)', padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button
          onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            color: 'var(--accent)',
            padding: 0,
          }}
        >
          ◀
        </button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
          {monthName}
        </span>
        <button
          onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            color: 'var(--accent)',
            padding: 0,
          }}
        >
          ▶
        </button>
        <button
          onClick={() => setCurrentDate(new Date())}
          style={{
            marginLeft: 'auto',
            background: 'var(--warning-muted)',
            border: '1px solid rgba(245,158,11,0.30)',
            borderRadius: 6,
            padding: '6px 12px',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--accent)',
            cursor: 'pointer',
          }}
        >
          Today
        </button>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
          <div
            key={day}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: '8px 0',
              fontWeight: 600,
              letterSpacing: '0.12em',
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, flex: 1, minHeight: 0 }}>
        {calendarDays.map((day, idx) => {
          const dayTasks = getTasksForDate(day.date);
          const cellIsToday = isToday(day.date);
          const cellIsWeekend = isWeekend(day.date);
          const dateStr = day.date.toISOString().split('T')[0];

          return (
            <div
              key={idx}
              onClick={() => onSelectDate(day.date)}
              style={{
                background: cellIsToday ? 'var(--warning-muted)' : cellIsWeekend ? 'rgba(255,255,255,0.01)' : 'transparent',
                border: cellIsToday ? '1px solid rgba(245,158,11,0.30)' : '1px solid rgba(255,255,255,0.05)',
                borderRadius: 8,
                padding: 8,
                minHeight: 100,
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!cellIsToday) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = cellIsToday ? 'var(--warning-muted)' : cellIsWeekend ? 'rgba(255,255,255,0.01)' : 'transparent';
              }}
            >
              {/* Day number */}
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: day.isCurrentMonth ? 'var(--text-muted)' : 'rgba(160,175,210,0.25)',
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  background: cellIsToday ? 'var(--accent)' : 'transparent',
                  borderRadius: cellIsToday ? '50%' : '0',
                  color: cellIsToday ? 'white' : 'var(--text-muted)',
                }}
              >
                {day.date.getDate()}
              </div>

              {/* Task chips */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                {dayTasks.slice(0, 3).map((task, i) => {
                  const color = TASK_TYPE_COLORS[task.task_type] || TASK_TYPE_COLORS.Task;
                  const isMultiDay = getDaysBetween(task.start_date, task.end_date) > 1;
                  const taskStart = new Date(task.start_date).toISOString().split('T')[0];
                  const taskEnd = new Date(task.end_date).toISOString().split('T')[0];
                  const isFirstDay = taskStart === dateStr;

                  return (
                    <div
                      key={task.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTask(task);
                      }}
                      style={{
                        background: `${color}` + (isMultiDay ? 'CC' : 'DD'),
                        borderRadius: isMultiDay ? (isFirstDay ? '4px 0 0 4px' : '0') : '4px',
                        padding: '2px 6px',
                        fontFamily: 'var(--font-body)',
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'white',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        cursor: 'pointer',
                        display: isFirstDay || !isMultiDay ? 'block' : 'block',
                      }}
                    >
                      {isFirstDay || !isMultiDay ? task.task_name : ''}
                    </div>
                  );
                })}
                {dayTasks.length > 3 && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDate(day.date);
                    }}
                    style={{
                      background: 'rgba(160,175,210,0.25)',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontFamily: 'var(--font-body)',
                      fontSize: 9,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    +{dayTasks.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}