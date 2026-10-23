/**
 * BoardReportShell — the masthead and body frame every Document Control
 * screen shares.
 *
 * A dark band that states the situation in one sentence and five headline
 * metrics, then a light working body: log on the left, detail pane on the
 * right.
 *
 * THE COMPANY NAME IS NOT A LITERAL.
 * Every screen in the design comps shows a hardcoded fabricator name in the
 * masthead. It is not reproduced. CLAUDE.md records the owner's 2026-09-21
 * decision that the company in question "has no part in the creation,
 * distribution or marketing of this product" and that "no vocabulary,
 * class-membership set, default, menu option or generated document may name
 * it" — the same rule that took a hardcoded sender off the transmittal PDF in
 * #455. The wordmark reads the signed-in organization, and when there is no
 * org in context it renders nothing at all rather than guessing a name.
 */

import type { CSSProperties, ReactNode } from "react";
import { useOptionalOrg } from "@/components/shared/OrgContext";

/**
 * OrgContext is still plain JS, so `useOptionalOrg()` has no useful inferred
 * type here. This is the one place that shape is asserted; everything else
 * reads the name through `useOrgName`.
 */
interface OrgContextShape {
  currentOrg?: { name?: string | null } | null;
}

/** The signed-in organization's name, or null when there is no org in context. */
export function useOrgName(): string | null {
  const ctx = useOptionalOrg() as OrgContextShape | undefined;
  const name = ctx?.currentOrg?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}
import { DC_FONT, DC_LIGHT, DC_MASTHEAD, DC_SIGNAL, DC_DARK } from "./boardReportTheme";

export const BOARD_REPORT_TABS = ["Brief", "Register", "Submittals", "RFIs", "Transmittals"] as const;
export type BoardReportTab = (typeof BOARD_REPORT_TABS)[number];

export interface Metric {
  /** The headline figure, already formatted. */
  value: string;
  /** A smaller trailing unit, e.g. the "d" in "13.4 d". */
  unit?: string;
  label: ReactNode;
  /** Signal color for the figure. Omit for the default foreground. */
  tone?: string;
}

interface ShellProps {
  tab: BoardReportTab;
  onTabChange: (tab: BoardReportTab) => void;
  /** The one-sentence situation. Pass a fragment to highlight a phrase. */
  sentence: ReactNode;
  metrics: Metric[];
  /** Right-hand control: a job picker, a week label, a CTA. */
  mastheadRight?: ReactNode;
  /** The Brief runs a larger sentence and larger figures than the working screens. */
  emphasis?: boolean;
  dark?: boolean;
  children: ReactNode;
}

function Wordmark() {
  const name = useOrgName();

  return (
    <>
      {name ? (
        <>
          <span
            style={{
              font: `700 15px/1 ${DC_FONT.ui}`,
              fontStretch: "85%",
              letterSpacing: ".04em",
              textTransform: "uppercase",
            }}
          >
            {name}
          </span>
          <span style={{ width: 1, height: 14, background: DC_MASTHEAD.divider }} />
        </>
      ) : null}
      <span style={{ font: `400 14px/1 ${DC_FONT.ui}`, color: DC_MASTHEAD.muted }}>Document Control</span>
    </>
  );
}

export function BoardReportShell({
  tab,
  onTabChange,
  sentence,
  metrics,
  mastheadRight,
  emphasis = false,
  dark = false,
  children,
}: ShellProps) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  const figureSize = emphasis ? 46 : 40;

  return (
    <div style={{ fontFamily: DC_FONT.ui, color: skin.text, background: skin.pageBg, minHeight: "100%" }}>
      <div
        style={{
          background: DC_MASTHEAD.bg,
          color: DC_MASTHEAD.fg,
          padding: emphasis ? "28px 44px 34px" : "28px 44px 30px",
          display: "flex",
          flexDirection: "column",
          gap: emphasis ? 30 : 26,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Wordmark />
          <nav
            style={{
              marginLeft: 36,
              display: "flex",
              gap: 22,
              font: `500 13px/1 ${DC_FONT.ui}`,
              color: DC_MASTHEAD.muted,
            }}
          >
            {BOARD_REPORT_TABS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onTabChange(name)}
                aria-current={name === tab ? "page" : undefined}
                style={{
                  appearance: "none",
                  background: "none",
                  border: 0,
                  padding: 0,
                  font: "inherit",
                  cursor: "pointer",
                  color: name === tab ? DC_MASTHEAD.fg : DC_MASTHEAD.muted,
                }}
              >
                {name}
              </button>
            ))}
          </nav>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>{mastheadRight}</div>
        </div>

        <p
          style={{
            margin: 0,
            maxWidth: 1060,
            font: `400 ${emphasis ? 38 : 32}px/${emphasis ? 1.18 : 1.2} ${DC_FONT.ui}`,
            fontStretch: "92%",
            letterSpacing: "-0.01em",
            textWrap: "pretty",
          }}
        >
          {sentence}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${metrics.length}, minmax(0,1fr))` }}>
          {metrics.map((m, i) => (
            <div
              key={typeof m.label === "string" ? m.label : i}
              style={{
                padding: i === 0 ? "0 24px 0 0" : i === metrics.length - 1 ? "0 0 0 24px" : "0 24px",
                borderLeft: i === 0 ? undefined : `1px solid ${DC_MASTHEAD.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <span style={{ font: `300 ${figureSize}px/1 ${DC_FONT.ui}`, fontStretch: "80%", color: m.tone }}>
                {m.value}
                {m.unit ? <span style={{ fontSize: 20, color: DC_MASTHEAD.muted }}> {m.unit}</span> : null}
              </span>
              <span style={{ font: `400 13px/1.3 ${DC_FONT.ui}`, color: DC_MASTHEAD.muted }}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {children}
    </div>
  );
}

/** The working body: log left, detail pane right, reflowing rather than fixed at 1440. */
export function BoardReportBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      style={{
        padding: wide ? "36px 44px 40px" : "28px 44px 40px",
        display: "grid",
        gridTemplateColumns: wide ? "minmax(0,1.45fr) minmax(0,1fr)" : "minmax(0,1fr) 400px",
        gap: wide ? 48 : 40,
        alignItems: "start",
      }}
    >
      {children}
    </div>
  );
}

/** The right-hand detail card. */
export function DetailPane({ children, gap = 20, dark = false }: { children: ReactNode; gap?: number; dark?: boolean }) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap,
        padding: "22px 24px",
        background: skin.paneBg,
        border: `1px solid ${skin.paneBorder}`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Pane actions.
 *
 * Three shapes, decided by props:
 * - `href`    — a link out to the flow that owns a write this page does not
 *               do itself (the intake desk, the hub, the full RFI page).
 * - `onClick` — an action on this page: edit, delete, record an
 *               acknowledgement. Every one goes through the same write path
 *               the owning page uses; this component only starts it.
 * - neither, or `disabled` — inert and announced as disabled. Used when the
 *               signed-in role may not perform the action, so the control
 *               explains its absence instead of failing on click.
 *
 * `tone="danger"` is for destructive actions; it never takes the primary
 * fill, so a delete is never the most prominent thing in a pane.
 */
export function PaneButton({
  children,
  variant = "primary",
  href,
  onClick,
  disabled = false,
  title,
  tone,
  dark = false,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Tooltip — used to say WHY a control is disabled. */
  title?: string;
  tone?: "danger";
  dark?: boolean;
}) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  const base: CSSProperties = {
    padding: "9px 14px",
    borderRadius: 6,
    font: `${variant === "primary" && tone !== "danger" ? 600 : 500} 13px/1 ${DC_FONT.ui}`,
    display: "inline-flex",
    alignItems: "center",
    textDecoration: "none",
  };
  const look: CSSProperties =
    tone === "danger"
      ? {
          background: "transparent",
          // The light red text would sink into the dark pane; the masthead's late tone carries on dark.
          color: dark ? DC_SIGNAL.metricLate : DC_SIGNAL.redText,
          border: `1px solid ${skin.btnSecondaryBorder}`,
        }
      : variant === "primary"
        ? { background: skin.btnPrimaryBg, color: skin.btnPrimaryFg, border: `1px solid ${skin.btnPrimaryBg}` }
        : { background: "transparent", color: skin.text, border: `1px solid ${skin.btnSecondaryBorder}` };

  if (href && !disabled) {
    return (
      <a href={href} title={title} style={{ ...base, ...look, cursor: "pointer" }}>
        {children}
      </a>
    );
  }
  const inert = disabled || !onClick;
  return (
    <button
      type="button"
      disabled={inert}
      title={title}
      onClick={inert ? undefined : onClick}
      style={{ ...base, ...look, cursor: inert ? "not-allowed" : "pointer", opacity: inert ? 0.55 : 1 }}
    >
      {children}
    </button>
  );
}

/**
 * The masthead's primary call to action — the design's orange "New …" button.
 * Rendered only when the signed-in role may create the record, so a viewer
 * never sees an offer the database will refuse.
 */
export function MastheadAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: "none",
        background: DC_SIGNAL.accent,
        color: DC_SIGNAL.onAccent,
        border: 0,
        borderRadius: 6,
        padding: "8px 14px",
        font: `600 13px/1 ${DC_FONT.ui}`,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/** Status badge — IBM Plex Mono 600 10px, square. */
export function StatusBadge({
  label,
  style,
}: {
  label: string;
  style: { bg: string; fg: string; border: string };
}) {
  return (
    <span
      style={{
        justifySelf: "start",
        font: `600 10px/1 ${DC_FONT.mono}`,
        padding: "4px 6px",
        background: style.bg,
        color: style.fg,
        border: style.border,
      }}
    >
      {label}
    </span>
  );
}

/** Filter chips. Static in the design; these drive real queries. */
export function FilterChips({
  chips,
  active,
  onPick,
  dark = false,
}: {
  chips: string[];
  active: string;
  onPick: (chip: string) => void;
  dark?: boolean;
}) {
  return (
    <>
      {chips.map((label) => {
        const on = label === active;
        const skin = dark ? DC_DARK : DC_LIGHT;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onPick(label)}
            aria-pressed={on}
            style={{
              padding: "7px 11px",
              borderRadius: 6,
              font: `500 12px/1 ${DC_FONT.ui}`,
              cursor: "pointer",
              background: on ? skin.chipActiveBg : skin.chipIdleBg,
              color: on ? skin.chipActiveFg : skin.chipIdleFg,
              border: `1px solid ${on ? skin.chipActiveBg : skin.chipIdleBorder}`,
            }}
          >
            {label}
          </button>
        );
      })}
    </>
  );
}

/** A log table's header row. `columns` is the grid template the rows repeat. */
export function LogHeader({ columns, labels, dark = false }: { columns: string; labels: ReactNode[]; dark?: boolean }) {
  const skin = dark ? DC_DARK : DC_LIGHT;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gap: 12,
        padding: "10px 12px",
        borderBottom: `1px solid ${skin.headerRule}`,
        font: `500 11px/1 ${DC_FONT.ui}`,
        color: skin.textMuted,
      }}
    >
      {labels.map((l, i) => (
        <span key={i} style={{ textAlign: typeof l === "string" && l === "Sheets" ? "right" : undefined }}>
          {l}
        </span>
      ))}
    </div>
  );
}

export const DC_ACCENT = DC_SIGNAL.accent;
