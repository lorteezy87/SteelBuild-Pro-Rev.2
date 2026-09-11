import { useEffect, useId } from "react";
import type { RefObject } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  border,
  error,
  mono,
  success,
  surface1,
  surface2,
  textMuted,
  textPrimary,
  warning,
} from "./format";

// ── Drawing health (slice 2 of the Hub Command Center) ─────────────────────
/**
 * One set's health breakdown, opened from a Health chip in the Drawing
 * Register's Sets & revisions view.
 *
 * A plain role="dialog" overlay, not Radix Dialog (CLAUDE.md: never use Radix
 * Dialog), on the same pattern as LeadTimesModal. Escape and a scrim click
 * close it. useFocusTrap keeps Tab inside and hands focus back to the chip
 * that opened it.
 */
export function HealthBreakdownDialog({ health, onClose }: { health: any; onClose: () => void }) {
  const titleId = useId();
  const trapRef = useFocusTrap(true) as RefObject<HTMLDivElement>;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="presentation"
      // Only a click on the scrim itself closes. Clicks inside the panel have
      // the panel as their target, so the dialog needs no handler of its own.
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        // Same scrim as LeadTimesModal.
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="detailing-cc"
        style={{
          width: "min(460px, 100%)", maxHeight: "85vh", overflowY: "auto",
          // Opaque panel per the dark-theme modal rule (see LeadTimesModal).
          background: "var(--bg-surface-secondary)",
          border: `1px solid ${border}`, borderRadius: 12,
          boxShadow: "var(--shadow-card)", padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: health.band.color, flexShrink: 0 }} />
          <h2 id={titleId} style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 700, color: textPrimary }}>
            {health.setName}
          </h2>
          <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: health.band.color }}>{health.grade}</span>
          <span className="sbd-num" style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: textPrimary }}>{health.score}</span>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label="Close health breakdown"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: 4, marginLeft: 2, borderRadius: 6, cursor: "pointer",
              background: "transparent", border: "none", color: textMuted,
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "4px 2px 6px" }}>
          <div style={{ fontFamily: mono, fontSize: 9.5, color: textMuted, letterSpacing: "0.08em" }}>
            {health.band.label.toUpperCase()} · STAGE {String(health.stage).toUpperCase()} · {100 - health.score} PTS DEDUCTED
          </div>
          {health.factors.map((f: any) => {
            const pct = f.weight ? Math.round((f.score / f.weight) * 100) : 100;
            const col = f.deduction <= 0
              ? success
              : f.severity === "critical" ? error : f.severity === "high" ? warning : "var(--cmd-warn-text)";
            return (
              <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>{f.label}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: mono, fontSize: 10, color: f.deduction > 0 ? col : textMuted }}>
                    {f.deduction > 0 ? `−${f.deduction}` : "ok"} <span style={{ color: textMuted }}>/ {f.weight}</span>
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: surface2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: col, transition: "width 0.2s ease" }} />
                </div>
                <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4 }}>{f.detail}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Control Board "fleet health" rollup — average score, band distribution, and
 *  the sets that need attention (click → Drawing Register). */
export function FleetHealthStrip({ fleet, onOpenRegister }: { fleet: any; onOpenRegister?: () => void }) {
  if (!fleet || !fleet.count) return null;
  const bands: Array<[string, string, number]> = [
    ["Excellent", "#2EA043", fleet.byBand.excellent],
    ["Good", "#7DBE3C", fleet.byBand.good],
    ["At Risk", "#D29922", fleet.byBand.at_risk],
    ["Critical", "#F85149", fleet.byBand.critical],
  ];
  const worst = (fleet.worst || []).filter((s: any) => s.score < 75).slice(0, 3);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "12px 14px", marginBottom: 12, borderRadius: 10, border: `1px solid ${border}`, background: surface1 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted }}>Fleet Health</span>
        <span className="sbd-num" style={{ fontFamily: mono, fontSize: 22, fontWeight: 800, color: textPrimary }}>{fleet.averageScore}<span style={{ fontSize: 12, color: textMuted, fontWeight: 600 }}> avg</span></span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {bands.filter(([, , n]) => n > 0).map(([label, color, n]) => (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, color: textMuted }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />{n} {label.toUpperCase()}
          </span>
        ))}
      </div>
      <span style={{ flex: 1 }} />
      {worst.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: textMuted }}>Needs attention</span>
          {worst.map((s: any) => (
            <button key={s.setId || s.setName} type="button" onClick={onOpenRegister} title={`${s.setName} — ${s.band.label}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 999, cursor: "pointer", background: `color-mix(in srgb, ${s.band.color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${s.band.color} 40%, transparent)` }}>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 800, color: s.band.color }}>{s.grade} {s.score}</span>
              <span style={{ fontSize: 11, color: textPrimary, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.setName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
