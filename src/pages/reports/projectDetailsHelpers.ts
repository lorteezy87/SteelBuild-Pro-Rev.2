/** Pure helpers for Project Details report. */

export function findProjectById<T extends { id?: string | number | null }>(
  projects: T[],
  selectedId: string | null | undefined,
): T | undefined {
  if (!selectedId) return undefined;
  return (projects || []).find((p) => String(p.id) === String(selectedId));
}

export function filterByProjectId<T extends { project_id?: string | null }>(
  rows: T[],
  projectId: string | null | undefined,
): T[] {
  if (!projectId) return [];
  return (rows || []).filter((r) => r.project_id === projectId);
}

export type ProjectDetailKpis = {
  openRFIs: number;
  pendingCOs: number;
  openActions: number;
  wpComplete: number;
  wpPct: number;
  totalExpenses: number;
};

export function computeProjectDetailKpis(input: {
  projectRFIs: unknown[];
  projectCOs: unknown[];
  projectActions: unknown[];
  projectWPs: unknown[];
  projectExpenses: Array<{ payment_status?: string | null; amount?: number | string | null }>;
  isRfiOpen: (r: any) => boolean;
  isCoPending: (c: any) => boolean;
  isActionItemOpen: (a: any) => boolean;
  isWpComplete: (w: any) => boolean;
}): ProjectDetailKpis {
  const {
    projectRFIs,
    projectCOs,
    projectActions,
    projectWPs,
    projectExpenses,
    isRfiOpen,
    isCoPending,
    isActionItemOpen,
    isWpComplete,
  } = input;

  const openRFIs = (projectRFIs || []).filter(isRfiOpen).length;
  const pendingCOs = (projectCOs || []).filter(isCoPending).length;
  const openActions = (projectActions || []).filter(isActionItemOpen).length;
  const wpComplete = (projectWPs || []).filter(isWpComplete).length;
  const wpPct = projectWPs.length ? (wpComplete / projectWPs.length) * 100 : 0;
  const totalExpenses = (projectExpenses || [])
    .filter((e) => e.payment_status !== "Voided")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return { openRFIs, pendingCOs, openActions, wpComplete, wpPct, totalExpenses };
}

/** First project id for auto-select when URL has none. */
export function resolveDefaultProjectId(
  selectedId: string | null | undefined,
  projects: Array<{ id?: string | number | null }>,
): string | null {
  if (selectedId) return null;
  if (!projects?.length) return null;
  return String(projects[0].id);
}
