import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import KPICard from "./KPICard";
import ProjectHealthTable from "./ProjectHealthTable";
import RFIStatusChart from "./RFIStatusChart";
import DeliveryScheduleCard from "./DeliveryScheduleCard";
import AlertsFeed from "./AlertsFeed";
import ActivityFeed from "./ActivityFeed";

export default function ExecutiveDashboard() {
  // Fetch all necessary data
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis"],
    queryFn: () => base44.entities.RFI.list(),
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries"],
    queryFn: () => base44.entities.Delivery.list(),
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages"],
    queryFn: () => base44.entities.WorkPackage.list(),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["action-items"],
    queryFn: () => base44.entities.ActionItem.list(),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => base44.entities.Alert.filter({ is_dismissed: false }),
  });

  // Calculate KPIs
  const activeProjects = projects.filter(
    (p) => p.phase !== "Closeout"
  ).length;

  const erectionProgress =
    workPackages.filter((w) => w.phase === "Erection").length > 0
      ? (
          (workPackages
            .filter((w) => w.phase === "Erection" && w.status === "Complete")
            .length /
            workPackages.filter((w) => w.phase === "Erection").length) *
          100
        ).toFixed(0)
      : 0;

  const openRFIs = rfis.filter((r) => r.status === "Open" || r.status === "Under Review").length;

  const overdueActions = tasks.filter(
    (t) => t.status !== "Complete" && new Date(t.due_date) < new Date()
  ).length;

  const deliveriesThisWeek = deliveries.filter((d) => {
    const dDate = new Date(d.scheduled_date);
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return dDate >= now && dDate <= weekEnd;
  }).length;

  const kpis = [
    {
      label: "Active Projects",
      value: activeProjects,
      icon: "◆",
      color: "var(--accent)",
    },
    {
      label: "Erection Progress",
      value: `${erectionProgress}%`,
      icon: "▲",
      color: "var(--status-success)",
    },
    {
      label: "Open RFIs",
      value: openRFIs,
      icon: "⚑",
      color: openRFIs > 5 ? "var(--status-warning)" : "var(--accent)",
      urgent: openRFIs > 5,
    },
    {
      label: "Overdue Tasks",
      value: overdueActions,
      icon: "⏱",
      color: overdueActions > 0 ? "var(--status-error)" : "var(--status-success)",
      urgent: overdueActions > 0,
    },
    {
      label: "Deliveries This Week",
      value: deliveriesThisWeek,
      icon: "📦",
      color: "var(--status-info)",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Header */}
      <div>
        <h1 style={{
          fontFamily: "var(--font-mono)",
          fontSize: 24,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}>
          Executive Dashboard
        </h1>
        <p style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          marginTop: 4,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}>
          Portfolio Overview & Key Metrics
        </p>
      </div>

      {/* KPI Strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "12px",
      }}>
        {kpis.map((kpi) => (
          <KPICard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Main Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: "16px",
        gridTemplateRows: "auto auto",
      }}>
        {/* Project Health (full width top) */}
        <div style={{ gridColumn: "1 / -1" }}>
          <ProjectHealthTable projects={projects} workPackages={workPackages} rfis={rfis} />
        </div>

        {/* RFI Status */}
        <div>
          <RFIStatusChart rfis={rfis} />
        </div>

        {/* Alerts Feed */}
        <div>
          <AlertsFeed alerts={alerts.slice(0, 5)} />
        </div>

        {/* Delivery Schedule */}
        <div>
          <DeliveryScheduleCard deliveries={deliveries.slice(0, 5)} />
        </div>

        {/* Activity Feed */}
        <div style={{ gridColumn: "1 / -1" }}>
          <ActivityFeed limit={8} />
        </div>
      </div>
    </div>
  );
}