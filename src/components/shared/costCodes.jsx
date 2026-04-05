export const COST_CODES = [
  { code: '01', name: 'Detailing',                  category: 'Subcontractor' },
  { code: '02', name: 'Anchor Bolts/Embeds',         category: 'Materials'     },
  { code: '03', name: 'Joist',                       category: 'Materials'     },
  { code: '04', name: 'Deck',                        category: 'Materials'     },
  { code: '05', name: 'Raw Material',                category: 'Materials'     },
  { code: '06', name: 'Shop Labor and Fabrication',  category: 'Labor'         },
  { code: '07', name: 'Field Labor - Structural',    category: 'Labor'         },
  { code: '08', name: 'Field Labor - Misc.',         category: 'Labor'         },
  { code: '09', name: 'Equipment',                   category: 'Equipment'     },
  { code: '10', name: 'Shipping',                    category: 'Labor'         },
  { code: '11', name: 'Deck Install',                category: 'Subcontractor' },
  { code: '12', name: 'Special Coatings',            category: 'Misc.'         },
  { code: '13', name: 'Misc.',                       category: 'Misc.'         },
  { code: '14', name: 'PM/Admin',                    category: 'Overhead'      },
];

// Category display order and colors
export const CATEGORY_ORDER = ['Labor', 'Materials', 'Subcontractor', 'Equipment', 'Misc.', 'Overhead'];

export const CATEGORY_COLORS = {
  Labor:         'var(--status-warning)',
  Materials:     'var(--status-info)',
  Subcontractor: '#8B5CF6',
  Equipment:     'var(--nc-accent-orange)',
  'Misc.':       'var(--text-muted)',
  Overhead:      'var(--status-success)',
};

// Grouped by category in display order
export const COST_CODES_GROUPED = CATEGORY_ORDER.map(category => ({
  category,
  color: CATEGORY_COLORS[category],
  codes: COST_CODES.filter(c => c.category === category),
}));

// Format: "01 — Detailing"
export const formatCostCode = (code, name) => `${code} — ${name}`;

// Given a stored code string, return "01 — Detailing"
export const getCostCodeLabel = (code) => {
  const match = COST_CODES.find(c => c.code === code);
  return match ? formatCostCode(match.code, match.name) : (code || '—');
};

// Given a stored code string, return the name
export const getCostCodeName = (code) => {
  const match = COST_CODES.find(c => c.code === code);
  return match?.name || '';
};

// Backwards-compat alias used in older components
export const getCostCodeDescription = getCostCodeName;