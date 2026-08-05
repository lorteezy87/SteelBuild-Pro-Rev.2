import React, { useState, useMemo } from "react";
import { CheckCheck, RefreshCw, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAlerts } from "@/hooks/useAlerts";
import { CommandBar } from "@/components/design-system";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import {
  filterAlerts,
  uniqueAlertTypes,
} from "./alertsCenter/alertsCenterPageHelpers";
import {
  AlertsFilterBar,
  AlertsErrorState,
  AlertsEmptyState,
  AlertCard,
} from "./alertsCenter/AlertsCenterUi";

export default function AlertsCenter() {
  const navigate = useNavigate();
  const {
    alerts,
    isLoading,
    isError,
    error,
    refetch,
    generating,
    unreadCount,
    markRead,
    markAllRead,
    dismiss,
    generateAlerts,
  } = useAlerts();

  const [severityFilter, setSeverityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(
    () => filterAlerts(alerts, { severityFilter, typeFilter }),
    [alerts, severityFilter, typeFilter],
  );

  const alertTypes = useMemo(() => uniqueAlertTypes(alerts), [alerts]);

  return (
    <div className="sb-dashboard-reference-page">
      <CommandBar
        eyebrow="NOTIFICATIONS"
        title="Alerts & Notifications"
        count={filtered.length}
        unit=" · ACTIVE"
        subtitle={`${unreadCount} unread · cross-entity scanner · RFI / Drawing / CO / Delivery / WP triggers`}
      >
        <button
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="sbd-btn"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            color: unreadCount === 0 ? "var(--text-muted)" : "var(--text-secondary)",
            padding: "8px 12px",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", cursor: unreadCount === 0 ? "not-allowed" : "pointer",
            textTransform: "uppercase", opacity: unreadCount === 0 ? 0.5 : 1,
          }}
        >
          <CheckCheck className="w-3 h-3" /> Mark All Read
        </button>
        <button
          onClick={generateAlerts}
          disabled={generating}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)", color: "var(--bg-base)", border: "none",
            borderRadius: "var(--radius-btn)", padding: "8px 14px",
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", cursor: generating ? "not-allowed" : "pointer",
            textTransform: "uppercase", opacity: generating ? 0.7 : 1,
          }}
          onMouseEnter={(e) => !generating && (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => !generating && (e.currentTarget.style.background = "var(--accent)")}
        >
          {generating
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Refreshing...</>
            : <><RefreshCw className="w-3 h-3" /> Refresh</>}
        </button>
      </CommandBar>

      <AlertsFilterBar
        severityFilter={severityFilter}
        typeFilter={typeFilter}
        alertTypes={alertTypes}
        onSeverityFilter={setSeverityFilter}
        onTypeFilter={setTypeFilter}
      />

      {isLoading ? (
        <LoadingSkeleton variant="table" rows={6} />
      ) : isError ? (
        <AlertsErrorState
          errorMessage={toUserErrorMessage(error, "Something went wrong. Try again.")}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <AlertsEmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onOpen={(a, path) => {
                markRead(a);
                navigate(path);
              }}
              onMarkRead={markRead}
              onDismiss={dismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
