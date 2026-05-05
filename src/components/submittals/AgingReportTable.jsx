/**
 * AgingReportTable.jsx — Submittals stuck without progress.
 *
 * Renders a sortable table of open (non-terminal) submittals whose
 * latest activity is older than `thresholdDays`. Threshold is
 * adjustable via a small dropdown (3, 7, 14, 30 days).
 *
 * Columns: Number, Title, Status, BIC, Days Stuck, Last Activity.
 * Default sort: Days Stuck desc.
 */

import React, { useMemo, useState } from "react";
import { computeAgingReport } from "@/lib/submittalAnalytics";

const THRESHOLDS = [3, 7, 14, 30];
const COLUMNS = [
  { key: "number",     label: "Number",     align: "left"   },
  { key: "title",      label: "Title",      align: "left"   },
  { key: "status",     label: "Status",     align: "left"   },
  { key: "bic",        label: "BIC",        align: "left"   },
  { key: "daysStuck",  label: "Days Stuck", align: "right"  },
  { key: "lastActivityIso", label: "Last Activity", align: "right" },
];

export default function AgingReportTable({ submittals = [], isLoading = false }) {
  const [thresholdDays, setThresholdDays] = useState(7);
  const [sortKey, setSortKey] = useState("daysStuck");
  const [sortDir, setSortDir] = useState("desc");

  const rows = useMemo(
    () => computeAgingReport(submittals, { thresholdDays }),
    [submittals, thresholdDays],
  );

  const sortedRows = useMemo(() => {
    const arr = rows.slice();
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const onSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "daysStuck" ? "desc" : "asc");
    }
  };

  return (
    <div className="sbd-card" style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 6,
      padding: "16px 18px",
      marginBottom: 16,
    }}>
      <Header
        threshold={thresholdDays}
        setThreshold={setThresholdDays}
        count={sortedRows.length}
      />

      {isLoading ? (
        <Empty message="Loading aging report…" />
      ) : sortedRows.length === 0 ? (
        <Empty message={`No open submittals stuck for more than ${thresholdDays} days. Nice.`} />
      ) : (
        <div style={{
          borderRadius: 4, border: "1px solid var(--border-default)",
          overflow: "hidden",
        }}>
          <table className="sbd-table" style={{
            width: "100%", borderCollapse: "collapse",
            fontFamily: "var(--font-mono)", fontSize: 11,
          }}>
            <thead>
              <tr style={{ background: "var(--bg-surface-high)" }}>
                {COLUMNS.map((c) => {
                  const isActive = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      onClick={() => onSort(c.key)}
                      style={{
                        padding: "8px 10px", textAlign: c.align,
                        fontSize: 9, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.08em",
                        color: isActive ? "var(--accent)" : "var(--text-muted)",
                        borderBottom: "1px solid var(--border-default)",
                        cursor: "pointer", userSelect: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.label}
                      {isActive && (
                        <span style={{ marginLeft: 4, fontSize: 8 }}>
                          {sortDir === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                  <td style={td("left", { color: "var(--accent)" })}>{r.number}</td>
                  <td style={td("left", { color: "var(--text-primary)" })}>{r.title}</td>
                  <td style={td("left")}>{r.status}</td>
                  <td style={td("left")}>{r.bic}</td>
                  <td style={td("right", {
                    color: stuckColor(r.daysStuck),
                    fontWeight: 700,
                  })}>{r.daysStuck}d</td>
                  <td style={td("right", { color: "var(--text-muted)" })}>
                    {fmtDate(r.lastActivityIso)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Internal pieces ──────────────────────────────────────────────────

function Header({ threshold, setThreshold, count }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: 12, gap: 12, flexWrap: "wrap",
    }}>
      <div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.12em",
          color: "var(--text-muted)",
          marginBottom: 2,
        }}>
          Aging Report
        </div>
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 12, color: "var(--text-muted)",
        }}>
          Open submittals with no movement · {count} stuck
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "var(--text-muted)", textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}>
          Threshold
        </span>
        <select
          className="sbd-select"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            padding: "4px 8px", borderRadius: 3,
            border: "1px solid var(--border-default)",
            background: "var(--bg-surface-low)",
            color: "var(--text-primary)",
            cursor: "pointer",
            width: "auto",
          }}
        >
          {THRESHOLDS.map((t) => (
            <option key={t} value={t}>≥ {t} days</option>
          ))}
        </select>
      </div>
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

function td(align, extra = {}) {
  return {
    padding: "6px 10px", textAlign: align,
    color: "var(--text-primary)",
    fontVariantNumeric: "tabular-nums",
    ...extra,
  };
}

function stuckColor(days) {
  if (days >= 30) return "var(--status-error)";
  if (days >= 14) return "var(--status-warning)";
  return "var(--text-primary)";
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "2-digit",
    });
  } catch {
    return "—";
  }
}
