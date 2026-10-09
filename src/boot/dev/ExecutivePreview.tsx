/**
 * Development-only acceptance fixture using the actual executive dashboard.
 * Synthetic records only; disabled piece reporting; no authenticated backend.
 * This HTML entry is not a production build input.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "@/components/shared/ThemeContext";
import DashboardControlCenter from "@/pages/dashboardCC/DashboardControlCenter";
import { resolveDashboardNavigation } from "@/pages/dashboardCC/dashboardNavigation";
import "@/globals.css";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const project = {
  id: "executive-fixture", name: "Northline Distribution Center",
  piece_control_mode: "off", health_status: "Watch",
  original_contract_value: 2400000,
  start_date: "2026-06-01", target_completion_date: "2026-12-18", percent_complete: 56,
};
const rfis = Array.from({ length: 11 }, (_, index) => ({
  id: `fixture-rfi-${index}`, project_id: project.id, rfi_number: `RFI-${101 + index}`,
  title: index === 0 ? "Grid C4 brace connection" : `Steel connection clarification ${index + 1}`,
  status: "Open", date_required: "2026-10-05", ball_in_court: "EOR",
  schedule_impact: true, updated_at: "2026-10-05T16:00:00Z",
}));

function ExecutivePreview() {
  const { theme, toggleTheme } = useTheme();
  const [opened, setOpened] = useState("");
  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: 16, flexWrap: "wrap" }}>
        <span>Development fixture · synthetic project records</span>
        <button type="button" onClick={toggleTheme}>Switch to {theme === "dark" ? "light" : "dark"} mode</button>
        <output aria-label="Opened workspace">{opened}</output>
      </div>
      <DashboardControlCenter project={project} rfis={rfis} todayIso="2026-10-06"
        wps={[{ id: "wp-a", wp_number: "WP-012", title: "East bay columns", status: "On Hold" }]}
        submittals={[{ id: "sub-a", submittal_number: "SUB-014", title: "Roof framing package", status: "Submitted", required_date: "2026-10-07", ball_in_court: "EOR" }]}
        deliveries={[{ id: "load-a", description: "East bay erection load", status: "Delayed", scheduled_date: "2026-10-05" }]}
        cos={[{ id: "co-a", co_number: "CO-008", title: "Added connection plates", status: "Submitted", submitted_date: "2026-08-28", co_amount: 48000 }]}
        codes={[{ id: "cost-a", budget_amount: 1800000, committed_cost: 1200000, actual_cost: 980000 }]}
        scheduleTasks={[{ id: "task-a", project_id: project.id, task_name: "Erect east bay columns", status: "In Progress", percent_complete: 56, start_date: "2026-10-01", end_date: "2026-10-15" }]}
        onNavigate={(target, options) => setOpened(resolveDashboardNavigation(target, options) ?? "Unavailable route")}
      />
    </main>
  );
}

if (import.meta.env.DEV) {
  const root = document.getElementById("root");
  if (root) createRoot(root).render(
    <QueryClientProvider client={client}><ThemeProvider><ExecutivePreview /></ThemeProvider></QueryClientProvider>,
  );
}
