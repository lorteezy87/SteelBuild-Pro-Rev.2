import type { UserPreferences, WorkspacePreset } from "./schema";
import { sanitizeUserPreferences } from "./schema";

type PresetId = Exclude<WorkspacePreset, "custom">;
type PresetDefinition = Pick<UserPreferences,
  "default_landing" | "pinned_modules" | "dashboard_density" | "table_density" | "visible_kpis"
> & { label: string; description: string };

export const PERSONALIZATION_PRESETS: Record<PresetId, PresetDefinition> = {
  project_manager: {
    label: "Project Manager",
    description: "Approvals, coordination, schedule, and downstream blockers.",
    default_landing: "Dashboard",
    pinned_modules: ["Projects", "Drawings", "Submittals", "RFIs", "Schedule"],
    dashboard_density: "normal",
    table_density: "normal",
    visible_kpis: ["open_rfis", "open_submittals", "rfis_blocking_fab", "overdue_items", "work_packages", "deliveries"],
  },
  field: {
    label: "Field",
    description: "Today's work, deliveries, safety, and punchlist execution.",
    default_landing: "FieldToday",
    pinned_modules: ["FieldToday", "Deliveries", "Punchlist", "Safety", "DailyLogs"],
    dashboard_density: "comfortable",
    table_density: "comfortable",
    visible_kpis: ["deliveries", "work_packages", "overdue_items", "open_rfis"],
  },
  fabrication: {
    label: "Fabrication",
    description: "Piece control, fab releases, production, and logistics.",
    default_landing: "PieceRegister",
    pinned_modules: ["PieceRegister", "Fabrication", "ProductionStatus", "Deliveries", "Drawings"],
    dashboard_density: "compact",
    table_density: "compact",
    visible_kpis: ["work_packages", "deliveries", "rfis_blocking_fab", "open_submittals", "overdue_items"],
  },
  executive: {
    label: "Executive",
    description: "Portfolio health, commercial exposure, and top risks.",
    default_landing: "Dashboard",
    pinned_modules: ["Projects", "Reports", "Financials", "ChangeOrders", "Risks"],
    dashboard_density: "comfortable",
    table_density: "normal",
    visible_kpis: ["contract_value", "pending_cos", "expenses", "overdue_items", "open_rfis"],
  },
};

export function applyPersonalizationPreset(
  current: UserPreferences,
  presetId: PresetId,
): UserPreferences {
  const preset = PERSONALIZATION_PRESETS[presetId];
  return sanitizeUserPreferences({
    ...current,
    workspace_preset: presetId,
    default_landing: preset.default_landing,
    pinned_modules: preset.pinned_modules,
    dashboard_density: preset.dashboard_density,
    table_density: preset.table_density,
    visible_kpis: preset.visible_kpis,
    kpi_order: [
      ...preset.visible_kpis,
      ...current.kpi_order.filter((id) => !preset.visible_kpis.includes(id)),
    ],
  });
}
