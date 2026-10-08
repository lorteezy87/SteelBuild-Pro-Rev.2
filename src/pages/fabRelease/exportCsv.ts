import { getWorkPackageDisplayName } from "./analytics";
import { drawingPackageLabel, num, stageMeta } from "./format";
import type { EnrichedWorkPackage } from "./types";
import { presentGeneratedFile } from "@/lib/native/fileExport";

function escapeCsv(value: unknown): string {
  const raw = String(value ?? "");
  // Spreadsheet applications execute leading =, +, -, and @ as formulas.
  // A leading apostrophe preserves the displayed value as literal text.
  const text = /^[\s\uFEFF]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
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
    "Release Verification",
    "Release Blockers",
    "Advisory Planning Score",
    "Advisory Risk",
    "Crew",
    "WP Release Stamp",
    "WP Drawing Packages (Advisory)",
    "Advisory Risk Markers",
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
      wp._signals.releaseGateState === "ready" ? "Release verified"
        : wp._signals.releaseGateState === "blocked" ? "Release blocked"
          : wp._signals.releaseGateState === "released" ? "Release recorded" : "Not verified",
      wp._signals.releaseGate?.blockers?.join("; ") || "",
      wp._signals.readinessScore,
      wp._signals.risk,
      wp.crew,
      wp.released_date,
      wp._signals.drawing.packages.map(drawingPackageLabel).join("; "),
      wp._signals.flags.map((flag) => flag.label).join("; "),
    ].map(escapeCsv).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  void presentGeneratedFile({ blob, filename: fileName, title: "Fab release export" });
}
