import { useState } from "react";
import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from "@/lib/userPreferences/schema";
import {
  buildPreferenceResetPatch,
  type PreferenceResetSection,
} from "@/lib/userPreferences/resetSections";

const RESET_PHRASE = "RESET MY SETTINGS";

const SECTION_LABELS: Record<PreferenceResetSection, string> = {
  appearance: "Appearance & formats",
  workspace: "Workspace & favorites",
  dashboard: "Dashboard",
  notifications: "Notifications",
};

export function PreferenceResetPanel({
  onResetAll,
  onResetSection,
  isSaving,
}: {
  onResetAll: (preferences: UserPreferences) => void;
  onResetSection: (patch: Partial<UserPreferences>) => void;
  isSaving: boolean;
}) {
  const [confirmation, setConfirmation] = useState("");
  return (
    <section style={{ padding: 16, border: "1px solid var(--danger-border, var(--border-default))", borderRadius: 8, background: "var(--danger-muted, var(--bg-surface-low))" }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text-primary)" }}>Reset one section</h3>
      <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>Restore one group without changing your other personal choices.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {(Object.entries(SECTION_LABELS) as Array<[PreferenceResetSection, string]>).map(([section, label]) => (
          <button key={section} type="button" disabled={isSaving} onClick={() => onResetSection(buildPreferenceResetPatch(section))} style={{ padding: "7px 10px", border: "1px solid var(--border-default)", borderRadius: 6, background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 11, cursor: isSaving ? "not-allowed" : "pointer" }}>
            Reset {label}
          </button>
        ))}
      </div>
      <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text-primary)" }}>Reset all personal settings</h3>
      <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>This restores appearance, workspace, dashboard, format, and alert preferences. It does not change projects, permissions, or account security.</p>
      <label htmlFor="reset-personal-settings" style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 5 }}>RESET CONFIRMATION — TYPE {RESET_PHRASE}</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input id="reset-personal-settings" aria-label="Reset confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} style={{ flex: "1 1 230px", padding: "8px 10px", border: "1px solid var(--border-default)", borderRadius: 6, background: "var(--bg-input)", color: "var(--text-primary)" }} />
        <button type="button" disabled={isSaving || confirmation !== RESET_PHRASE} onClick={() => { onResetAll({ ...DEFAULT_USER_PREFERENCES }); setConfirmation(""); }} style={{ padding: "8px 12px", border: 0, borderRadius: 6, background: "var(--status-error)", color: "var(--on-accent)", fontWeight: 700, opacity: confirmation === RESET_PHRASE ? 1 : 0.5, cursor: confirmation === RESET_PHRASE ? "pointer" : "not-allowed" }}>
          Reset all personal settings
        </button>
      </div>
    </section>
  );
}
