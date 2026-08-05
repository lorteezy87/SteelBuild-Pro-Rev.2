/**
 * Pure forward-look aggregations for ForwardLookDrawer.
 */
import { daysUntil } from "@/lib/commandCenter/urgencyEngine";

export const LOOK_AHEAD_DAYS = 14;

export function buildForwardLookData({ workPackages = [], deliveries = [], projectMap = {} }) {
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

