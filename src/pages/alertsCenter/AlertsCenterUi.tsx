/**
 * Presentational pieces for Alerts Center.
 */
// @ts-nocheck
import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bell, ExternalLink } from "lucide-react";
import { formatDate } from "@/components/shared/formatters";
import StatusBadge from "@/components/shared/StatusBadge";
import { createPageUrl } from "@/utils";
import { resolveAlertPath, severityStyle } from "./alertsCenterPageHelpers";

export const ALERT_SEVERITY_FILTERS = ["all", "Critical", "High", "Medium", "Low"] as const;

export const alertFilterBtnActive = {
  padding: "4px 12px",
  borderRadius: "var(--radius-badge)",
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  cursor: "pointer",
  border: "none",
  background: "var(--accent-muted)",
  color: "var(--accent-light)",
};

export const alertFilterBtnInactive = {
  padding: "4px 12px",
  borderRadius: "var(--radius-badge)",
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.08em",
  cursor: "pointer",
  border: "none",
  background: "var(--bg-surface-low)",
  color: "var(--text-muted)",
};

export function AlertsFilterBar({
  severityFilter,
  typeFilter,
  alertTypes,
  onSeverityFilter,
  onTypeFilter,
}) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
      {ALERT_SEVERITY_FILTERS.map((s) => (
        <button
          key={s}
          onClick={() => onSeverityFilter(s)}
          style={severityFilter === s ? alertFilterBtnActive : alertFilterBtnInactive}
        >
          {s === "all" ? "ALL" : s.toUpperCase()}
        </button>
      ))}
      <div style={{ width: 1, background: "var(--bg-surface-high)", margin: "0 4px" }} />
      {["all", ...alertTypes].map((t) => (
        <button
          key={t}
          onClick={() => onTypeFilter(t)}
          style={typeFilter === t ? alertFilterBtnActive : alertFilterBtnInactive}
        >
          {t === "all" ? "ALL TYPES" : t}
        </button>
      ))}
    </div>
  );
}

export function AlertsErrorState({ errorMessage, onRetry }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-card)",
        gap: 16,
      }}
    >
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
        Couldn’t load alerts
      </p>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--text-muted)",
          margin: 0,
          textAlign: "center",
          maxWidth: 320,
        }}
      >
        {errorMessage}
      </p>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function AlertsEmptyState() {
  return (
    <div className="sbd-card" style={{ padding: "60px 24px", textAlign: "center" }}>
      <Bell style={{ width: 36, height: 36, color: "var(--text-muted)", margin: "0 auto 12px" }} />
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-secondary)", fontWeight: 500, marginBottom: 4 }}>
        No active alerts
      </p>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
        Alerts appear when module workflows detect overdue RFIs, deliveries, and similar conditions. Cross-module scan is not deployed.
      </p>
    </div>
  );
}

export function AlertCard({ alert, onOpen, onMarkRead, onDismiss }) {
  const sev = severityStyle(alert.severity);
  const path = resolveAlertPath(alert, createPageUrl);
  return (
    <div
      style={{
        background: sev.bg,
        border: "none",
        borderLeft: `3px solid ${sev.border}`,
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        opacity: alert.is_read ? 0.6 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <AlertTriangle style={{ width: 15, height: 15, marginTop: 2, flexShrink: 0, color: sev.border }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {alert.title}
            </span>
            <StatusBadge status={alert.severity} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                background: "var(--bg-surface-high)",
                color: "var(--text-muted)",
                borderRadius: 4,
                padding: "1px 6px",
                letterSpacing: "0.08em",
              }}
            >
              {alert.alert_type}
            </span>
            {!alert.is_read && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
            )}
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>
            {alert.description || alert.message}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
              {formatDate(alert.created_at || alert.created_date)}
            </span>
            {alert.project_name && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)" }}>
                · {alert.project_name}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {path && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpen(alert, path)}>
              <ExternalLink className="w-3 h-3 mr-1" />
              Open
            </Button>
          )}
          {!alert.is_read && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onMarkRead(alert)}>
              Mark Read
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            style={{ color: "rgba(200,210,230,0.7)" }}
            onClick={() => onDismiss(alert)}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
