/**
 * Pure helpers for Projects list page shell.
 */

export function filterProjectsList<
  T extends {
    name?: string | null;
    project_number?: string | null;
    client?: string | null;
    general_contractor?: string | null;
    phase?: string | null;
    health_status?: string | null;
    job_type?: string | null;
  },
>(
  projects: T[] | null | undefined,
  opts: {
    search?: string;
    phaseFilter?: string;
    healthFilter?: string;
    jobTypeFilter?: string;
  } = {},
): T[] {
  const q = (opts.search || "").toLowerCase();
  const phaseFilter = opts.phaseFilter ?? "all";
  const healthFilter = opts.healthFilter ?? "all";
  const jobTypeFilter = opts.jobTypeFilter ?? "all";
  return (projects || []).filter((p) => {
    const matchSearch =
      !q
      || p.name?.toLowerCase().includes(q)
      || p.project_number?.toLowerCase().includes(q)
      || p.client?.toLowerCase().includes(q)
      || p.general_contractor?.toLowerCase().includes(q);
    return (
      matchSearch
      && (phaseFilter === "all" || p.phase === phaseFilter)
      && (healthFilter === "all" || p.health_status === healthFilter)
      && (jobTypeFilter === "all" || p.job_type === jobTypeFilter)
    );
  });
}
