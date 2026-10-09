import { getWorkPackageDisplayName } from "./analytics";
import { drawingPackageLabel, num, stageMeta } from "./format";
import type { EnrichedWorkPackage } from "./types";
import { presentGeneratedFile } from "@/lib/native/fileExport";
import { escapeCsvCell } from "@/lib/csv";

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
    ].map(escapeCsvCell).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  void presentGeneratedFile({ blob, filename: fileName, title: "Fab release export" });
}
