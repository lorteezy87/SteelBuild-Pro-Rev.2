/** Pure readiness copy + CSV export rows for PieceControlPilotReadiness. */

export function presentReadinessText(value: string): string {
  if (/^No active actionable canonical piece scope$/i.test(value)) {
    return "No active pieces are in the Piece Register";
  }
  if (
    /^Canonical station configuration must contain six stations totaling 100 percent$/i.test(
      value,
    )
  ) {
    return "Fabrication station setup must contain six stations totaling 100 percent";
  }
  return value
    .replaceAll("_", " ")
    .replace(
      /\bcanonical versus legacy\b/gi,
      "Piece Register versus existing production records",
    )
    .replace(/\bcanonical release gate\b/gi, "fabrication release checks")
    .replace(/\bcanonical piece scope\b/gi, "Piece Register scope")
    .replace(/\bcanonical\b/gi, "Piece Register")
    .replace(/\blegacy\b/gi, "existing production records")
    .replace(/\bbefore pilot\b/gi, "for Pilot workflow")
    .replace(/\bbefore live mode\b/gi, "for Live workflow")
    .replace(/\bpilot transition\b/gi, "Pilot workflow")
    .replace(/\blive transition\b/gi, "Live workflow");
}

export type PilotReadinessReport = {
  metrics: Record<string, unknown>;
  data_quality_warnings: string[];
  hard_release_blockers: string[];
  pilot_transition_blockers: string[];
  live_transition_blockers: string[];
};

export function buildPilotReadinessExportRows(
  report: PilotReadinessReport | null | undefined,
): Array<[string, string, unknown]> {
  if (!report) return [];
  return [
    ...Object.entries(report.metrics).map(([metric, value]) => [
      "Metric",
      presentReadinessText(metric),
      value,
    ] as [string, string, unknown]),
    ...report.data_quality_warnings.map(
      (warning) =>
        ["Data quality warning", presentReadinessText(warning), ""] as [
          string,
          string,
          unknown,
        ],
    ),
    ...report.hard_release_blockers.map(
      (blocker) =>
        ["Hard release blocker", presentReadinessText(blocker), ""] as [
          string,
          string,
          unknown,
        ],
    ),
    ...report.pilot_transition_blockers.map(
      (blocker) =>
        [
          presentReadinessText("Pilot transition blocker"),
          presentReadinessText(blocker),
          "",
        ] as [string, string, unknown],
    ),
    ...report.live_transition_blockers.map(
      (blocker) =>
        [
          presentReadinessText("Live transition blocker"),
          presentReadinessText(blocker),
          "",
        ] as [string, string, unknown],
    ),
  ];
}
