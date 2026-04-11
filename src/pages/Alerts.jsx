import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, RefreshCw, CheckCheck, ExternalLink, AlertTriangle, Loader2 } from "lucide-react";
import { formatDate } from "../components/shared/formatters";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { batchProcess } from "@/utils/batchProcess";

const SEV_COLORS = {
  Critical: "bg-rose-50 border-rose-300 border-l-4 border-l-rose-500",
  High:     "bg-orange-50 border-orange-200 border-l-4 border-l-orange-400",
  Medium:   "bg-amber-50 border-amber-200 border-l-4 border-l-amber-400",
  Low:      "bg-slate-50 border-default border-l-4 border-l-slate-400",
};
const SEV_BADGE = {
  Critical: "bg-rose-100 text-rose-700",
  High:     "bg-orange-100 text-orange-700",
  Medium:   "bg-amber-100 text-amber-700",
  Low:      "bg-slate-100 text-slate-600",
};
const RECORD_PAGE = {
  RFI: "RFIs",
  Drawing: "Drawings",
  ChangeOrder: "ChangeOrders",
  Delivery: "Deliveries",
  WorkPackage: "WorkPackages",
};

export default function Alerts() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState("unread");

  const { data: alerts = [], isLoading, refetch } = useQuery({
    queryKey: ["alerts", projectId],
    queryFn: () => projectId
      ? base44.entities.Alert.filter({ project_id: projectId }, "-created_at")
      : base44.entities.Alert.list("-created_at"),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Alert.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Alert.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const markRead = (alert, e) => {
    e?.stopPropagation();
    updateMut.mutate({ id: alert.id, data: { ...alert, is_read: true } });
  };
  const markAllRead = async () => {
    const unread = alerts.filter(a => !a.is_read);
    try {
      const { succeeded, failed } = await batchProcess(
        unread,
        (a) => base44.entities.Alert.update(a.id, { is_read: true }),
      );
      qc.invalidateQueries({ queryKey: ["alerts"] });
      if (failed.length > 0) {
        toast.warning(`${succeeded.length} marked as read, ${failed.length} failed`);
      } else {
        toast.success(`${succeeded.length} alerts marked as read`);
      }
    } catch (err) {
      toast.error("Some alerts failed to update");
    }
  };
  const dismiss = (alert, e) => {
    e?.stopPropagation();
    updateMut.mutate({ id: alert.id, data: { ...alert, is_dismissed: true } });
  };

  const generateAlerts = async () => {
    setGenerating(true);
    try {
      await base44.functions.invoke("generateAlerts", {});
      await refetch();
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const visible = alerts.filter(a => {
    if (a.is_dismissed) return false;
    if (filter === "unread") return !a.is_read;
    if (filter === "read") return a.is_read;
    return true;
  });

  const unreadCount = alerts.filter(a => !a.is_read && !a.is_dismissed).length;

  const navigateTo = (alert) => {
    const page = RECORD_PAGE[alert.record_type];
    if (page) window.location.href = createPageUrl(page);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-primary">Alerts</h1>
            {unreadCount > 0 && (
              <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount}</span>
            )}
          </div>
          <p className="text-sm text-muted">{alerts.filter(a => !a.is_dismissed).length} active alerts</p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}><CheckCheck className="w-3.5 h-3.5 mr-1" />Mark All Read</Button>
          )}
          <Button size="sm" onClick={generateAlerts} disabled={generating} className="bg-slate-900 hover:bg-slate-800">
            {generating ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Scanning...</> : <><RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh Alerts</>}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {["Critical","High","Medium","Low"].map(sev => {
          const count = alerts.filter(a => a.severity === sev && !a.is_dismissed).length;
          return (
            <div key={sev} className={`rounded-lg border p-3 text-center ${SEV_COLORS[sev] || ""}`}>
              <p className="text-2xl font-bold text-primary">{count}</p>
              <p className={`text-xs font-semibold mt-0.5 ${SEV_BADGE[sev]?.replace("bg-", "text-").replace("-100", "-700") || ""}`}>{sev}</p>
            </div>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-default">
        {[["all","All"], ["unread","Unread"], ["read","Read"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ padding: "8px 16px", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", background: "transparent", border: "none", borderBottom: `2px solid ${filter === v ? "var(--accent)" : "transparent"}`, color: filter === v ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", transition: "all 0.15s" }}>{l}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center" style={{background:"var(--bg-surface)",borderColor:"var(--border-default)"}}>
          <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-muted font-medium">{filter === "unread" ? "All caught up!" : "No alerts"}</p>
          <p className="text-slate-400 text-sm mt-1">Click "Refresh Alerts" to scan for new issues</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(alert => (
            <div key={alert.id} className={`rounded-xl border p-4 transition-all ${SEV_COLORS[alert.severity] || "bg-white border-default"} ${alert.is_read ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-4">
                <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${alert.severity === "Critical" ? "text-rose-500" : alert.severity === "High" ? "text-orange-500" : "text-amber-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-semibold text-primary">{alert.title}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${SEV_BADGE[alert.severity] || ""}`}>{alert.severity}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface/70 text-muted border border-default">{alert.alert_type}</span>
                    {alert.project_name && <span className="text-[10px] text-slate-400">{alert.project_name}</span>}
                  </div>
                  <p className="text-sm text-slate-600">{alert.message}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatDate(alert.created_date)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {RECORD_PAGE[alert.record_type] && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-400" onClick={() => navigateTo(alert)}>
                      <ExternalLink className="w-3 h-3 mr-1" />View
                    </Button>
                  )}
                  {!alert.is_read && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={e => markRead(alert, e)}>
                      <CheckCheck className="w-3 h-3 mr-1" />Read
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-300" onClick={e => dismiss(alert, e)}>
                    <BellOff className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}