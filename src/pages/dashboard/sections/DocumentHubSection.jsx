/**
 * DocumentHubSection — third panel of the project dashboard.
 *
 * Two columns:
 *   RFI Status (Draft / Submitted / Pending / Responded / Closed)
 *   Submittal Pipeline (OFA → BFA → OFS → BFS → FFF → Released)
 *
 * Then a wide row:
 *   Ball in Court (Open RFIs) — 5 cards: Architect / Engineer / GC /
 *   Owner / Internal. The card whose value is highest gets a soft
 *   accent ring so PMs can see at a glance who owes them most.
 *
 * Then:
 *   Recent Activity placeholder (latest 5 events across the entity
 *   surfaces — wired up once an activity feed query lands).
 *
 * Improvements over the prototype:
 *   - Each row in RFI Status / Submittal Pipeline is clickable; calling
 *     `onNavigate("rfis")` / `onNavigate("submittals")` deep-links into
 *     the filtered list view.
 *   - The dot next to each row uses the same colour token as the
 *     status pill on the RFIs page, so the visual language stays
 *     consistent across screens.
 */

import React, { useMemo } from "react";
import { FileText, ChevronRight } from "lucide-react";
import SectionCard from "./SectionCard";
import { rfiStatusRollup, submittalPipelineRollup, ballInCourtRollup, openRFICount } from "../projectMetrics";

const RFI_STATUS_COLOR = {
  Draft:     "var(--text-muted)",
  Submitted: "var(--status-info)",
  Pending:   "var(--status-warning)",
  Responded: "var(--status-success-bright)",
  Closed:    "var(--text-muted)",
};

const STAGE_COLOR = {
  OFA:      "var(--status-info)",
  BFA:      "var(--status-warning)",
  OFS:      "var(--status-review)",
  BFS:      "var(--status-warning)",
  FFF:      "#0d9488",
  Released: "var(--status-success-bright)",
};

// Canonical steel-detailing pipeline. "Sealing" = EOR stamp on the
// shop-drawing package; FFF is the approved-as-noted package ready
// for the shop floor; Released = on the shop schedule.
const STAGE_CAPTION = {
  OFA:      "Out for Approval",
  BFA:      "Back from Approval",
  OFS:      "Out for Sealing",
  BFS:      "Back from Sealing",
  FFF:      "Final for Fab",
  Released: "Released",
};

export default function DocumentHubSection({
  rfis = [],
  submittals = [],
  drawings = [],
  recentActivity = [],
  onNavigate,
}) {
  const rfiBuckets = useMemo(() => rfiStatusRollup(rfis), [rfis]);
  const submittalRollup = useMemo(() => submittalPipelineRollup(submittals), [submittals]);
  const bic = useMemo(() => ballInCourtRollup(rfis), [rfis]);
  const openRFIs = useMemo(() => openRFICount(rfis), [rfis]);

  // Soft-highlight whoever owes us the most so the PM can see it at a
  // glance. If everyone is at zero we don't highlight anything.
  const maxBic = Math.max(...Object.values(bic));
  const heaviestBic = maxBic > 0
    ? Object.entries(bic).find(([, v]) => v === maxBic)?.[0]
    : null;

  const stats = [
    { value: openRFIs, label: "Open RFIs", color: openRFIs > 0 ? "warning" : "muted" },
    { value: submittalRollup.total, label: "Submittals", color: "info" },
    { value: drawings.length, label: "Drawings", color: "accent" },
  ];

  return (
    <SectionCard
      icon={FileText}
      iconColor="info"
      title="Document Hub"
      subtitle="RFIs, submittals, and drawings status"
      stats={stats}
    >
      {/* Two-column status panes */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginBottom: 18,
      }}>
        <div>
          <PaneHeader
            title="RFI Status"
            onClickViewAll={onNavigate ? () => onNavigate("rfis") : undefined}
          />
          {Object.entries(rfiBuckets).map(([label, count]) => (
            <StatusRow
              key={label}
              dotColor={RFI_STATUS_COLOR[label]}
              label={label}
              count={count}
              onClick={onNavigate ? () => onNavigate("rfis") : undefined}
            />
          ))}
        </div>
        <div>
          <PaneHeader
            title="Submittal Pipeline"
            onClickViewAll={onNavigate ? () => onNavigate("submittals") : undefined}
          />
          {submittalRollup.stages.map((stage) => (
            <StatusRow
              key={stage}
              dotColor={STAGE_COLOR[stage]}
              label={`${stage} - ${STAGE_CAPTION[stage]}`}
              count={submittalRollup.counts[stage]}
              onClick={onNavigate ? () => onNavigate("submittals") : undefined}
            />
          ))}
        </div>
      </div>

      {/* Ball in Court */}
      <div style={{ marginBottom: 18 }}>
        <PaneHeader title="Ball in Court (Open RFIs)" />
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 8,
        }}>
          {Object.entries(bic).map(([party, count]) => (
            <BicCell
              key={party}
              label={party}
              count={count}
              highlighted={party === heaviestBic && maxBic > 0}
              onClick={onNavigate ? () => onNavigate("rfis") : undefined}
            />
          ))}
        </div>
      </div>

      {/* Recent Activity placeholder */}
      <div>
        <PaneHeader title="Recent Activity" />
        {recentActivity.length === 0 ? (
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 12,
            color: "var(--text-muted)", fontStyle: "italic",
            padding: "12px 0",
          }}>
            No recent activity yet — RFI / submittal / drawing actions will appear here.
          </div>
        ) : (
          recentActivity.slice(0, 5).map((entry) => (
            <div
              key={entry.id}
              style={{
                fontFamily: "var(--font-body)", fontSize: 12,
                color: "var(--text-secondary)",
                padding: "6px 0",
                borderBottom: "1px solid var(--divider)",
              }}
            >
              {entry.summary}
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}

function PaneHeader({ title, onClickViewAll }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 10,
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-secondary)",
      }}>
        {title}
      </span>
      {onClickViewAll && (
        <button onClick={onClickViewAll} style={{
          background: "none", border: "none", padding: 0,
          color: "var(--accent)",
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase",
          cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 2,
        }}>
          View All <ChevronRight size={10} />
        </button>
      )}
    </div>
  );
}

function StatusRow({ dotColor, label, count, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px",
        marginBottom: 4,
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 6,
        cursor: onClick ? "pointer" : "default",
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.background = "var(--hover-bg)")}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.background = "var(--bg-surface-low)")}
    >
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: dotColor, flexShrink: 0,
      }} />
      <span style={{
        flex: 1,
        fontFamily: "var(--font-body)", fontSize: 12,
        color: "var(--text-secondary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
        color: count > 0 ? "var(--text-primary)" : "var(--text-muted)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {count}
      </span>
    </div>
  );
}

function BicCell({ label, count, highlighted, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        background: highlighted ? "var(--warning-muted)" : "var(--bg-surface-low)",
        border: highlighted ? "1px solid var(--warning-border)" : "1px solid var(--border-default)",
        borderRadius: 8,
        padding: "12px 10px",
        textAlign: "center",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.12s",
      }}
    >
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700,
        color: highlighted ? "var(--status-warning-bright)" : (count > 0 ? "var(--text-primary)" : "var(--text-muted)"),
        lineHeight: 1,
      }}>
        {count}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-muted)",
        marginTop: 6,
      }}>
        {label}
      </div>
    </button>
  );
}
