/**
 * DocumentHubSection — third panel of the project dashboard.
 *
 * Two columns:
 *   RFI Status (Draft / Submitted / Pending / Responded / Closed)
 *   Submittal Pipeline (IFA → OFA → BFA → OFS → IFC → Released)
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
import { rfiStatusRollup, submittalPipelineRollupFromSubmittals, ballInCourtRollup, openRFICount, recentActivityFeed } from "../projectMetrics";

const RFI_STATUS_COLOR = {
  Draft:     "var(--text-muted)",
  Submitted: "var(--status-info)",
  Pending:   "var(--status-warning)",
  Responded: "var(--status-success-bright)",
  Closed:    "var(--text-muted)",
};

// Stage colours mirror the canonical drawingsConfig.STAGES palette so
// the dashboard's mini-pipeline reads consistently with the Drawings
// page chips.
const STAGE_COLOR = {
  IFA:      "#60A5FA", // sky
  OFA:      "#2563EB", // blue
  BFA:      "#F97316", // orange
  OFS:      "#0D9488", // teal
  IFC:      "#34D399", // mint
  Released: "#10B981", // emerald
};

// Canonical steel-detailing pipeline. "Scrub" is the in-house QA review
// where corrections are applied after EOR comments; IFC is the record
// copy issued to the GC; Released = released for fabrication.
const STAGE_CAPTION = {
  IFA:      "In for Approval",
  OFA:      "Out for Approval",
  BFA:      "Back from Approval",
  OFS:      "Out for Scrub",
  IFC:      "Issued for Construction",
  Released: "Released for Fabrication",
};

export default function DocumentHubSection({
  rfis = [],
  submittals = [],
  drawings = [],
  drawingActivity = [],
  onNavigate,
}) {
  const recentActivity = useMemo(
    () => recentActivityFeed(drawingActivity, 8),
    [drawingActivity],
  );
  const rfiBuckets = useMemo(() => rfiStatusRollup(rfis), [rfis]);
  // Sprint 2: workflow source of truth is the `submittals` table.
  // Pipeline counts are now derived from submittals only — drawings
  // contribute a sheet count via the stats strip below but no longer
  // drive the IFA/OFA/BFA/OFS/IFC/Released rollup.
  const submittalRollup = useMemo(
    () => submittalPipelineRollupFromSubmittals(submittals),
    [submittals],
  );
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
    // submittalRollup.total is now the count of active (non-Void)
    // submittals from the submittals table — one row per submittal.
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

      {/* Recent Activity — pulls from drawing_activity (the only
          activity surface that's actually populated). Each row shows
          the event kind + summary + relative time. */}
      <div>
        <PaneHeader title="Recent Activity" />
        {recentActivity.length === 0 ? (
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 12,
            color: "var(--text-muted)", fontStyle: "italic",
            padding: "12px 0",
          }}>
            No recent activity yet — drawing uploads / stage changes / approvals will appear here.
          </div>
        ) : (
          recentActivity.slice(0, 8).map((entry) => (
            <div
              key={entry.id}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                fontFamily: "var(--font-body)", fontSize: 12,
                color: "var(--text-secondary)",
                padding: "6px 0",
                borderBottom: "1px solid var(--divider)",
              }}
            >
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase",
                color: kindColor(entry.kind),
                minWidth: 90,
              }}>
                {kindLabel(entry.kind)}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.summary}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: "var(--text-muted)",
                flexShrink: 0,
              }}>
                {formatRelative(entry.when)}
              </span>
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

// ── Activity-feed helpers ─────────────────────────────────────────────
function kindLabel(kind) {
  switch (kind) {
    case "stage_changed":    return "STAGE";
    case "approval_changed": return "APPROVAL";
    case "revision_changed": return "REVISION";
    case "superseded":       return "SUPERSEDED";
    case "deleted":          return "DELETED";
    case "created":          return "ADDED";
    default: return String(kind || "EVENT").toUpperCase();
  }
}
function kindColor(kind) {
  switch (kind) {
    case "stage_changed":    return "var(--status-info)";
    case "approval_changed": return "var(--status-success-bright)";
    case "revision_changed": return "var(--status-warning)";
    case "superseded":       return "var(--text-muted)";
    case "deleted":          return "var(--status-error)";
    case "created":          return "var(--accent)";
    default: return "var(--text-muted)";
  }
}
function formatRelative(ts) {
  if (!ts) return "";
  const t = new Date(ts);
  if (Number.isNaN(t.getTime())) return "";
  const now = new Date();
  const diffMs = now - t;
  const min = Math.round(diffMs / 60000);
  if (min < 1)   return "just now";
  if (min < 60)  return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24)   return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30)  return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12)   return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}
