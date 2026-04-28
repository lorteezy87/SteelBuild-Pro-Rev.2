/**
 * Budget-hour presets — canonical scope-item lists for the Budget
 * Hours page. Mirrors the S&H Estimating Kickoff sheet so a new
 * project can start tracking budget vs actual without retyping the
 * 12-row category list every time.
 *
 * Each preset returns rows shaped for the budget_hour_items table:
 *   { category, scope_item, sort_order, is_specialty, shop_hours_budget,
 *     field_hours_budget, shop_hours_actual, field_hours_actual }
 *
 * Hours start at 0 — the user fills them in. Categories stay
 * grouped on the page via `category` ('Standard' / 'Specialty' /
 * 'Misses').
 */

export const ESTIMATING_KICKOFF_STANDARD_12 = [
  "Embeds/Anchor Bolts",
  "Columns",
  "Beams",
  "Joists",
  "Bridging",
  "Ledger",
  "Deck-Support Embeds/Plates",
  "Roof Frames/Mechanical Frames",
  "Lintels",
  "Moment Frame Bracing",
  "Stairs and Rail",
  "Site Steel",
];

/**
 * Build a row payload for a fresh, empty preset row. Project id is
 * applied at the call site so this stays a pure function.
 */
function makeRow({ category, scope_item, sort_order, is_specialty = false }) {
  return {
    category,
    scope_item,
    sort_order,
    is_specialty,
    shop_hours_budget: 0,
    shop_hours_actual: 0,
    field_hours_budget: 0,
    field_hours_actual: 0,
    notes: null,
    metadata: {},
  };
}

export const PRESETS = {
  ESTIMATING_KICKOFF_12: {
    id: "ESTIMATING_KICKOFF_12",
    label: "Estimating Kickoff (Standard 12)",
    description: "Twelve canonical scope-item rows from the kickoff sheet — fill in budgeted hours after the row is created.",
    build: () =>
      ESTIMATING_KICKOFF_STANDARD_12.map((scope_item, idx) =>
        makeRow({
          category: "Standard",
          scope_item,
          sort_order: (idx + 1) * 10,
          is_specialty: false,
        })
      ),
  },
  EMPTY: {
    id: "EMPTY",
    label: "Empty",
    description: "Just one blank row — add scope items as you go.",
    build: () => [
      makeRow({
        category: "Standard",
        scope_item: "New Scope Item",
        sort_order: 10,
      }),
    ],
  },
};

export const PRESET_LIST = Object.values(PRESETS);
