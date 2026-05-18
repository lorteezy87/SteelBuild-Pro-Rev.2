/**
 * FieldActivitySection — project-dashboard rollup of the Field hub.
 *
 * Mounted between the Schedule & Timeline panel and Financial Controls
 * (per the Field overhaul brief). Mirrors the pattern of the existing
 * sections (SectionCard chrome → tile-strip → mini-chart → CTA strip).
 *
 * Surfaces five glanceable counts:
 *   - Daily logs this week
 *   - Photos this week
 *   - Open punch
 *   - Open inspections
 *   - Safety incidents YTD
 *
 * Plus a 7-day activity sparkline (events per day, simple SVG bars)
 * and a single CTA row that deep-links into the new /Field hub for
 * the full picture.
 *
 * The section itself doesn't fetch — it consumes the same arrays the
 * rest of the dashboard already pulls (Dashboard.jsx adds the field
 * queries and threads them through ProjectDashboard.jsx).
 */

import React, { useMemo } from "react";
import { ClipboardList, Plus } from "lucide-react";
import SectionCard from "./SectionCard";
import { localToday } from "@/utils/dates";

const today = localToday;

function startOfWeekISO() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().slice(0, 10);
}

function startOfYearISO() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
}

export default function FieldActivitySection({
  dailyLogs = [],
  photos = [],
  punchlistItems = [],
  inspections = [],
  safetyIncidents = [],
  qualityRecords = [],
  onNavigate,
}) {
  void qualityRecords; // not surfaced in the strip yet — kept for forward compat

  const todayIso   = today();
  const weekStart  = startOfWeekISO();
  const yearStart  = startOfYearISO();

  // Defensive in-memory soft-delete filter (entity layer already does this,
  // but cache freshness guarantees nothing — same pattern Procurement uses).
  const liveLogs        = useMemo(() => dailyLogs.filter((r) => !r.is_deleted), [dailyLogs]);
  const livePhotos      = useMemo(() => photos.filter((r) => !r.is_deleted), [photos]);
  const livePunch       = useMemo(() => punchlistItems.filter((r) => !r.is_deleted), [punchlistItems]);
  const liveInspections = useMemo(() => inspections.filter((r) => !r.is_deleted), [inspections]);
  const liveSafety      = useMemo(() => safetyIncidents.filter((r) => !r.is_deleted), [safetyIncidents]);

  const todayLog = useMemo(
    () => liveLogs.find((l) => String(l.date || "").slice(0, 10) === todayIso) || null,
    [liveLogs, todayIso],
  );

  const logsThisWeek = useMemo(
    () => liveLogs.filter((l) => String(l.date || "").slice(0, 10) >= weekStart).length,
    [liveLogs, weekStart],
  );

  const photosThisWeek = useMemo(
    () => livePhotos.filter((p) => String(p.taken_date || p.created_at || "").slice(0, 10) >= weekStart).length,
    [livePhotos, weekStart],
  );

  const openPunch = useMemo(
    () => livePunch.filter((p) =>
      p.status !== "Completed" && p.status !== "Cancelled" && p.status !== "Deferred"
    ).length,
    [livePunch],
  );

  const openInspections = useMemo(
    () => liveInspections.filter((i) => i.status === "Scheduled" || i.status === "In Progress").length,
    [liveInspections],
  );

  const safetyYTD = useMemo(
    () => liveSafety.filter((i) => String(i.incident_date || "").slice(0, 10) >= yearStart).length,
    [liveSafety, yearStart],
  );

  // 7-day activity sparkline (events per day across all field tables)
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1);
      let count = 0;
      count += liveLogs.filter((l) => String(l.date || "").slice(0, 10) === iso).length;
      count += livePhotos.filter((p) => String(p.taken_date || "").slice(0, 10) === iso).length;
      count += livePunch.filter((p) => String(p.created_at || "").slice(0, 10) === iso).length;
      count += liveInspections.filter((x) => String(x.inspection_date || "").slice(0, 10) === iso).length;
      count += liveSafety.filter((s) => String(s.incident_date || "").slice(0, 10) === iso).length;
      days.push({ iso, label, count });
    }
    return days;
  }, [liveLogs, livePhotos, livePunch, liveInspections, liveSafety]);

  const totalWeekEvents = weekDays.reduce((s, d) => s + d.count, 0);

  const stats = [
    { value: logsThisWeek, label: "LOGS / WK", color: "accent" },
    { value: openPunch, label: "OPEN PUNCH", color: openPunch > 0 ? "warning" : "muted" },
    { value: openInspections, label: "OPEN INSP", color: openInspections > 0 ? "info" : "muted" },
  ];

  return (
    <SectionCard
      icon={ClipboardList}
      iconColor="info"
      title="Field Activity"
      subtitle="Daily logs · photos · punch · inspections · safety"
      stats={stats}
    >
      {/* Tile strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 8,
        marginBottom: 14,
      }}>
        <Tile
          label="LOGS · WK"
          value={logsThisWeek}
          color="var(--accent)"
          onClick={onNavigate ? () => onNavigate("daily-logs") : undefined}
        />
        <Tile
          label="PHOTOS · WK"
          value={photosThisWeek}
          color="var(--accent)"
          onClick={onNavigate ? () => onNavigate("photos") : undefined}
        />
        <Tile
          label="OPEN PUNCH"
          value={openPunch}
          color={openPunch > 0 ? "var(--status-warning-bright)" : "var(--status-success-bright)"}
          onClick={onNavigate ? () => onNavigate("punchlist") : undefined}
        />
        <Tile
          label="OPEN INSP"
          value={openInspections}
          color={openInspections > 0 ? "var(--status-info)" : "var(--text-muted)"}
          onClick={onNavigate ? () => onNavigate("inspections") : undefined}
        />
        <Tile
          label="SAFETY · YTD"
          value={safetyYTD}
          color={safetyYTD > 0 ? "var(--status-error-bright)" : "var(--status-success-bright)"}
          onClick={onNavigate ? () => onNavigate("safety") : undefined}
        />
      </div>

      {/* 7-day activity strip */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 12,
      }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}>
          7-Day Activity · {totalWeekEvents} events
        </div>
        {!todayLog && onNavigate && (
          <button
            onClick={() => onNavigate("daily-logs", { create: true })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "var(--accent)",
              color: "var(--bg-base)",
              border: "none",
              borderRadius: 4,
              padding: "5px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
          >
            <Plus size={10} /> Log Today
          </button>
        )}
        {todayLog && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: "var(--status-success-bright)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            ✓ Logged Today · {todayLog.headcount || 0} crew
          </span>
        )}
      </div>

      {totalWeekEvents === 0 ? (
        <div style={{
          minHeight: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 12px",
          background: "var(--bg-surface-low)",
          border: "1px solid var(--border-default)",
          borderRadius: 6,
          fontFamily: "var(--font-body)",
          fontSize: 12,
          color: "var(--text-muted)",
          fontStyle: "italic",
          textAlign: "center",
          lineHeight: 1.5,
        }}>
          No field activity this week — log your first daily report, photo, or inspection to start tracking.
        </div>
      ) : (
        <SparkBars days={weekDays} />
      )}

      {onNavigate && (
        <div style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "flex-end",
        }}>
          <button
            onClick={() => onNavigate("field")}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--accent)",
              cursor: "pointer",
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
              background: "color-mix(in srgb, var(--accent) 6%, transparent)",
              transition: "all 0.15s",
            }}
          >
            Open Field Hub →
          </button>
        </div>
      )}
    </SectionCard>
  );
}

function Tile({ label, value, color, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        borderTop: `2px solid ${color}`,
        borderRadius: 6,
        padding: "10px 8px",
        cursor: onClick ? "pointer" : "default",
        textAlign: "center",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.background = `color-mix(in srgb, ${color} 20%, transparent)`)}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.background = `color-mix(in srgb, ${color} 10%, transparent)`)}
    >
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 22,
        fontWeight: 700,
        color,
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--text-secondary)",
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        marginTop: 6,
      }}>
        {label}
      </div>
    </button>
  );
}

function SparkBars({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: 6,
      minHeight: 80,
      height: 80,
      alignItems: "end",
    }}>
      {days.map((d) => (
        <div key={d.iso} title={`${d.iso}: ${d.count} events`}>
          <div style={{
            height: `${Math.max(4, (d.count / max) * 64)}px`,
            background: d.count > 0 ? "var(--accent)" : "var(--border-default)",
            borderRadius: 2,
            transition: "height 0.2s",
          }} />
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--text-muted)",
            textAlign: "center",
            marginTop: 4,
            letterSpacing: "0.06em",
          }}>
            {d.label}
          </div>
        </div>
      ))}
    </div>
  );
}
