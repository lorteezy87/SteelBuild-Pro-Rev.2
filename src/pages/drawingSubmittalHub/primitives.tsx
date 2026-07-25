// Leaf presentational primitives extracted from ./components (behavior-preserving
// move — bodies are byte-identical). These depend ONLY on react types, the
// ./format tokens/helpers, ./types shapes, and (indirectly, via props) lucide
// icons — never on ./components, to keep the import graph acyclic.
import type { ComponentType, CSSProperties, ReactNode } from "react";
import {
  STATUS_COLORS,
  accent,
  border,
  error,
  getOperationalStateColor,
  info,
  mono,
  success,
  surface2,
  textMuted,
  textPrimary,
  warning,
} from "./format";
import type { DueInfo } from "./types";

type IconType = ComponentType<{ size?: number | string; color?: string }>;

export function SeqMetric({ label, value, tone }: { label: string; value: ReactNode; tone: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
      <div className="sbd-num" style={{ color: tone, fontFamily: mono, fontSize: 15, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export function OperationalStateChip({ state }: { state: string }) {
  const color = getOperationalStateColor(state);
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontFamily: mono,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color,
      background: `color-mix(in srgb, ${color} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 42%, transparent)`,
      whiteSpace: "nowrap",
    }}>
      {state}
    </span>
  );
}

// R&R badge — shown next to displays that do NOT already read "R&R" (since
// 2026-07-25 R&R is a first-class derived stage, so most chips render it
// directly; callers skip this badge when the state chip is itself "R&R").
export function RRChip() {
  const color = "#f59e0b"; // matches "Revise and Resubmit" in format.ts
  return (
    <span
      title="Revise & Resubmit — the review sent this package back; the detailer owns the rework until resubmission (→ OFA)"
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontFamily: mono,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 42%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      R&amp;R
    </span>
  );
}

export function ReadyChip({ ok, label, bad = false, neutral = false }: { ok: boolean; label: string; bad?: boolean; neutral?: boolean }) {
  const color = neutral ? info : bad ? error : ok ? success : textMuted;
  return (
    <span style={{
      fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
      color, padding: "2px 7px", borderRadius: 999,
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
    }}>
      {label}
    </span>
  );
}

export function FlagToggle({ label, active, disabled, onClick }: { label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  const color = active ? warning : textMuted;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={active ? `Clear: ${label}` : `Flag: ${label}`}
      style={{
        fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
        color: active ? "#0b0e14" : color, cursor: disabled ? "default" : "pointer",
        padding: "4px 9px", borderRadius: 8,
        background: active ? warning : `color-mix(in srgb, ${textMuted} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {active ? "● " : "○ "}{label}
    </button>
  );
}

export interface RiskPillProps {
  icon: IconType;
  label: string;
  value: ReactNode;
  color: string;
}

export function RiskPill({ icon: Icon, label, value, color }: RiskPillProps) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 10px",
      borderRadius: 999,
      background: `color-mix(in srgb, ${color} 11%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color,
      fontFamily: mono,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    }}>
      <Icon size={13} />
      <span>{label}</span>
      <span className="sbd-num" style={{ color: textPrimary }}>{value}</span>
    </div>
  );
}

export interface TriageMetricProps {
  icon: IconType;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  color: string;
}

export function TriageMetric({ icon: Icon, label, value, sub, color }: TriageMetricProps) {
  return (
    <div className="sbd-card" style={{ padding: "14px 16px", borderRadius: 14, borderTop: `2px solid ${color}`, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: textMuted, fontWeight: 800 }}>
          {label}
        </div>
        {Icon && <Icon size={15} color={color} />}
      </div>
      <div className="sbd-num" style={{ color, fontFamily: mono, fontSize: 30, lineHeight: 1, fontWeight: 800, marginTop: 10 }}>
        {value}
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 8 }}>{sub}</div>
    </div>
  );
}

export function EscalateIconButton({ icon: Icon, label, title, onClick }: { icon: IconType; label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        minHeight: 30, padding: "4px 8px", borderRadius: 7, cursor: "pointer",
        background: "transparent", border: `1px solid ${border}`,
        color: textMuted, fontFamily: mono, fontSize: 9, fontWeight: 800,
        letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.color = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = border;
        e.currentTarget.style.color = textMuted;
      }}
    >
      <Icon size={11} />
      {label}
    </button>
  );
}

export function PipelineBar({ status, count, total }: { status: string; count: number; total: number }) {
  const color = STATUS_COLORS[status] || accent;
  const pct = total > 0 ? Math.max(4, Math.round((count / total) * 100)) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontFamily: mono, fontSize: 11, color: textPrimary, marginBottom: 5 }}>
        <span>{status}</span>
        <span className="sbd-num">{count}</span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: surface2, overflow: "hidden", border: `1px solid ${border}` }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, boxShadow: `0 0 12px ${color}` }} />
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: 14, color: textMuted, border: `1px dashed ${border}`, borderRadius: 10, fontSize: 13 }}>
      {text}
    </div>
  );
}

// Visible fallback for the lazy upload modals. Replaces fallback={null} so a
// slow or failed chunk load surfaces (the spinner stays up until the chunk
// loads; a stale-chunk 404 is then caught by lazyWithRetry → one reload)
// instead of the button appearing to silently do nothing.
export function ModalLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 10, background: "color-mix(in srgb, #000 55%, transparent)",
        fontFamily: mono, fontSize: 12, color: "#fff", letterSpacing: "0.06em",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 16, height: 16, borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff",
          animation: "sbp-spin 0.7s linear infinite",
        }}
      />
      Loading…
      <style>{"@keyframes sbp-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

export function DueChip({ info: chipInfo, compact = false }: { info: DueInfo; compact?: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      marginTop: compact ? 0 : 6,
      padding: compact ? "3px 7px" : "2px 6px",
      borderRadius: 999,
      fontFamily: mono,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: chipInfo.tone,
      background: `color-mix(in srgb, ${chipInfo.tone} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${chipInfo.tone} 44%, transparent)`,
      whiteSpace: "nowrap",
    }}>
      {chipInfo.label}
    </span>
  );
}

// One grid cell mirroring a <Td>: same padding / typography, alignment-aware.
export function GridCell({ children, align = "left", style = {} }: { children?: ReactNode; align?: "left" | "right"; style?: CSSProperties }) {
  return (
    <div className="sbd-num" style={{
      padding: "8px 12px",
      fontFamily: mono, fontSize: 12,
      color: textPrimary,
      display: "flex", alignItems: "center",
      justifyContent: align === "right" ? "flex-end" : "flex-start",
      minWidth: 0,
      ...style,
    }}>
      {children}
    </div>
  );
}

// Grid header cell — mirrors <Th> typography for the virtualized register.
export function GridHeaderCell({ children, align = "left", style = {} }: { children?: ReactNode; align?: "left" | "right"; style?: CSSProperties }) {
  return (
    <div style={{
      padding: "10px 12px",
      fontFamily: mono, fontSize: 10, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.08em",
      color: textMuted, display: "flex", alignItems: "center",
      justifyContent: align === "right" ? "flex-end" : "flex-start",
      minWidth: 0,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function HealthChip({ health, onClick }: { health: any; onClick?: () => void }) {
  const c = health.band.color;
  const n = health.issues.length;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${health.band.label} · ${n} issue${n === 1 ? "" : "s"} — click for the breakdown`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 999, cursor: "pointer",
        background: `color-mix(in srgb, ${c} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 45%, transparent)`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
      <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 800, color: c }}>{health.grade}</span>
      <span className="sbd-num" style={{ fontFamily: mono, fontSize: 11, color: textPrimary }}>{health.score}</span>
    </button>
  );
}

export function Th({ children, style = {} }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <th style={{
      padding: "10px 12px", textAlign: "left",
      fontFamily: mono, fontSize: 10, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.08em",
      color: textMuted, borderBottom: `1px solid ${border}`,
      ...style,
    }}>
      {children}
    </th>
  );
}

export function Td({ children, style = {}, colSpan, className }: { children?: ReactNode; style?: CSSProperties; colSpan?: number; className?: string }) {
  return (
    <td colSpan={colSpan} className={className ? `sbd-num ${className}` : "sbd-num"} style={{
      padding: "8px 12px",
      fontFamily: mono, fontSize: 12,
      color: textPrimary,
      ...style,
    }}>
      {children}
    </td>
  );
}

export function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || textMuted;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px", borderRadius: 3,
      fontSize: 10, fontWeight: 600,
      fontFamily: mono,
      background: `${color}20`,
      color,
      border: `1px solid ${color}40`,
    }}>
      {status}
    </span>
  );
}

export interface SummaryChipProps {
  icon: IconType;
  label: string;
  value: ReactNode;
  color: string;
}

export function SummaryChip({ icon: Icon, label, value, color }: SummaryChipProps) {
  return (
    <div className="sbd-pill" style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "6px 10px", borderRadius: 999,
      background: surface2, border: `1px solid ${border}`,
    }}>
      {Icon && <Icon size={13} color={color} />}
      <span style={{ fontFamily: mono, fontSize: 10, color: textMuted, textTransform: "uppercase" }}>
        {label}
      </span>
      <span className="sbd-num" style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color }}>
        {value}
      </span>
    </div>
  );
}
