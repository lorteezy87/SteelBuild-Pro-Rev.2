/**
 * Pure CPI health rows for TrueHealthChart.
 */

export type TrueHealthWp = {
  project_id?: string | null;
  budgeted_labor_value?: number | string | null;
  budgeted_material_value?: number | string | null;
  percent_complete?: number | string | null;
  actual_labor_cost_to_date?: number | string | null;
  actual_material_cost_to_date?: number | string | null;
};

export type TrueHealthProject = {
  id?: string | null;
  project_number?: string | null;
  name?: string | null;
  original_budget_at_completion?: number | string | null;
};

export function buildTrueHealthRows(
  projects: TrueHealthProject[] | null | undefined,
  wps: TrueHealthWp[] | null | undefined,
) {
  const list = wps || [];
  return (projects || []).map((p) => {
    const projectWPs = list.filter((wp) => wp.project_id === p.id);

    const bac = projectWPs.reduce(
      (s, wp) =>
        s
        + (Number(wp.budgeted_labor_value) || 0)
        + (Number(wp.budgeted_material_value) || 0),
      0,
    );

    const effectiveBac = bac > 0 ? bac : (Number(p.original_budget_at_completion) || 0);

    const ev = projectWPs.reduce((s, wp) => {
      const wpBac =
        (Number(wp.budgeted_labor_value) || 0)
        + (Number(wp.budgeted_material_value) || 0);
      return s + wpBac * ((Number(wp.percent_complete) || 0) / 100);
    }, 0);

    const ac = projectWPs.reduce(
      (s, wp) =>
        s
        + (Number(wp.actual_labor_cost_to_date) || 0)
        + (Number(wp.actual_material_cost_to_date) || 0),
      0,
    );

    const cpi = ac > 0 ? ev / ac : null;
    const acColor =
      cpi == null
        ? "var(--text-muted)"
        : cpi >= 1
          ? "var(--status-success)"
          : cpi >= 0.9
            ? "var(--status-warning)"
            : "var(--status-error)";

    return {
      name: p.project_number || p.name?.slice(0, 10),
      fullName: p.name,
      bac: effectiveBac,
      ev,
      ac,
      cpi,
      acColor,
    };
  }).filter((d) => d.bac > 0 || d.ev > 0 || d.ac > 0);
}
