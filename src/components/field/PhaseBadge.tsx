/**
 * PhaseBadge — renders a field activity's lifecycle phase.
 *
 * A phase that was *inferred* from the record's text (rather than read off a
 * column) is drawn hollow and italic, and says so on hover. Field records
 * drive fabrication releases and closeout sign-off, so a keyword guess must
 * never render identically to something a superintendent actually entered.
 */
import { PHASE_COLORS } from "@/utils/phases";
import { PHASE_SOURCE } from "@/lib/field/fieldPhase";

const TITLES: Record<string, string> = {
  [PHASE_SOURCE.STORED]: "Phase set on this record",
  [PHASE_SOURCE.LINKED]: "Phase of the schedule tasks this log is linked to",
  [PHASE_SOURCE.DERIVED]: "Inferred from this record's description — not set on the record",
};

export interface PhaseBadgeProps {
  phase: string | null;
  /** One of PHASE_SOURCE. */
  source: string;
}

export default function PhaseBadge({ phase, source }: PhaseBadgeProps) {
  if (!phase) return <span className="cmd-row__meta">—</span>;

  const color = PHASE_COLORS[phase as keyof typeof PHASE_COLORS] ?? "var(--text-muted)";
  const isDerived = source === PHASE_SOURCE.DERIVED;

  return (
    <span
      title={TITLES[source] ?? phase}
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 2,
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        color,
        background: isDerived ? "transparent" : `color-mix(in srgb, ${color} 16%, transparent)`,
        border: `1px solid ${isDerived ? `color-mix(in srgb, ${color} 45%, transparent)` : "transparent"}`,
        opacity: isDerived ? 0.75 : 1,
        fontStyle: isDerived ? "italic" : "normal",
      }}
    >
      {phase}
    </span>
  );
}
