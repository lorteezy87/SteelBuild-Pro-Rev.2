/**
 * CycleTimeCard.jsx — Approval cycle-time analytics for the Hub.
 *
 * Renders a card summarising:
 *   - overall median (p50) and p90 of submitted→terminal cycle time
 *   - per-reviewer breakdown (avg, p50, p90, count)
 *   - a window filter (30 / 60 / 90 / 365 days)
 *
 * All compute is delegated to src/lib/submittalAnalytics.js so the
 * component stays presentational. Empty / loading states render a
 * graceful message instead of an empty card.
 */

import React, { useMemo, useState } from "react";
import {
  computeCycleTime,
  filterByDaysWindow,
} from "@/lib/submittalAnalytics";

const WINDOWS = [
  { key: 30,  label: "30d"  },
  { key: 60,  label: "60d"  },
  { key: 90,  label: "90d"  },
  { key: 365, label: "1y"   },
  { key: 0,   label: "All"  },
];

export default function CycleTimeCard({ submittals = [], roundsBySubmittal = null, isLoading = false }) {
  const [windowDays, setWindowDays] = useState(90);

  const stats = useMemo(() => {
    const filtered = filterByDaysWindow(submittals, windowDays);
    // Pass the rounds map so the per-reviewer breakdown reads the closing
    // reviewer from the latest round — released submittals now have their
    // ball_in_court cleared, so the submittal field alone would read "Unassigned".
    return computeCycleTime(filtered, { roundsBySubmittal });
  }, [submittals, windowDays, roundsBySubmittal]);

  return (
    <div className="sbd-card" style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 6,
      padding: "16px 18px",
      marginBottom: 16,
    }}>
      <Header
        windowDays={windowDays}
        setWindowDays={setWindowDays}
        sampleCount={stats.overall.count}
      />
      {isLoading ? (
        <Empty message="Loading cycle-time data…" />
      ) : stats.overall.count === 0 ? (
        <Empty message="No terminal submittals in this window yet." />
      ) : (
        <>
          <OverallStrip stats={stats.overall} />
          <ReviewerTable rows={stats.byReviewer} />
        </>
      )}
    </div>
  );
}

// ── Internal pieces ──────────────────────────────────────────────────

function Header({ windowDays, setWindowDays, sampleCount }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: 12, flexWrap: "wrap", gap: 8,
    }}>
      <div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.12em",
          color: "var(--text-muted)",
          marginBottom: 2,
        }}>
          Approval Cycle Time
        </div>
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 12, color: "var(--text-muted)",
        }}>
          Submitted → terminal · {sampleCount} sample{sampleCount === 1 ? "" : "s"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            onClick={() => setWindowDays(w.key)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: w.key === windowDays ? 700 : 500,
              padding: "4px 10px",
              borderRadius: 3,
              border: `1px solid ${w.key === windowDays ? "var(--accent)" : "var(--border-default)"}`,
              background: w.key === windowDays ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
              color: w.key === windowDays ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OverallStrip({ stats }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
      gap: 8,
      marginBottom: 16,
    }}>
      <Stat label="Avg" value={stats.avg} unit="d" color="var(--accent)" />
      <Stat label="Median (p50)" value={stats.p50} unit="d" color="var(--status-success)" />
      <Stat label="p90" value={stats.p90} unit="d" color="var(--status-warning)" />
      <Stat label="Count" value={stats.count} unit="" color="var(--text-primary)" />
    </div>
  );
}

function Stat({ label, value, unit, color }) {
  return (
    <div style={{
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderRadius: 4,
      padding: "8px 10px",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div className="sbd-num" style={{
        fontFamily: "var(--font-mono)",
        fontSize: 18, fontWeight: 700,
        color, fontVariantNumeric: "tabular-nums",
      }}>
        {value}{unit && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 2 }}>{unit}</span>}
      </div>
    </div>
  );
}

function ReviewerTable({ rows }) {
  if (!rows.length) return null;
  return (
    <div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9,
        color: "var(--text-muted)", textTransform: "uppercase",
        letterSpacing: "0.08em", marginBottom: 6,
      }}>
        By Reviewer (BIC at terminal)
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 60px 60px 60px 60px",
        gap: "4px 12px",
        fontFamily: "var(--font-mono)", fontSize: 11,
      }}>
        <Hdr>Reviewer</Hdr>
        <Hdr right>Count</Hdr>
        <Hdr right>Avg</Hdr>
        <Hdr right>p50</Hdr>
        <Hdr right>p90</Hdr>
        {rows.map((r) => (
          <React.Fragment key={r.reviewer}>
            <div style={{ color: "var(--text-primary)" }}>{r.reviewer}</div>
            <Cell>{r.count}</Cell>
            <Cell>{r.avg}d</Cell>
            <Cell>{r.p50}d</Cell>
            <Cell>{r.p90}d</Cell>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Hdr({ children, right }) {
  return (
    <div style={{
      color: "var(--text-muted)",
      fontSize: 9, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.08em",
      textAlign: right ? "right" : "left",
      borderBottom: "1px dashed color-mix(in srgb, var(--text-muted) 25%, transparent)",
      paddingBottom: 4, marginBottom: 2,
    }}>
      {children}
    </div>
  );
}

function Cell({ children }) {
  return (
    <div className="sbd-num" style={{
      color: "var(--text-primary)",
      textAlign: "right",
      fontVariantNumeric: "tabular-nums",
    }}>
      {children}
    </div>
  );
}

function Empty({ message }) {
  return (
    <div style={{
      padding: "20px 0", textAlign: "center",
      fontSize: 12, color: "var(--text-muted)",
      fontStyle: "italic",
    }}>
      {message}
    </div>
  );
}
