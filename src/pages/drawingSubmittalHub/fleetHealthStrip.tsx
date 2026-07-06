import type { ComponentType } from "react";
import { Dialog as DialogRaw, DialogContent as DialogContentRaw, DialogHeader as DialogHeaderRaw, DialogTitle as DialogTitleRaw } from "@/components/ui/dialog";
import { useFlag } from "@/hooks/useFeatureFlag";
import {
  border,
  error,
  mono,
  success,
  surface1,
  textMuted,
  textPrimary,
  warning,
} from "./format";

// These shared screens are still .jsx; cast at the boundary (removable
// once they are typed).
type AnyProps = Record<string, any>;
const Dialog = DialogRaw as unknown as ComponentType<AnyProps>;
const DialogContent = DialogContentRaw as unknown as ComponentType<AnyProps>;
const DialogHeader = DialogHeaderRaw as unknown as ComponentType<AnyProps>;
const DialogTitle = DialogTitleRaw as unknown as ComponentType<AnyProps>;
// ── Drawing health (slice 2 of the Hub Command Center) ─────────────────────
export function HealthBreakdownDialog({ health, onClose }: { health: any; onClose: () => void }) {
  // SP4: portaled Radix dialog. Under command_ui, tag `.detailing-cc` (light
  // token-alias) and swap the hardcoded dark `--bg-base` to the alias-remapped
  // `--bg-surface`. Flag off → byte-identical dark dialog.
  const commandUi = useFlag("command_ui");
  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className={commandUi ? "detailing-cc" : undefined} style={{ maxWidth: 460, background: commandUi ? "var(--bg-surface)" : "var(--bg-base, #0D1117)", border: `1px solid ${border}` }}>
        <DialogHeader>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: health.band.color, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 700, color: textPrimary }}>{health.setName}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: health.band.color }}>{health.grade}</span>
              <span className="sbd-num" style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: textPrimary }}>{health.score}</span>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "4px 2px 6px" }}>
          <div style={{ fontFamily: mono, fontSize: 9.5, color: textMuted, letterSpacing: "0.08em" }}>
            {health.band.label.toUpperCase()} · STAGE {String(health.stage).toUpperCase()} · {100 - health.score} PTS DEDUCTED
          </div>
          {health.factors.map((f: any) => {
            const pct = f.weight ? Math.round((f.score / f.weight) * 100) : 100;
            const col = f.deduction <= 0 ? success : f.severity === "critical" ? error : f.severity === "high" ? warning : "#D29922";
            return (
              <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>{f.label}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: mono, fontSize: 10, color: f.deduction > 0 ? col : textMuted }}>
                    {f.deduction > 0 ? `−${f.deduction}` : "ok"} <span style={{ color: textMuted }}>/ {f.weight}</span>
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "var(--bg-surface, rgba(255,255,255,0.06))", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: col, transition: "width 0.2s ease" }} />
                </div>
                <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4 }}>{f.detail}</div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
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
