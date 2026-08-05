/** Pure helpers for Projects list report. */

export type ProjectsReportRow = {
  id: string | null | undefined;
  name: string;
  number: string;
  client: string;
  phase: string;
  health: string;
  startDate: string | null | undefined;
  targetDate: string | null | undefined;
  contractValue: number;
  pctComplete: number;
};

export function buildProjectsReportRows(input: {
  projects?: Array<Record<string, any>>;
  workPackages?: Array<{
    project_id?: string | null;
    percent_complete?: number | string | null;
  }>;
}): ProjectsReportRow[] {
  const workPackages = input.workPackages || [];
  return (input.projects || []).map((p) => {
    const pWPs = workPackages.filter((w) => w.project_id === p.id);
    const pctComplete = pWPs.length
      ? pWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) /
        pWPs.length
      : 0;
    return {
      id: p.id,
      name: p.name || "Untitled Project",
      number: p.project_number || `P-${p.id}`,
      client: p.general_contractor || p.client || "",
      phase: p.phase || "",
      health: p.health_status || "",
      startDate: p.start_date,
      targetDate: p.target_completion_date,
      contractValue: Number(p.original_contract_value) || 0,
      pctComplete,
    };
  });
}

export function filterProjectsReportRows(
  rows: ProjectsReportRow[],
  opts: {
    search?: string;
    phaseFilter?: string;
    healthFilter?: string;
  } = {},
): ProjectsReportRow[] {
  let out = rows || [];
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    out = out.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.number.toLowerCase().includes(q) ||
        r.client.toLowerCase().includes(q),
    );
  }
  if (opts.phaseFilter && opts.phaseFilter !== "all") {
    out = out.filter((r) => r.phase === opts.phaseFilter);
  }
  if (opts.healthFilter && opts.healthFilter !== "all") {
    out = out.filter((r) => r.health === opts.healthFilter);
  }
  return out;
}
