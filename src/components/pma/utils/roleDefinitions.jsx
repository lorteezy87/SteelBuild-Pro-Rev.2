export const ROLES = [
  {
    id: 'pm',
    label: 'PM',
    full: 'Project Manager',
    focus: 'actions, blockers, RFIs, schedule, next steps',
  },
  {
    id: 'super',
    label: 'SUPER',
    full: 'Superintendent',
    focus: 'sequence, field constraints, crew, equipment, daily ops',
  },
  {
    id: 'exec',
    label: 'EXEC',
    full: 'Executive',
    focus: 'cost exposure, trend, risk summary, milestones',
  },
  {
    id: 'procurement',
    label: 'PROC',
    full: 'Procurement',
    focus: 'lead times, release dates, vendor status, POs',
  },
  {
    id: 'detailer',
    label: 'DETAIL',
    full: 'Detailer',
    focus: 'drawing status, revisions, RFI impact on details',
  },
  {
    id: 'estimator',
    label: 'EST',
    full: 'Estimator',
    focus: 'budget, cost codes, variances, scope changes',
  },
];

export const getRoleInstruction = (role) => {
  if (!role) return '';
  const roleData = ROLES.find(r => r.id === role);
  if (!roleData) return '';
  
  return `You are responding to a ${roleData.full}. Tailor your response to their priorities: ${roleData.focus}.
For this role:
${
  role === 'pm'
    ? '- Lead with action items and blockers'
    : role === 'super'
    ? '- Lead with sequence and constraints'
    : role === 'exec'
    ? '- Lead with numbers and exposure'
    : role === 'procurement'
    ? '- Lead with dates and vendor status'
    : role === 'detailer'
    ? '- Lead with drawing impacts'
    : role === 'estimator'
    ? '- Lead with cost and scope changes'
    : ''
}
Adjust depth and language accordingly.`;
};

export const getSelectedRole = () => {
  try {
    return localStorage.getItem('pma_selected_role') || 'pm';
  } catch {
    return 'pm';
  }
};

export const setSelectedRole = (roleId) => {
  try {
    localStorage.setItem('pma_selected_role', roleId);
  } catch {
    console.warn('Could not persist role selection');
  }
};