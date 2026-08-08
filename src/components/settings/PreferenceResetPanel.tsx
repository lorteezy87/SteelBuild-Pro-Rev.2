import { useState } from "react";
import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from "@/lib/userPreferences/schema";

const RESET_PHRASE = "RESET MY SETTINGS";

export function PreferenceResetPanel({ onReset, isSaving }: { onReset: (preferences: UserPreferences) => void; isSaving: boolean }) {
  const [confirmation, setConfirmation] = useState("");
  return (
    <section style={{ padding: 16, border: "1px solid var(--danger-border, var(--border-default))", borderRadius: 8, background: "var(--danger-muted, var(--bg-surface-low))" }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text-primary)" }}>Reset all personal settings</h3>
      <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>This restores appearance, workspace, dashboard, format, and alert preferences. It does not change projects, permissions, or account security.</p>
      <label htmlFor="reset-personal-settings" style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 5 }}>RESET CONFIRMATION — TYPE {RESET_PHRASE}</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input id="reset-personal-settings" aria-label="Reset confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} style={{ flex: "1 1 230px", padding: "8px 10px", border: "1px solid var(--border-default)", borderRadius: 6, background: "var(--bg-input)", color: "var(--text-primary)" }} />
        <button type="button" disabled={isSaving || confirmation !== RESET_PHRASE} onClick={() => { onReset({ ...DEFAULT_USER_PREFERENCES }); setConfirmation(""); }} style={{ padding: "8px 12px", border: 0, borderRadius: 6, background: "var(--status-error)", color: "var(--on-accent)", fontWeight: 700, opacity: confirmation === RESET_PHRASE ? 1 : 0.5, cursor: confirmation === RESET_PHRASE ? "pointer" : "not-allowed" }}>
          Reset all personal settings
        </button>
      </div>
    </section>
  );
}
