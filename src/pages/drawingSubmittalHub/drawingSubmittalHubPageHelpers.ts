/**
 * Pure helpers for DrawingSubmittalHub shell (health / readiness / maps).
 * Behavior-preserving extract — page keeps queries + mutations.
 */
import { calculateDrawingHealthScore } from "@/services/drawingHealthScore";
import { computeDetailingReadiness } from "@/lib/detailingReadiness";
import { summarizeElementStatuses } from "@/services/modelElementStatus";
import { isRfiOpen } from "@/lib/entityPredicates";
import { computeRevisionImpact } from "@/lib/detailingRevisionImpact";

export type SetPackageLike = {
  key: string;
  setId?: string | null;
  parent?: unknown;
  sheets?: unknown[];
  submittals?: unknown[];
};

export function buildHealthByKey(
  setPackages: SetPackageLike[],
  rfis: unknown[],
  drawingRevisions: unknown[],
): Map<string, ReturnType<typeof calculateDrawingHealthScore>> {
  const m = new Map<string, ReturnType<typeof calculateDrawingHealthScore>>();
  for (const pkg of setPackages || []) {
    m.set(
      pkg.key,
      calculateDrawingHealthScore(pkg as never, {
        rfis: rfis as never[],
        revisions: drawingRevisions as never[],
      }),
    );
  }
  return m;
}

export function buildActiveWpById<T extends { id?: string | null; is_deleted?: boolean | null }>(
  workPackages: T[],
): Map<string, T> {
  const m = new Map<string, T>();
  for (const wp of workPackages || []) {
    if (wp && !wp.is_deleted && wp.id) m.set(String(wp.id), wp);
  }
  return m;
}

export function buildOpenRfiIds(
  rfis: Array<{ id?: string | null; is_deleted?: boolean | null; [k: string]: unknown }>,
): Set<string> {
  const s = new Set<string>();
  for (const r of rfis || []) {
    if (r && !r.is_deleted && r.id && isRfiOpen(r as never)) s.add(String(r.id));
  }
  return s;
}

type WpScheduleLike = {
  scheduled_start_date?: string | null;
  [k: string]: unknown;
};

/** Earliest-starting linked WP for a package's linked_work_package_ids. */
export function pickConstrainingWorkPackage(
  linkedWpIds: string[],
  wpById: Map<string, WpScheduleLike>,
): WpScheduleLike | null {
  let workPackage: WpScheduleLike | null = null;
  for (const id of linkedWpIds || []) {
    const wp = wpById.get(String(id));
    if (!wp) continue;
    if (
      !workPackage ||
      (wp.scheduled_start_date &&
        (!workPackage.scheduled_start_date ||
          wp.scheduled_start_date < workPackage.scheduled_start_date))
    ) {
      workPackage = wp;
    }
  }
  return workPackage;
}

export function buildReadinessByKey(
  setPackages: SetPackageLike[],
  wpById: Map<string, WpScheduleLike>,
  openRfiIds: Set<string>,
  activeProject: unknown,
): Map<string, ReturnType<typeof computeDetailingReadiness>> {
  const m = new Map<string, ReturnType<typeof computeDetailingReadiness>>();
  for (const pkg of setPackages || []) {
    const wpIds: string[] = Array.isArray((pkg.parent as { linked_work_package_ids?: string[] } | null)?.linked_work_package_ids)
      ? ((pkg.parent as { linked_work_package_ids: string[] }).linked_work_package_ids)
      : [];
    const workPackage = pickConstrainingWorkPackage(wpIds, wpById);
    m.set(
      pkg.key,
      computeDetailingReadiness({
        pkg: pkg.parent as never,
        submittals: pkg.submittals as never,
        sheets: pkg.sheets as never,
        project: activeProject as never,
        workPackage: workPackage as never,
        openRfiIds,
      }),
    );
  }
  return m;
}

export function buildModelMappingSummary(
  modelElements: unknown[],
  setPackages: SetPackageLike[],
  readinessByKey: Map<string, { scheduleRisk?: { atRisk?: boolean }; [k: string]: unknown }>,
) {
  const readinessBySetId = new Map<string, unknown>();
  const sheetSetIdByDrawingId = new Map<string, string>();
  for (const pkg of setPackages || []) {
    const r = readinessByKey.get(pkg.key);
    if (!r) continue;
    const enriched = { ...r, atRisk: r.scheduleRisk?.atRisk };
    const target = pkg.setId ? String(pkg.setId) : pkg.key;
    readinessBySetId.set(target, enriched);
    if (pkg.setId) readinessBySetId.set(pkg.key, enriched);
    for (const s of (pkg.sheets as Array<{ id?: string | null }> | undefined) || []) {
      if (s?.id) sheetSetIdByDrawingId.set(String(s.id), target);
    }
  }
  return summarizeElementStatuses(
    modelElements as never[],
    readinessBySetId as never,
    sheetSetIdByDrawingId,
  );
}

export function buildDrawingsById<T extends { id?: string | null }>(
  drawings: T[],
): Map<string, T> {
  const drawingsById = new Map<string, T>();
  for (const d of drawings || []) {
    if (d && d.id) drawingsById.set(String(d.id), d);
  }
  return drawingsById;
}

export function buildRevisionImpactFromDrawings(
  drawings: Array<{ id?: string | null }>,
  drawingRevisions: unknown[],
) {
  const drawingsById = buildDrawingsById(drawings);
  return computeRevisionImpact({
    revisions: drawingRevisions as never[],
    drawingsById: drawingsById as never,
  });
}

export function findDrawingById<T extends { id?: string | null }>(
  drawings: T[],
  compareDrawingId: string | null | undefined,
): T | null {
  if (compareDrawingId == null || compareDrawingId === "") return null;
  return (drawings || []).find((d) => String(d?.id) === String(compareDrawingId)) || null;
}

export function buildHubTabCounts(opts: {
  openItemsLength: number;
  unlinkedSubmittalItemsLength: number;
  setPackagesLength: number;
  totalSets: number;
  submittalsTotal: number;
  drawingSets: Array<{ is_deleted?: boolean | null }>;
}) {
  return {
    overview: opts.openItemsLength,
    process: opts.setPackagesLength + opts.unlinkedSubmittalItemsLength,
    drawings: opts.totalSets,
    submittals: opts.submittalsTotal,
    matrix: (opts.drawingSets || []).filter((set) => !set?.is_deleted).length,
  };
}
