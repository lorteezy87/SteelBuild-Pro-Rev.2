/** Pure helpers for Portfolio Tracker report. */

export type TrackerRow = {
  id: string | null | undefined;
  name: string;
  number: string;
  client: string;
  phase: string;
  health: string;
  jobType: string;
  startDate: string | null;
  targetDate: string | null;
  contractValue: number;
  committed: number;
  pctComplete: number;
  raw: Record<string, unknown>;
};

export function buildPortfolioTrackerRows(input: {
  projects: Array<Record<string, any>>;
  workPackages: Array<{ project_id?: string | null; percent_complete?: number | string | null }>;
  expenses: Array<{
    project_id?: string | null;
    payment_status?: string | null;
    amount?: number | string | null;
  }>;
}): TrackerRow[] {
  const { projects, workPackages, expenses } = input;
  return (projects || []).map((p) => {
    const pWPs = (workPackages || []).filter((w) => w.project_id === p.id);
    const pctComplete = pWPs.length
      ? pWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / pWPs.length
      : 0;
    const committed = (expenses || [])
      .filter((e) => e.project_id === p.id && e.payment_status !== "Voided")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return {
      id: p.id,
      name: p.name || "Untitled Project",
      number: p.project_number || `P-${p.id}`,
      client: p.general_contractor || p.client || "",
      phase: p.phase || "",
      health: p.health_status || "",
      jobType: p.job_type || "",
      startDate: p.start_date || null,
      targetDate: p.target_completion_date || null,
      contractValue: Number(p.original_contract_value) || 0,
      committed,
      pctComplete,
      raw: p,
    };
  });
}

export function filterPortfolioTrackerRows(
  rows: TrackerRow[],
  opts: {
    search?: string;
    phaseFilter?: string;
    healthFilter?: string;
    jobTypeFilter?: string;
  },
): TrackerRow[] {
  let out = rows || [];
  const q = (opts.search || "").trim().toLowerCase();
  if (q) {
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
  if (opts.jobTypeFilter && opts.jobTypeFilter !== "all") {
    out = out.filter((r) => r.jobType === opts.jobTypeFilter);
  }
  return out;
}
