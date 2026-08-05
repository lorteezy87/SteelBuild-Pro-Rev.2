import { GANTT_PHASE_HEX, GANTT_STATUS_HEX } from "@/lib/ganttTheme";
/**
 * Pure zone derivation and health for SiteMapView.
 */

export type ZoneWp = {
  name?: string | null;
  status?: string | null;
  percent_complete?: number | string | null;
  linked_drawing_ids?: string | null;
  wp_number?: string | null;
  [key: string]: unknown;
};

export type Zone = { label: string; wps: ZoneWp[] };

export type ZoneIssue = { type: string; label: string; wp: ZoneWp };

/** Derive zones from WP names by extracting prefixes/keywords. */
export function deriveZones(wps: ZoneWp[] | null | undefined): Zone[] {
  const zoneMap: Record<string, Zone> = {};

  (wps || []).forEach((wp) => {
    let zone = "General";
    const name = wp.name || "";

    const patterns = [
      /\b(level\s*\d+[a-z]?)/i,
      /\b(floor\s*\d+[a-z]?)/i,
      /\b(bay\s*[a-z0-9]+)/i,
      /\b(grid\s*[a-z0-9]+)/i,
      /\b(zone\s*[a-z0-9]+)/i,
      /\b(col(?:umn)?\s*line\s*[a-z0-9]+)/i,
      /\b(bldg\s*[a-z0-9]+)/i,
      /\b(building\s*[a-z0-9]+)/i,
      /\b(area\s*[a-z0-9]+)/i,
      /\b(phase\s*\d+)/i,
      /\b(section\s*[a-z0-9]+)/i,
    ];

    for (const pat of patterns) {
      const m = name.match(pat);
      if (m) {
        zone = m[1].trim();
        break;
      }
    }

    if (zone === "General") {
      const words = name.split(/[\s\-_/]+/).filter(Boolean);
      if (words.length >= 2) {
        zone = `${words[0]} ${words[1]}`;
      } else if (words.length === 1) {
        zone = words[0];
      }
    }

    zone = zone.replace(/\s+/g, " ").trim();

    if (!zoneMap[zone]) {
      zoneMap[zone] = { label: zone, wps: [] };
    }
    zoneMap[zone].wps.push(wp);
  });

  return Object.values(zoneMap);
}

export function zoneHealth(zone: Zone) {
  const { wps } = zone;
  if (!wps.length) return { color: "var(--bg-surface-high)", label: "Empty", issues: [] as ZoneIssue[] };

  const onHold = wps.filter((w) => w.status === "On Hold");
  const noDrawings = wps.filter(
    (w) => !(w.linked_drawing_ids || "").split(",").some((s) => s.trim()),
  );
  const inProgress = wps.filter((w) => w.status === "In Progress");
  const complete = wps.filter((w) => w.status === "Complete");
  const avgProgress =
    wps.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / wps.length;

  const issues: ZoneIssue[] = [
    ...onHold.map((w) => ({ type: "hold", label: `${w.wp_number} On Hold`, wp: w })),
    ...noDrawings.map((w) => ({ type: "warn", label: `${w.wp_number} No Drawings`, wp: w })),
  ];

  let color: string;
  let label: string;
  if (onHold.length > 0) {
    color = "rgba(255,61,61,0.18)";
    label = "Blocked";
  } else if (noDrawings.length > 0) {
    color = "rgba(255,179,0,0.15)";
    label = "Warning";
  } else if (complete.length === wps.length) {
    color = "rgba(0,214,143,0.15)";
    label = "Complete";
  } else if (inProgress.length > 0) {
    color = "var(--warning-muted)";
    label = "Active";
  } else {
    color = "var(--info-muted)";
    label = "Planned";
  }

  return { color, label, issues, avgProgress, onHold, inProgress, complete, noDrawings };
}

export function summarizeZoneHealth(zones: Zone[]) {
  return {
    totalIssues: zones.reduce((s, z) => s + zoneHealth(z).issues.length, 0),
    activeZones: zones.filter((z) => zoneHealth(z).label === "Active").length,
    blockedZones: zones.filter((z) => zoneHealth(z).label === "Blocked").length,
    completeZones: zones.filter((z) => zoneHealth(z).label === "Complete").length,
  };
}

export const PHASE_COLOR: Record<string, string> = {
  Detailing: GANTT_PHASE_HEX.Detailing,
  Fabrication: GANTT_PHASE_HEX.Fabrication,
  Delivery: GANTT_PHASE_HEX.Delivery,
  Erection: GANTT_PHASE_HEX.Erection,
};

export const STATUS_COLOR: Record<string, string> = {
  Complete: GANTT_STATUS_HEX.complete,
  "In Progress": GANTT_STATUS_HEX.inProgress,
  "On Hold": GANTT_STATUS_HEX.delayed,
  "Not Started": GANTT_STATUS_HEX.notStarted,
};

/** Mono font style merge for SiteMapView chrome. */
export function siteMapMono(
  style: Record<string, string | number> = {},
): Record<string, string | number> {
  return { fontFamily: "var(--font-mono)", ...style };
}

