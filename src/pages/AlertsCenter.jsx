import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bell, CheckCheck, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatDate } from "../components/shared/formatters";
import StatusBadge from "../components/shared/StatusBadge";
import { toast } from "sonner";

const PAGE_MAP = { RFI: "RFIs", Drawing: "Drawings", ChangeOrder: "ChangeOrders", Delivery: "Deliveries", WorkPackage: "WorkPackages" };

const SEVERITY_BG = {
  Critical: { bg: "var(--danger-muted)", border: "var(--status-error)" },
  High:     { bg: "var(--warning-muted)", border: "var(--status-warning)" },
  Medium:   { bg: "var(--warning-muted)", border: "var(--status-warning)" },
  Low:      { bg: "var(--hover-bg)", border: "var(--border-strong)" },
};

export default function AlertsCenter() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: alerts = [], isLoading, refetch } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => base44.entities.Alert.list("-created_at"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Alert.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Alert.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const markRead = (alert) => updateMut.mutate({ id: alert.id, data: { ...alert, is_read: true } });
  const markAllRead = () => {
    alerts.filter(a => !a.is_read).forEach(a => updateMut.mutate({ id: a.id, data: { ...a, is_read: true } }));
  };
  const dismiss = (alert) => updateMut.mutate({ id: alert.id, data: { ...alert, is_dismissed: true } });

  const generateAlerts = async () => {
    setGenerating(true);
    try {
      await base44.functions.invoke("generateAlerts", {});
      await refetch();
      toast.success("Alerts refreshed");
    } catch (err) {
      toast.error("Failed to generate alerts: " + (err?.message || "Unknown error"));
    } finally {
      setGenerating(false);
    }
  };

  const filtered = alerts.filter(a => {
    if (a.is_dismissed) return false;
    const matchSeverity = severityFilter === "all" || a.severity === severityFilter;
    const matchType = typeFilter === "all" || a.alert_type === typeFilter;
    return matchSeverity && matchType;
  });

  const unreadCount = alerts.filter(a => !a.is_read && !a.is_dismissed).length;
  const alertTypes = [...new Set(alerts.map(a => a.alert_type))];

  const btnActive = { padding: "4px 12px", borderRadius: "var(--radius-badge)", fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", border: "none", background: "var(--accent-muted)", color: "var(--accent-light)" };
  const btnInactive = { padding: "4px 12px", borderRadius: "var(--radius-badge)", fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", cursor: "pointer", border: "none", background: "var(--bg-surface-low)", color: "var(--text-muted)" };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontFamily: "var(--font-body)", fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Alerts & Notifications</h1>
            {unreadCount > 0 && <span style={{ background: "var(--status-error)", color: "white", borderRadius: 10, padding: "2px 8px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700 }}>{unreadCount}</span>}
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", marginTop: 3 }}>{filtered.length} ACTIVE ALERTS</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck className="w-3.5 h-3.5 mr-1" />Mark All Read
          </Button>
          <button onClick={generateAlerts} disabled={generating} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "var(--accent)", border: "none", borderRadius: "var(--radius-btn)", color: "white", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, cursor: generating ? "not-allowed" : "pointer", opacity: generating ? 0.7 : 1 }}>
            {generating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Scanning...</> : <><RefreshCw className="w-3.5 h-3.5" />Scan for Alerts</>}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {["all", "Critical", "High", "Medium", "Low"].map(s => (
          <button key={s} onClick={() => setSeverityFilter(s)} style={severityFilter === s ? btnActive : btnInactive}>
            {s === "all" ? "ALL" : s.toUpperCase()}
          </button>
        ))}
        <div style={{ width: 1, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />
        {["all", ...alertTypes].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={typeFilter === t ? btnActive : btnInactive}>
            {t === "all" ? "ALL TYPES" : t}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "60px 0", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em" }}>⟳ LOADING ALERTS...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "var(--bg-surface)", border: "none", borderRadius: "var(--radius-card)", padding: "60px 24px", textAlign: "center" }}>
          <Bell style={{ width: 36, height: 36, color: "var(--text-muted)", margin: "0 auto 12px" }} />
          <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-secondary)", fontWeight: 500, marginBottom: 4 }}>No active alerts</p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Click "Scan for Alerts" to check your project data</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(alert => {
            const sev = SEVERITY_BG[alert.severity] || SEVERITY_BG.Low;
            return (
              <div key={alert.id} style={{ background: sev.bg, border: "none", borderLeft: `3px solid ${sev.border}`, borderRadius: "var(--radius-card)", overflow: "hidden", opacity: alert.is_read ? 0.60 : 1, transition: "opacity 0.2s" }}>
                <div style={{ padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <AlertTriangle style={{ width: 15, height: 15, marginTop: 2, flexShrink: 0, color: sev.border }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{alert.title}</span>
                      <StatusBadge status={alert.severity} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--bg-surface-high)", color: "var(--text-muted)", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.08em" }}>{alert.alert_type}</span>
                      {!alert.is_read && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />}
                    </div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>{alert.message}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{formatDate(alert.created_date)}</span>
                      {alert.project_name && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)" }}>· {alert.project_name}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {alert.record_type && PAGE_MAP[alert.record_type] && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(createPageUrl(PAGE_MAP[alert.record_type]))}>
                        <ExternalLink className="w-3 h-3 mr-1" />View
                      </Button>
                    )}
                    {!alert.is_read && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markRead(alert)}>Mark Read</Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs" style={{ color: "rgba(200,210,230,0.44)" }} onClick={() => dismiss(alert)}>Dismiss</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}