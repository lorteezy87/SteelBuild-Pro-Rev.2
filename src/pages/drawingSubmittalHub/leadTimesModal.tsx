import { useEffect, useState } from "react";
import { border, mono, textMuted, textPrimary } from "./format";

// ── Lead-times settings modal ───────────────────────────────────────────────
// Edits the per-project backward-schedule lead times (projects.metadata.
// detailing_lead_days). Opaque panel bg per the dark-theme modal rule (a
// translucent --bg-surface/--bg-card would render see-through over the scrim).

const LEAD_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: "detailing",      label: "Detailing duration", hint: "Detailing start → internal review" },
  { key: "internalReview", label: "Internal review",    hint: "Internal review → submit" },
  { key: "approval",       label: "Approval cycle",     hint: "Submit → approval (EOR)" },
  { key: "fabRelease",     label: "Release buffer",     hint: "Approval → fab release" },
  { key: "fab",            label: "Fab + ship",         hint: "Fab release → erection release" },
  { key: "erectionPrep",   label: "Field prep",         hint: "Erection release → erection start" },
];

interface LeadTimesModalProps {
  leadDays: Record<string, number>;
  defaults: Record<string, number>;
  saving: boolean;
  onSave: (leads: Record<string, number>) => void;
  onClose: () => void;
}

export function LeadTimesModal({ leadDays, defaults, saving, onSave, onClose }: LeadTimesModalProps) {
  const [draft, setDraft] = useState<Record<string, number>>(() => ({ ...defaults, ...leadDays }));

  // Escape closes the modal (keyboard accessibility — §25). Guarded by `saving`
  // so a mid-save Escape can't drop the dialog before the mutation settles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const setField = (key: string, value: string) => {
    const n = Math.max(0, Math.round(Number(value) || 0));
    setDraft((d) => ({ ...d, [key]: n }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100%)", maxHeight: "85vh", overflowY: "auto",
          background: "var(--bg-surface-secondary)",
          border: `1px solid ${border}`, borderRadius: 16,
          boxShadow: "var(--shadow-card)", padding: 20,
        }}
      >
        <div style={{ marginBottom: 4, fontFamily: mono, fontSize: 9, color: textMuted, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Detailing Control Center
        </div>
        <h2 style={{ margin: "0 0 6px", color: textPrimary, fontSize: 20 }}>Lead Times</h2>
        <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5 }}>
          Calendar-day gaps used to schedule each package <strong>backward</strong> from its linked
          erection date. Saved as this project&apos;s defaults; an individual package can still
          override them in its metadata.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LEAD_FIELDS.map((f) => (
            <label key={f.key} style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 10, alignItems: "center" }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: textPrimary, fontSize: 13, fontWeight: 700 }}>{f.label}</span>
                <span style={{ display: "block", color: textMuted, fontSize: 11 }}>{f.hint}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, justifySelf: "end" }}>
                <input
                  type="number" min={0} inputMode="numeric"
                  value={draft[f.key] ?? 0}
                  disabled={saving}
                  onChange={(e) => setField(f.key, e.target.value)}
                  style={{
                    width: 56, background: "var(--bg-input, var(--bg-surface-low))",
                    border: `1px solid ${border}`, borderRadius: 8, padding: "6px 8px",
                    color: textPrimary, fontFamily: mono, fontSize: 13, textAlign: "right", outline: "none",
                  }}
                />
                <span style={{ color: textMuted, fontFamily: mono, fontSize: 11 }}>d</span>
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 20 }}>
          <button type="button" className="sbd-btn-ghost" disabled={saving} onClick={() => setDraft({ ...defaults })}>
            Reset to defaults
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="sbd-btn-ghost" disabled={saving} onClick={onClose}>Cancel</button>
            <button type="button" className="sbd-btn-primary" disabled={saving} onClick={() => onSave(draft)}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
