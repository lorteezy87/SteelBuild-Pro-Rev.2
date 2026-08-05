/**
 * Presentational UI extracted from Field.jsx.
 * No queries/mutations — props-only.
 */
import React from "react";
import {
  ArrowRight,
  CalendarDays,
  Cloud,
  Users,
  AlertOctagon,
} from "lucide-react";
import { fmtShortDate, safeArray } from "./fieldPageHelpers";

export function FieldFastCaptureRail({ actions }) {
  return (
    <div className="field-fast-capture-rail" aria-label="Field quick actions">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.key}
            type="button"
            className="field-fast-action"
            onClick={action.onClick}
            style={{ "--field-action-color": action.color } as React.CSSProperties}
            aria-label={action.label}
          >
            <span className="field-fast-action-icon">
              <Icon size={18} />
            </span>
            <span className="field-fast-action-copy">
              <strong>{action.label}</strong>
              <small>{action.sub}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TodayExecutionStrip({
  todayLog,
  photosToday,
  openPunch,
  safetyOpen,
  deliveryDueToday,
  deliveryLate,
}) {
  const stats = [
    {
      key: "crew",
      label: "Crew",
      value: todayLog ? todayLog.headcount || 0 : "TBD",
      tone: todayLog ? "var(--status-success-bright)" : "var(--text-muted)",
    },
    {
      key: "hours",
      label: "Hours",
      value: todayLog ? todayLog.hours_worked || 0 : "TBD",
      tone: todayLog ? "var(--status-success-bright)" : "var(--text-muted)",
    },
    { key: "photos", label: "Photos", value: photosToday, tone: "var(--accent)" },
    {
      key: "punch",
      label: "Open Punch",
      value: openPunch,
      tone: openPunch ? "var(--status-warning-bright)" : "var(--status-success-bright)",
    },
    {
      key: "safety",
      label: "Open Safety",
      value: safetyOpen,
      tone: safetyOpen ? "var(--status-error-bright)" : "var(--status-success-bright)",
    },
    {
      key: "delivery",
      label: "Loads",
      value: deliveryLate ? `${deliveryLate} late` : deliveryDueToday,
      tone: deliveryLate ? "var(--status-error-bright)" : "var(--phase-delivery)",
    },
  ];

  return (
    <div className="field-today-strip" aria-label="Today's field execution status">
      {stats.map((stat) => (
        <div key={stat.key} className="field-today-stat" style={{ "--field-stat-color": stat.tone } as React.CSSProperties}>
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function SubPanel({ title, icon: IconCmp, count, cta, children }) {
  return (
    <div className="field-sub-panel" style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 10,
      padding: 16,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {IconCmp && <IconCmp size={14} color="var(--accent)" />}
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--text-secondary)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}>
            {title}
            {Number.isFinite(count) && (
              <span style={{ marginLeft: 6, color: "var(--text-muted)" }}>· {count}</span>
            )}
          </span>
        </div>
        {cta && (
          <button
            onClick={cta.onClick}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {cta.label} <ArrowRight size={10} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      fontWeight: 700,
      color: "var(--text-muted)",
      letterSpacing: "0.10em",
      textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

export function EmptyHint({ text }) {
  return (
    <div style={{
      fontFamily: "var(--font-body)",
      fontSize: 12,
      color: "var(--text-muted)",
      fontStyle: "italic",
      textAlign: "center",
      padding: "20px 8px",
    }}>
      {text}
    </div>
  );
}

export function DailyLogPreview({ log, onClick }) {
  const photos = safeArray(log.photos);
  return (
    <div
      className="field-daily-log-preview"
      onClick={onClick}
      style={{
        padding: 12,
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        cursor: "pointer",
        transition: "border-color 0.12s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--accent)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}>
          {fmtShortDate(log.date)} · TODAY
        </span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
        }}>
          {log.superintendent || "—"}
        </span>
      </div>
      <div className="field-log-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
        <Stat icon={Users}        label="Crew"     value={log.headcount || 0} />
        <Stat icon={CalendarDays} label="Hours"    value={log.hours_worked || 0} />
        <Stat icon={Cloud}        label="Weather"  value={log.weather_description || "—"} small />
        <Stat icon={AlertOctagon} label="Incidents" value={log.safety_incidents || 0} />
      </div>
      {log.activities && (
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          maxHeight: 64,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
        }}>
          {log.activities}
        </div>
      )}
      {photos.length > 0 && (
        <div style={{
          marginTop: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--accent)",
        }}>
          📷 {photos.length} photo{photos.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: IconCmp, label, value, small = false }) {
  return (
    <div>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        color: "var(--text-muted)",
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        marginBottom: 2,
      }}>
        {IconCmp && <IconCmp size={9} />}
        {label}
      </div>
      <div style={{
        fontFamily: small ? "var(--font-body)" : "var(--font-mono)",
        fontSize: small ? 11 : 14,
        fontWeight: 600,
        color: "var(--text-primary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {value}
      </div>
    </div>
  );
}

export function LogFeedRow({ log, onClick }) {
  return (
    <div
      className="field-log-feed-row"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        background: "var(--bg-page)",
        border: "1px solid var(--divider)",
        borderRadius: 4,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--divider)")}
    >
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--accent)",
        letterSpacing: "0.06em",
      }}>
        {fmtShortDate(log.date)}
      </span>
      <span style={{
        flex: 1,
        fontFamily: "var(--font-body)",
        fontSize: 11,
        color: "var(--text-secondary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {log.activities || "(no narrative)"}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--text-muted)",
      }}>
        {log.headcount || 0}× · {log.hours_worked || 0}h
      </span>
      {safeArray(log.photos).length > 0 && (
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--accent)",
        }}>
          📷 {safeArray(log.photos).length}
        </span>
      )}
    </div>
  );
}

export function ActionRow({ item }) {
  return (
    <div
      className="field-action-row"
      onClick={item.onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        background: "var(--bg-page)",
        border: "1px solid var(--divider)",
        borderLeft: `3px solid ${item.color}`,
        borderRadius: 4,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--divider)")}
    >
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        color: item.color,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        minWidth: 56,
      }}>
        {item.type}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {item.title}
        </div>
        {item.sub && (
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
          }}>
            {item.sub}
          </div>
        )}
      </div>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--text-muted)",
      }}>
        {fmtShortDate(item.date)}
      </span>
    </div>
  );
}

export function PhotoThumb({ photo, onClick }) {
  const url = photo.file_url || photo.path || "";
  return (
    <div
      className="field-photo-thumb"
      onClick={onClick}
      title={photo.title || photo.file_name || ""}
      style={{
        width: 88,
        height: 88,
        flexShrink: 0,
        borderRadius: 6,
        border: "1px solid var(--border-default)",
        overflow: "hidden",
        background: "var(--bg-input)",
        cursor: "pointer",
        position: "relative",
      }}
    >
      {url && (
        <img
          src={url}
          alt={photo.title || photo.file_name || "photo"}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
      {photo.category && (
        <div style={{
          position: "absolute",
          bottom: 2,
          left: 2,
          right: 2,
          background: "color-mix(in srgb, var(--bg-base) 80%, transparent)",
          color: "var(--on-accent)",
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "2px 4px",
          borderRadius: 2,
          textAlign: "center",
        }}>
          {photo.category}
        </div>
      )}
    </div>
  );
}

export function WeekActivityStrip({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);
  return (
    <div className="field-week-strip" style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 10,
      padding: "12px 16px",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}>
          7-Day Activity · {total} events
        </span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 6,
        height: 50,
        alignItems: "end",
      }}>
        {days.map((d) => (
          <div key={d.iso} title={`${d.iso}: ${d.count} events`}>
            <div style={{
              height: `${Math.max(2, (d.count / max) * 40)}px`,
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
              {d.day}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
