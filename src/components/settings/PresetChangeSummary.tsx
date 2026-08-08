import type { UserPreferences, WorkspacePreset } from "@/lib/userPreferences/schema";
import { PERSONALIZATION_PRESETS } from "@/lib/userPreferences/presets";

type PresetId = Exclude<WorkspacePreset, "custom">;

export function PresetChangeSummary({
  presetId,
  next,
  onApply,
  onCancel,
  isSaving,
}: {
  presetId: PresetId;
  next: UserPreferences;
  onApply: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const preset = PERSONALIZATION_PRESETS[presetId];
  return (
    <div style={{ padding: 14, border: "1px solid var(--accent-border)", background: "var(--accent-muted)", borderRadius: 8, marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Review changes before applying</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        Start page: <strong>{next.default_landing}</strong> · Density: <strong>{next.table_density}</strong> · Favorites: <strong>{next.pinned_modules.join(", ")}</strong>
      </div>
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
