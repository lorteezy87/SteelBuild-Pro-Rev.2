import React from "react";
import { X } from "lucide-react";
import { daysUntil } from "@/lib/commandCenter/urgencyEngine";

/**
 * Zone C — 14-day forward look drawer.
 * Slides in from the right with three sub-sections:
 *   1. Fab Releases (WorkPackages entering Fabrication within 14 days)
 *   2. Deliveries (scheduled within 14 days)
 *   3. Erection Starts / Milestones (WPs in Erection phase)
 *
 * Uses the same fixed-header / scrollable-body / pinned-footer pattern.
 */

const LOOK_AHEAD_DAYS = 14;

const SectionLabel = ({ label, count }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 0 6px",
      borderBottom: "1px solid var(--divider)",
      marginBottom: 6,
    }}
  >
    <span
      style={{
        fontFamily: "'Space Grotesk', var(--font-display)",
        fontSize: 11,
        fontWeight: 700,
        color: "var(--text-primary)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 700,
        color: "var(--text-muted)",
      }}
    >
      {count}
    </span>
  </div>
);

const CompactRow = ({ left, right, rightColor, sub }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      padding: "6px 0",
      borderBottom: "1px solid var(--divider)",
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {left}
      </div>
      {sub && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 600,
        color: rightColor || "var(--text-secondary)",
        whiteSpace: "nowrap",
        marginLeft: 8,
      }}
    >
      {right}
    </span>
  </div>
);

const formatDate = (d) => {
  if (!d) return "—";
  return new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

function buildForwardLookData({ workPackages = [], deliveries = [], projectMap = {} }) {
  // 1. Fab Releases: WPs in Fabrication phase with released_date in next 14 days
  //    OR WPs approaching Fabrication (Detailing + Complete)
  const fabReleases = workPackages
    .filter((wp) => {
      if (wp.status === "Complete") return false;
      // Already in fab, released within window
      if (wp.phase === "Fabrication" && wp.released_date) {
        const d = daysUntil(wp.released_date);
        return d >= -3 && d <= LOOK_AHEAD_DAYS;
      }
      // Detailing complete → about to enter fab
      if (wp.phase === "Detailing" && wp.status === "Complete") return true;
      return false;
    })
    .map((wp) => ({
      id: wp.id,
      name: `${wp.wp_number || "WP"} — ${wp.name || ""}`,
      date: wp.released_date,
      projectNum: (projectMap[wp.project_id] || {}).project_number,
      tons: wp.tonnage ? `${Number(wp.tonnage).toFixed(1)}T` : null,
      phase: wp.phase,
    }));

  // 2. Deliveries in next 14 days
  const upcomingDeliveries = deliveries
    .filter((d) => {
      if (d.status === "Delivered") return false;
      const days = daysUntil(d.scheduled_date);
      return days >= 0 && days <= LOOK_AHEAD_DAYS;
    })
    .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""))
    .map((d) => ({
      id: d.id,
      name: d.delivery_title || d.description || "Delivery",
      date: d.scheduled_date,
      projectNum: (projectMap[d.project_id] || {}).project_number,
      pieces: d.pieces,
      tons: d.weight_tons ? `${Number(d.weight_tons).toFixed(1)}T` : null,
      vendor: d.vendor,
    }));

  // 3. Erection starts / milestones
  const erectionItems = workPackages
    .filter((wp) => {
      if (wp.phase !== "Erection") return false;
      if (wp.status === "Complete") return false;
      // Include if recently started or about to start
      if (wp.status === "Not Started" || wp.status === "In Progress") return true;
      return false;
    })
    .map((wp) => ({
      id: wp.id,
      name: `${wp.wp_number || "WP"} — ${wp.name || ""}`,
      projectNum: (projectMap[wp.project_id] || {}).project_number,
      status: wp.status,
      pct: Number(wp.percent_complete) || 0,
      crew: wp.crew,
    }));

  return { fabReleases, upcomingDeliveries, erectionItems };
}

export default function ForwardLookDrawer({
  open,
  onClose,
  workPackages = [],
  deliveries = [],
  projectMap = {},
}) {
  if (!open) return null;

  const { fabReleases, upcomingDeliveries, erectionItems } = buildForwardLookData({
    workPackages,
    deliveries,
    projectMap,
  });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 1100,
        }}
      />

      {/* Drawer */}
      <div
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        tabIndex={-1}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 440,
          maxWidth: "90vw",
          height: "100vh",
          background: "var(--bg-surface-secondary)",
          borderLeft: "1px solid var(--border-default)",
          zIndex: 1101,
          display: "flex",
          flexDirection: "column",
          outline: "none",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--divider)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'Space Grotesk', var(--font-display)",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "0.04em",
            }}
          >
            14-Day Forward Look
          </span>
          <button
            onClick={onClose}
            aria-label="Close forward look drawer"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
          {/* Fab Releases */}
          <SectionLabel label="Fab Releases" count={fabReleases.length} />
          {fabReleases.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px 0" }}>None in window</div>
          ) : (
            fabReleases.map((f) => (
              <CompactRow
                key={f.id}
                left={f.name}
                right={f.date ? formatDate(f.date) : f.phase === "Detailing" ? "Ready" : "—"}
                sub={[f.projectNum, f.tons].filter(Boolean).join(" / ")}
              />
            ))
          )}

          {/* Deliveries */}
          <SectionLabel label="Deliveries" count={upcomingDeliveries.length} />
          {upcomingDeliveries.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px 0" }}>None scheduled</div>
          ) : (
            upcomingDeliveries.map((d) => (
              <CompactRow
                key={d.id}
                left={d.name}
                right={formatDate(d.date)}
                rightColor={daysUntil(d.date) <= 3 ? "var(--status-warning)" : undefined}
                sub={[d.projectNum, d.vendor, d.pieces ? `${d.pieces} pcs` : null, d.tons].filter(Boolean).join(" / ")}
              />
            ))
          )}

          {/* Erection Starts */}
          <SectionLabel label="Erection Starts / Milestones" count={erectionItems.length} />
          {erectionItems.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px 0" }}>None active</div>
          ) : (
            erectionItems.map((e) => (
              <CompactRow
                key={e.id}
                left={e.name}
                right={`${e.pct}%`}
                rightColor={e.status === "Not Started" ? "var(--text-muted)" : "var(--status-success)"}
                sub={[e.projectNum, e.crew, e.status].filter(Boolean).join(" / ")}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--divider)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              width: "100%",
              background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)",
              borderRadius: 4,
              padding: "8px 16px",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
