// Schedule utility functions for data mapping and calculations

export function mapWorkPackagesToTasks(workPackages) {
  return workPackages.map((wp, idx) => ({
    id: `wp-${wp.id || idx}`,
    task_number: undefined, // will be auto-assigned on create
    project_id: wp.project_id,
    project_name: wp.project_name,
    task_name: wp.name,
    task_type: wp.phase === 'Erection' ? 'Install' : 'Fabrication',
    phase: wp.phase,
    start_date: wp.released_date || new Date().toISOString().split('T')[0],
    end_date: wp.released_date || new Date().toISOString().split('T')[0],
    duration: 1,
    percent_complete: wp.percent_complete || 0,
    status: wp.status,
    priority: 'Normal',
    linked_entity_type: 'WorkPackage',
    linked_entity_id: wp.id,
    is_milestone: false,
  }));
}

export function mapDeliveriesToTasks(deliveries) {
  return deliveries.map((del) => ({
    id: `del-${del.id || del.delivery_id}`,
    task_number: undefined,
    project_id: del.project_id,
    project_name: del.project_name,
    task_name: del.description || `DEL-${del.delivery_id}`,
    task_type: 'Delivery',
    phase: 'Delivery',
    start_date: del.scheduled_date,
    end_date: del.scheduled_date,
    duration: 1,
    percent_complete: del.status === 'Delivered' ? 100 : 0,
    status: del.status,
    priority: del.priority || 'Normal',
    linked_entity_type: 'Delivery',
    linked_entity_id: del.id,
    is_milestone: true,
  }));
}

export function mapSubmittalsToTasks(drawings) {
  return drawings.map((dwg) => ({
    id: `dwg-${dwg.id || dwg.drawing_id}`,
    task_number: undefined,
    project_id: dwg.project_id,
    project_name: dwg.project_name,
    task_name: `${dwg.sheet_number || ''} ${dwg.title || ''}`.trim(),
    task_type: 'Submittal',
    phase: 'Detailing',
    start_date: dwg.submitted_date || dwg.issue_date || new Date().toISOString().split('T')[0],
    end_date: dwg.due_date || dwg.return_date || new Date().toISOString().split('T')[0],
    duration: dwg.due_date && dwg.submitted_date ? Math.max(1, Math.ceil((new Date(dwg.due_date) - new Date(dwg.submitted_date)) / 86400000)) : 1,
    percent_complete: dwg.stage === 'Released' ? 100 : 0,
    status: dwg.stage || 'Not Started',
    priority: dwg.priority_flag ? 'High' : 'Normal',
    linked_entity_type: 'Submittal',
    linked_entity_id: dwg.id,
    is_milestone: false,
  }));
}

export function calculateTaskDuration(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = end - start;
  return Math.max(1, Math.ceil(diff / 86400000));
}

export function getDateRangeForTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    const today = new Date();
    return {
      minDate: today,
      maxDate: new Date(today.getTime() + 90 * 86400000),
    };
  }
  const dates = tasks
    .flatMap(t => [new Date(t.start_date), new Date(t.end_date)])
    .filter(d => !isNaN(d.getTime()));
  
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
  
  // Pad by 2 weeks on each side
  minDate.setDate(minDate.getDate() - 14);
  maxDate.setDate(maxDate.getDate() + 14);
  
  return { minDate, maxDate };
}

export function getTaskTypeColor(taskType) {
  const colors = {
    Fabrication: { gradient: 'var(--accent)', solid: 'var(--accent)' },
    Delivery: { gradient: 'linear-gradient(90deg, #00B8D9, #0090B8)', solid: '#00B8D9' },
    Install: { gradient: 'linear-gradient(90deg, #00D68F, #00A86B)', solid: '#00D68F' },
    Submittal: { gradient: 'linear-gradient(90deg, #8B5CF6, #6D40D4)', solid: '#8B5CF6' },
    RFI: { gradient: 'linear-gradient(90deg, #FFB400, #FF8C00)', solid: '#FFB400' },
    Milestone: { gradient: 'none', solid: '#FFB400' },
    Task: { gradient: 'linear-gradient(90deg, rgba(160,175,210,0.4), rgba(130,145,180,0.4))', solid: 'rgba(160,175,210,0.5)' },
  };
  return colors[taskType] || colors.Task;
}

export function formatDateShort(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

export function getDaysBetween(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.ceil((e - s) / 86400000);
}

export function isToday(date) {
  const today = new Date();
  const d = new Date(date);
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

export function isWeekend(date) {
  const d = new Date(date);
  const day = d.getDay();
  return day === 0 || day === 6;
}