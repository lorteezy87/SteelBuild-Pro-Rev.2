import type { Insert } from "@/api/supabaseClient";

export type BudgetHourPresetRow = Omit<
  Insert<"budget_hour_items">,
  "project_id"
>;

export interface PresetDefinition {
  id: string;
  label: string;
  description: string;
  build: () => BudgetHourPresetRow[];
}

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
] as const;

function makeRow({
  category,
  scope_item,
  sort_order,
  is_specialty = false,
}: Pick<
  BudgetHourPresetRow,
  "category" | "scope_item" | "sort_order" | "is_specialty"
>): BudgetHourPresetRow {
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
    description:
      "Twelve canonical scope-item rows from the kickoff sheet — fill in budgeted hours after the row is created.",
    build: () =>
      ESTIMATING_KICKOFF_STANDARD_12.map((scope_item, index) =>
        makeRow({
          category: "Standard",
          scope_item,
          sort_order: (index + 1) * 10,
          is_specialty: false,
        }),
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
} satisfies Record<string, PresetDefinition>;

export const PRESET_LIST: PresetDefinition[] = Object.values(PRESETS);
