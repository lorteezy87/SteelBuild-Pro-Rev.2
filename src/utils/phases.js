export const PHASES = [
  'Pre-Construction',
  'Detailing',
  'Procurement',
  'Fabrication',
  'Delivery',
  'Installation',
  'Closeout',
];

export const PHASE_ORDER = {
  'Pre-Construction': 0,
  'Detailing':        1,
  'Procurement':      2,
  'Fabrication':      3,
  'Delivery':         4,
  'Installation':     5,
  'Closeout':         6,
};

export const PHASE_COLORS = {
  'Pre-Construction': 'var(--accent)',
  'Detailing':        'var(--phase-detailing)',
  'Procurement':      'var(--secondary)',
  'Fabrication':      'var(--phase-fab)',
  'Delivery':         'var(--warning)',
  'Installation':     'var(--phase-erection)',
  'Closeout':         'var(--phase-closeout)',
};

// Derive phase from task fields when not explicitly set
export function derivePhase(task) {
  if (task.phase) return task.phase;

  const type  = task.steelbuild_record_type || '';
  const title = (task.title || task.task_name || task.activity || '').toLowerCase();

  if (type === 'RFI' || title.startsWith('rfi:')) return 'Detailing';
  if (type === 'WorkPackage') {
    if (title.includes('detail')) return 'Detailing';
    if (title.includes('fab') || title.includes('wp:')) return 'Fabrication';
  }
  if (type === 'Delivery' || title.startsWith('delivery:')) return 'Delivery';
  if (type === 'Constraint') {
    if (title.includes('embed') || title.includes('anchor') || title.includes('submittal')) return 'Pre-Construction';
    if (title.includes('crane') || title.includes('access') || title.includes('install') || title.includes('erect')) return 'Installation';
    return 'Fabrication';
  }

  if (title.includes('bid') || title.includes('permit') || title.includes('contract') || title.includes('proposal') || title.includes('pre-con') || title.includes('precon')) return 'Pre-Construction';
  if (title.includes('detail') || title.includes('drawing') || title.includes('submittal') || title.includes('rfi')) return 'Detailing';
  if (title.includes('procure') || title.includes('po') || title.includes('purchase') || title.includes('material') || title.includes('order') || title.includes('mill')) return 'Procurement';
  if (title.includes('fab') || title.includes('shop') || title.includes('weld') || title.includes('cut') || title.includes('fit-up') || title.includes('paint') || title.includes('galv')) return 'Fabrication';
  if (title.includes('deliver') || title.includes('ship') || title.includes('truck')) return 'Delivery';
  if (title.includes('erect') || title.includes('install') || title.includes('field') || title.includes('bolt') || title.includes('crane') || title.includes('beam') || title.includes('column') || title.includes('deck')) return 'Installation';
  if (title.includes('closeout') || title.includes('punchlist') || title.includes('punch') || title.includes('warranty') || title.includes('final') || title.includes('inspect') || title.includes('close')) return 'Closeout';

  return 'Pre-Construction';
}

// Sort tasks by phase then chronologically within phase
export function sortByPhase(tasks) {
  return [...tasks].sort((a, b) => {
    const pa = PHASE_ORDER[derivePhase(a)] ?? 0;
    const pb = PHASE_ORDER[derivePhase(b)] ?? 0;
    if (pa !== pb) return pa - pb;

    const orderA = Number(a.sort_order);
    const orderB = Number(b.sort_order);
    const hasOrderA = Number.isFinite(orderA);
    const hasOrderB = Number.isFinite(orderB);

    if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB;
    if (hasOrderA && !hasOrderB) return -1;
    if (!hasOrderA && hasOrderB) return 1;

    const dateA = a.end_date
      ? new Date(a.end_date)
      : a.start_date
      ? new Date(a.start_date)
      : new Date('9999-12-31');
    const dateB = b.end_date
      ? new Date(b.end_date)
      : b.start_date
      ? new Date(b.start_date)
      : new Date('9999-12-31');

    if (dateA - dateB !== 0) return dateA - dateB;

    const prioOrder = { Critical: 0, High: 1, Normal: 2, medium: 2, Low: 3, low: 3 };
    return (prioOrder[a.priority] ?? 2) - (prioOrder[b.priority] ?? 2);
  });
}

// Group sorted tasks by phase
export function groupByPhase(tasks) {
  const sorted = sortByPhase(tasks);
  const groups = {};
  for (const phase of PHASES) {
    groups[phase] = sorted.filter(t => derivePhase(t) === phase);
  }
  return groups;
}
