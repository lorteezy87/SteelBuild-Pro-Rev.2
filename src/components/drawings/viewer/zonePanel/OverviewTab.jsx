/**
 * OverviewTab — extracted from ZonePanel.jsx.
 *
 * Renders the Overview tab body: Readiness ring trio (when any score
 * has data), the linked-activity tile grid, the rule-engine "why"
 * card, plus optional zone description and status_reason callouts.
 *
 * Pure presentation — receives all data via props from the parent
 * panel; the parent owns the queries and mutations. The single
 * mutation hook this file exposes is the onApplyComputed callback,
 * which the parent wires to its onZoneUpdate side effect.
 */

import React from "react";
import { mono, STATUS_COLOR } from "./zonePanelConstants";
import { ReadinessRing } from "./ReadinessRing";

export function OverviewTab({ zone, items, counts, computed, readiness, dependencyImpact, onApplyComputed }) {
  const rfiOpen = items.filter((i) => i.link.linked_record_type === "rfi" && i.record && !/^(answered|closed|void)$/i.test(i.record.status || "")).length;
  const wpActive = items.filter((i) => i.link.linked_record_type === "work_package" && i.record && /In Progress|Active|Fabrication|Erection|Installation/i.test(i.record.status || "")).length;
  const delPending = items.filter((i) => i.link.linked_record_type === "delivery" && i.record && !/Delivered|Received/i.test(i.record.status || "")).length;
  const photoCount = (counts.photo || 0) + (counts.document || 0);

  const rows = [
    { label: "Open RFIs",          value: rfiOpen },
    { label: "Active Work Packages", value: wpActive },
    { label: "Pending Deliveries", value: delPending },
    { label: "Photos / Docs",      value: photoCount },
  ];

  // Rule-engine "why" card. Shows the drivers that produced the
  // computed status. If the computed value differs from what's
  // stored on the zone (manual override, stale cache, etc.), the
  // user can one-click adopt the rule-engine value.
  const suggestion = computed?.status && computed.status !== zone.status;
  const suggestionColor = STATUS_COLOR[computed?.status] || STATUS_COLOR.neutral;

  // Show the readiness block only when at least one of the three scores
  // has an actual value — if every gauge would be a dash, the block is
  // noise and we hide it entirely.
  const hasAnyReadiness = readiness && (
    readiness.fabrication !== null ||
    readiness.delivery !== null ||
    readiness.erection !== null
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {hasAnyReadiness && (
        <>
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Readiness
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <ReadinessRing
              pct={readiness.fabrication}
              label="Fabrication"
              drivers={readiness.drivers?.fabrication || []}
              dragInfo={dependencyImpact}
            />
            <ReadinessRing
              pct={readiness.delivery}
              label="Delivery"
              drivers={readiness.drivers?.delivery || []}
              dragInfo={dependencyImpact}
            />
            <ReadinessRing
              pct={readiness.erection}
              label="Erection"
              drivers={readiness.drivers?.erection || []}
              dragInfo={dependencyImpact}
            />
          </div>
        </>
      )}
      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        Linked activity
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              padding: "10px 12px",
              background: "var(--bg-page)",
              border: "1px solid var(--border-default)",
              borderRadius: 3,
            }}
          >
            <div style={{ ...mono, fontSize: 22, fontWeight: 800, color: r.value > 0 ? "var(--text-primary)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {r.value}
            </div>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {r.label}
            </div>
          </div>
        ))}
      </div>

      {/* Rule-engine "why" — the single biggest trust upgrade. */}
      {computed && computed.drivers && computed.drivers.length > 0 && (
        <div
          style={{
            padding: "10px 12px",
            background: `color-mix(in srgb, ${suggestionColor} 8%, var(--bg-page))`,
            border: `1px solid ${suggestionColor}`,
            borderRadius: 3,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: suggestionColor, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Rule engine · {computed.status}
            </div>
            {suggestion && (
              <button
                onClick={onApplyComputed}
                title={`Apply the rule-engine status (${computed.status}) and clear manual override`}
                style={{
                  ...mono,
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                  padding: "3px 8px",
                  background: `color-mix(in srgb, ${suggestionColor} 16%, transparent)`,
                  color: suggestionColor,
                  border: `1px solid ${suggestionColor}`,
                  borderRadius: 2,
                  cursor: "pointer",
                }}
              >
                Apply →
              </button>
            )}
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            {computed.drivers.map((d, i) => (
              <li key={i} style={{ ...mono, fontSize: 10, color: "var(--text-primary)", lineHeight: 1.5 }}>
                · {d}
              </li>
            ))}
          </ul>
          {zone.is_manual_status_override && (
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6, fontStyle: "italic", letterSpacing: "0.04em" }}>
              Zone is currently pinned to "{zone.status}" by a manual override; rule engine is advisory.
            </div>
          )}
        </div>
      )}

      {zone.description && (
        <div style={{ padding: "10px 12px", background: "var(--bg-page)", border: "1px solid var(--border-default)", borderRadius: 3 }}>
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
            Description
          </div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>
            {zone.description}
          </div>
        </div>
      )}
      {zone.status_reason && (
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
          Current status rationale: {zone.status_reason}
        </div>
      )}
    </div>
  );
}

export default OverviewTab;
