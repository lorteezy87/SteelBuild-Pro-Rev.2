/**
 * ReviewDelayCard — the approval delay log for one project.
 *
 * Shows each review round measured against the project's contract review
 * period (`detailing_lead_days.approval`), the 7 / 14 / 21-day escalation
 * step, a per-reviewer roll-up, and a CSV export a PM can attach to a delay
 * notice. All math lives in src/lib/reviewDelayLedger.ts; this is presentation.
 *
 * Rounds the ledger cannot measure (no sent date, no return date) are counted
 * separately as "Unmeasured" — never folded in as on-time.
 */
import { Fragment, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { toast } from "sonner";
import { Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
import { formatShortDate } from "@/utils/dates";
import { presentGeneratedFile } from "@/lib/native/fileExport";
import {
  DELAY_TIER_LABEL,
  buildDelayLedgerCsv,
  buildReviewDelayLedger,
  unknownReasonLabel,
} from "@/lib/reviewDelayLedger";
import type { DayBasis, DelayTier, LedgerRound, LedgerSubmittal } from "@/lib/reviewDelayLedger";

type LeadBag = { detailing_lead_days?: Record<string, unknown> } | null | undefined;

export interface ReviewDelayCardProps {
  submittals: readonly LedgerSubmittal[];
  roundsBySubmittal: Record<string, readonly LedgerRound[]>;
  today: string;
  projectMeta?: LeadBag;
  /** Matches the hub's working-day setting so due dates agree with the rest of the page. */
  basis?: DayBasis;
  projectLabel?: string;
  isLoading?: boolean;
}

const TIER_TONE: Record<DelayTier, PillTone> = {
  on_time: "good",
  follow_up: "info",
  reviewer_escalation: "warn",
  executive_escalation: "danger",
  delay_notice: "danger",
};

const SHORT_TIER: Record<DelayTier, string> = {
  on_time: "On time",
  follow_up: "Follow up",
  reviewer_escalation: "7+ days",
  executive_escalation: "14+ days",
  delay_notice: "21+ · notice",
};

const LIST_LIMIT = 12;

export default function ReviewDelayCard({
  submittals,
  roundsBySubmittal,
  today,
  projectMeta,
  basis = "working",
  projectLabel = "",
  isLoading = false,
}: ReviewDelayCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [showUnknown, setShowUnknown] = useState(false);

  const ledger = useMemo(() => {
    const rounds: LedgerRound[] = [];
    for (const list of Object.values(roundsBySubmittal || {})) rounds.push(...list);
    return buildReviewDelayLedger({ submittals, rounds, today, projectMeta, basis });
  }, [submittals, roundsBySubmittal, today, projectMeta, basis]);

  const unit = basis === "working" ? "working days" : "calendar days";
  const late = ledger.entries.filter((e) => (e.daysOver ?? 0) > 0);
  const shown = showAll ? late : late.slice(0, LIST_LIMIT);
  const unknown = ledger.entries.filter((e) => e.unknown);

  const exportCsv = async () => {
    const csv = buildDelayLedgerCsv(ledger, projectLabel);
    const slug = (projectLabel || "project").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "project";
    try {
      await presentGeneratedFile({
        blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
        filename: `approval-delay-log-${slug}-${today}.csv`,
        title: "Approval delay log",
      });
    } catch {
      toast.error("Couldn't export the delay log. Try again.");
    }
  };

  return (
    <div className="sbd-card" style={card} data-testid="review-delay-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={eyebrow}>Approval Delay Log</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
            Review period {ledger.allowanceDays} {unit} from sent · escalate at 7 / 14 / 21 days over
          </div>
        </div>
        <button
          type="button"
          className="cmd-btn cmd-btn--ghost"
          onClick={exportCsv}
          disabled={isLoading || ledger.entries.length === 0}
        >
          Export CSV
        </button>
      </div>

      {isLoading ? (
        <Empty>Loading review rounds…</Empty>
      ) : ledger.entries.length === 0 ? (
        <Empty>No submitted review rounds yet.</Empty>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8, marginBottom: 16 }}>
            <Stat label="Late rounds" value={ledger.summary.late} tone={ledger.summary.late ? "var(--status-warning)" : "var(--text-primary)"} />
            <Stat label="Out & late" value={ledger.summary.openLate} tone={ledger.summary.openLate ? "var(--status-error)" : "var(--text-primary)"} />
            <Stat label="Days over" value={ledger.summary.totalDaysOver} tone="var(--accent)" />
            <Stat label="Notice due" value={ledger.summary.noticeDue} tone={ledger.summary.noticeDue ? "var(--status-error)" : "var(--text-primary)"} />
            <Stat label="Unmeasured" value={ledger.summary.unknown} tone="var(--text-muted)" />
          </div>

          {ledger.reviewers.length > 0 && (
            <>
              <div style={sectionLabel}>By reviewer</div>
              <div style={{ overflowX: "auto", marginBottom: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(90px,1fr) repeat(5, 64px)", gap: "4px 10px", fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 430 }}>
                  <Hdr>Reviewer</Hdr>
                  <Hdr right>Rounds</Hdr>
                  <Hdr right>Late</Hdr>
                  <Hdr right>Out late</Hdr>
                  <Hdr right>Days over</Hdr>
                  <Hdr right>Avg held</Hdr>
                  {ledger.reviewers.map((r) => (
                    <Fragment key={r.reviewer}>
                      <div style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.reviewer}>{r.reviewer}</div>
                      <Cell>{r.rounds}</Cell>
                      <Cell>{r.late}</Cell>
                      <Cell danger={r.openLate > 0}>{r.openLate}</Cell>
                      <Cell>{r.totalDaysOver}</Cell>
                      <Cell>{r.avgDaysHeldClosed == null ? "—" : r.avgDaysHeldClosed}</Cell>
                    </Fragment>
                  ))}
                </div>
              </div>
            </>
          )}

          <div style={sectionLabel}>Rounds past the review period</div>
          {late.length === 0 ? (
            <Empty>Every measured round came back within the review period.</Empty>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 480 }}>
                <thead>
                  <tr>
                    {["Submittal", "Rd", "Reviewer", "Sent", "Due", "Back", "Over", ""].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e) => (
                    <tr key={`${e.submittalId}-${e.roundNumber}-${e.source}`}>
                      <td style={td} title={e.title}>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{e.submittalNumber}</span>
                      </td>
                      <td style={tdMono}>{e.roundNumber}</td>
                      <td style={td}>{e.reviewer}</td>
                      <td style={tdMono}>{formatShortDate(e.sentDate)}</td>
                      <td style={tdMono}>{formatShortDate(e.dueDate)}</td>
                      <td style={tdMono}>{e.open ? <span style={{ color: "var(--status-error)" }}>Still out</span> : formatShortDate(e.returnedDate)}</td>
                      <td style={{ ...tdMono, fontWeight: 700 }}>{e.daysOver}</td>
                      <td style={td}>
                        {e.tier && (
                          <span title={DELAY_TIER_LABEL[e.tier]}>
                            <Pill tone={TIER_TONE[e.tier]}>{SHORT_TIER[e.tier]}</Pill>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {late.length > LIST_LIMIT && (
                <button type="button" className="cmd-btn cmd-btn--ghost" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show fewer" : `Show all ${late.length}`}
                </button>
              )}
            </div>
          )}

          {unknown.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => setShowUnknown((v) => !v)} aria-expanded={showUnknown}>
                {showUnknown ? "Hide" : "Show"} {unknown.length} unmeasured round{unknown.length === 1 ? "" : "s"}
              </button>
              {showUnknown && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 11, color: "var(--text-muted)" }}>
                  {unknown.map((e) => (
                    <li key={`u-${e.submittalId}-${e.roundNumber}-${e.source}`}>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{e.submittalNumber}</span> round {e.roundNumber}: {e.unknown ? unknownReasonLabel(e.unknown) : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "16px 18px",
  marginBottom: 16,
  minWidth: 0,
};

const eyebrow: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "var(--text-muted)",
  marginBottom: 2,
};

const sectionLabel: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
};

const th: CSSProperties = {
  ...sectionLabel,
  textAlign: "left",
  padding: "4px 6px",
  borderBottom: "1px solid var(--border-default)",
  marginBottom: 0,
  whiteSpace: "nowrap",
};

const td: CSSProperties = {
  padding: "5px 6px",
  borderBottom: "1px solid var(--border-subtle, var(--border-default))",
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
};

const tdMono: CSSProperties = { ...td, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "8px 10px" }}>
      <div style={{ ...sectionLabel, marginBottom: 4 }}>{label}</div>
      <div className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function Hdr({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return <div style={{ ...sectionLabel, marginBottom: 0, textAlign: right ? "right" : "left" }}>{children}</div>;
}

function Cell({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return (
    <div style={{ textAlign: "right", color: danger ? "var(--status-error)" : "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>{children}</div>;
}
