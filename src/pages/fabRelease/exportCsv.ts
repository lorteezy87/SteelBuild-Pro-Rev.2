import { getWorkPackageDisplayName } from "./analytics";
import { drawingPackageLabel, num, stageMeta } from "./format";
import type { EnrichedWorkPackage } from "./types";

function escapeCsv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportFabReleaseCSV(rows: EnrichedWorkPackage[], fileName = "fab-release.csv"): void {
  const headers = [
    "WP Number",
    "Name",
    "Stage",
    "Status",
    "Tons",
    "Progress",
    "Readiness",
    "Risk",
    "Crew",
    "Released Date",
    "Drawing Packages",
    "Flags",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((wp) => [
      wp.wp_number,
      getWorkPackageDisplayName(wp),
      stageMeta(wp._signals.stage).label,
      wp._signals.status,
      num(wp.tonnage).toFixed(1),
      wp._signals.progress,
      wp._signals.readinessScore,
      wp._signals.risk,
      wp.crew,
      wp.released_date,
      wp._signals.drawing.packages.map(drawingPackageLabel).join("; "),
      wp._signals.flags.map((flag) => flag.label).join("; "),
    ].map(escapeCsv).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
