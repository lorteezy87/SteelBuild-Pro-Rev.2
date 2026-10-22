/**
 * Where a global-search hit opens. A record hit must open the RECORD, in ITS
 * project: the bare register for the active project hides a hit from another
 * project entirely and leaves the user to find the row again.
 *
 * Each page reads its own record parameter (see useAutoOpenEdit callers):
 * RFIs and WorkPackages read `id`, ChangeOrders and Projects read `recordId`,
 * DrawingViewer reads `recordId`. ProjectScopedRoute switches the active
 * project from `projectId` before the page consumes the record parameter.
 */
export interface SearchHit {
  type: string;
  id?: string | null;
  page: string;
  projectId?: string | null;
}

const RECORD_PARAM: Readonly<Record<string, { page: string; param: string } | undefined>> = {
  RFI: { page: "RFIs", param: "id" },
  WorkPackage: { page: "WorkPackages", param: "id" },
  ChangeOrder: { page: "ChangeOrders", param: "recordId" },
  Project: { page: "Projects", param: "recordId" },
  // Shop-drawing sheets (entities.Drawing) live in the viewer, not Documents.
  Drawing: { page: "DrawingViewer", param: "recordId" },
};

export function searchResultHref(hit: SearchHit): string {
  const target = RECORD_PARAM[hit.type];
  if (!target || !hit.id) return `/${hit.page}`;
  const qs = new URLSearchParams();
  qs.set(target.param, hit.id);
  if (hit.projectId && hit.type !== "Project") qs.set("projectId", hit.projectId);
  return `/${target.page}?${qs.toString()}`;
}
