/**
 * RevisionSummaryCard — the instant, deterministic digest shown right after a
 * revision is uploaded (and re-openable from the set's "revised" badge). Shows
 * what changed and what it threatens; the expensive AI per-sheet diff is the
 * one-click "Run AI deep-dive" (RevisionImpactReportModal), never auto-run.
 *
 * Presentational only — it renders a summary built by lib/revisionSummary.js.
 */
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Boxes, FileWarning, Layers, Sparkles } from "lucide-react";
import { useFlag } from "@/hooks/useFeatureFlag";

const mono = "var(--font-mono)";
const IMPACT_COLOR = { none: "var(--text-muted)", low: "#3FB950", medium: "#D29922", high: "#F85149" };

export default function RevisionSummaryCard({ summary, onClose, onRunDeepDive, onCreateRfi }) {
  // SP4: this Radix dialog portals outside the shell's light island. Under
  // command_ui, tag the content root `.detailing-cc` (inherits the light
  // token-alias) AND swap the hardcoded dark `--bg-base` panel bg to the
  // alias-remapped `--bg-surface` so the card body reads light too. The alias
  // block does NOT remap `--bg-base`, so the class alone wouldn't lighten this
  // one. Flag off → no class, original dark bg → byte-identical.
  const commandUi = useFlag("command_ui");
  if (!summary) return null;
  const impactColor = IMPACT_COLOR[summary.impact?.level] || "var(--text-muted)";
  const empty = (summary.sheetsChanged || 0) === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className={commandUi ? "detailing-cc" : undefined} style={{ maxWidth: 560, background: commandUi ? "var(--bg-surface)" : "var(--bg-base, #0D1117)", border: "1px solid var(--border-default)" }}>
        <DialogHeader>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Sparkles size={16} style={{ color: "var(--accent)" }} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Revision Summary</span>
              <span style={{ fontFamily: mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em" }}>{summary.setName}</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {empty ? (
          <div style={{ padding: "12px 4px", color: "var(--text-muted)", fontSize: 13 }}>
            No material changes detected in this revision.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 2px" }}>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
              <Stat label="Sheets changed" value={summary.sheetsChanged} />
              {summary.highRiskCount > 0 && <Stat label="High-risk" value={summary.highRiskCount} color="#F85149" />}
              <div style={{ flex: 1 }} />
              <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999, background: `color-mix(in srgb, ${impactColor} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${impactColor} 45%, transparent)` }}>
                <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: impactColor }}>{summary.impact?.level} impact</span>
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary, var(--text-muted))", lineHeight: 1.5 }}>{summary.impact?.note}</div>

            {summary.highRisk?.length > 0 && (
              <Section icon={AlertTriangle} title="High-risk changes" tone="#F85149">
                {summary.highRisk.map((h) => <Line key={h.drawingId} left={h.sheetNumber} right={h.reason} tone="#F85149" />)}
              </Section>
            )}

            {summary.likelyRfi?.needed && (
              <Section icon={FileWarning} title="Likely RFI needed" tone="#F0883E">
                <div style={{ fontSize: 12, color: "var(--text-secondary, var(--text-muted))", lineHeight: 1.5 }}>
                  {summary.likelyRfi.reason} — {summary.likelyRfi.sheets.join(", ")}
                </div>
                {onCreateRfi && (
                  <div style={{ marginTop: 4 }}>
                    <button type="button" className="sbd-btn sbd-btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => onCreateRfi(summary)}>
                      <FileWarning size={12} style={{ marginRight: 5 }} /> Create RFI
                    </button>
                  </div>
                )}
              </Section>
            )}

            {summary.affectedWorkPackages?.length > 0 && (
              <Section icon={Boxes} title="Affected work packages">
                <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{summary.affectedWorkPackages.join(", ")}</div>
              </Section>
            )}

            <Section icon={Layers} title="Changed sheets">
              {summary.changedSheets.map((c) => (
                <Line key={c.drawingId} left={`${c.sheetNumber || "Sheet"} · ${c.revisionCode}`} right={c.downstream || "upstream of fab"} />
              ))}
            </Section>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
              <button type="button" className="sbd-btn sbd-btn-primary" onClick={() => onRunDeepDive?.(summary)}>
                <Sparkles size={13} style={{ marginRight: 6 }} /> Run AI deep-dive →
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span className="sbd-num" style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: color || "var(--text-primary)" }}>{value}</span>
      <span style={{ fontFamily: mono, fontSize: 8.5, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function Section({ icon: Icon, title, tone, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--border-default)", paddingBottom: 5 }}>
        {Icon && <Icon size={12} style={{ color: tone || "var(--text-muted)" }} />}
        <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: tone || "var(--text-muted)" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Line({ left, right, tone }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>{left}</span>
      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: mono, fontSize: 10, color: tone || "var(--text-muted)" }}>{right}</span>
    </div>
  );
}
