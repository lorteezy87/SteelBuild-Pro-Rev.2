import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PlannerApp from "@planner/app/PlannerApp";
import "@planner/styles/planner.css";

function registerPlannerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const approvedHosts = (import.meta.env.VITE_PLANNER_PWA_HOSTNAMES ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (!approvedHosts.includes(window.location.hostname.toLowerCase())) return;
  void navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

registerPlannerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlannerApp />
  </StrictMode>,
);
