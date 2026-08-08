import type { UserPreferences, WorkspacePreset } from "@/lib/userPreferences/schema";
import { PERSONALIZATION_PRESETS, PRESET_OWNED_KEYS } from "@/lib/userPreferences/presets";

type PresetId = Exclude<WorkspacePreset, "custom">;

export function PresetChangeSummary({
  presetId,
  current,
  next,
  onApply,
  onCancel,
  isSaving,
}: {
  presetId: PresetId;
  current: UserPreferences;
  next: UserPreferences;
  onApply: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const preset = PERSONALIZATION_PRESETS[presetId];
  const labels: Partial<Record<keyof UserPreferences, string>> = {
    default_landing: "Start page",
    pinned_modules: "Navigation favorites",
    dashboard_density: "Dashboard density",
    table_density: "Table density",
    visible_kpis: "Visible KPIs",
    kpi_order: "KPI order",
  };
  const changes = [...PRESET_OWNED_KEYS]
    .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(next[key]))
    .map((key) => {
      const value = next[key];
      return `${labels[key] ?? key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`;
    });
  return (
    <div style={{ padding: 14, border: "1px solid var(--accent-border)", background: "var(--accent-muted)", borderRadius: 8, marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Review changes before applying</div>
      <ul style={{ margin: "0 0 0 16px", padding: 0, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        {changes.length > 0 ? changes.map((change) => <li key={change}>{change}</li>) : <li>No preference changes are needed.</li>}
      </ul>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" onClick={onApply} disabled={isSaving} style={{ border: 0, borderRadius: 6, background: "var(--accent)", color: "var(--on-accent)", padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>
          Apply {preset.label} preset
        </button>
        <button type="button" onClick={onCancel} style={{ border: "1px solid var(--border-default)", borderRadius: 6, background: "var(--bg-surface)", color: "var(--text-secondary)", padding: "8px 12px", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
