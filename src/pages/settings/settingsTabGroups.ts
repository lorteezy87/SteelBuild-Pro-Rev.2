/** Settings tab group registry (personal / setup / admin). */
export const TAB_GROUPS = [
  {
    id: 'personal',
    label: 'My Settings',
    tabs: [
      { id: 'profile',       label: 'Profile',       icon: '\u{1F464}', desc: 'Your account information' },
      { id: 'display',       label: 'Display',       icon: '\u{1F3A8}', desc: 'Theme, accent, accessibility, locale' },
      { id: 'dashboard',     label: 'Dashboard',     icon: '\u{1F4CA}', desc: 'Pinned modules, KPI order, default project' },
      { id: 'notifications', label: 'Notifications', icon: '\u{1F514}', desc: 'Alerts, digests, and quiet hours' },
      { id: 'shortcuts',     label: 'Shortcuts',     icon: '⌨',    desc: 'Keyboard reference card' },
    ],
  },
  {
    id: 'setup-help',
    label: 'Setup & Help',
    tabs: [
      { id: 'setup', label: 'Setup & Admin', icon: '🧩', desc: 'Onboarding, data exchange, integrations, users, feature flags, help' },
    ],
  },
  {
    id: 'admin',
    label: 'Workspace',
    adminOnly: true,
    tabs: [
      { id: 'roles',      label: 'Roles',      icon: '\u{1F451}', desc: 'Permissions and access', adminOnly: true },
      { id: 'costcodes',  label: 'Cost Codes', icon: '\u{1F4B0}', desc: 'Default budget codes for new projects', adminOnly: true },
      { id: 'system',     label: 'System',     icon: '\u2699',    desc: 'Data and app management', adminOnly: true },
    ],
  },
];

