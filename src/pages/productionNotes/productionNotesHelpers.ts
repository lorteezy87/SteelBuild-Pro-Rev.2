/**
 * Pure helpers for Production Notes page.
 */

export function toISODate(d: Date | string | number): string {
  const dt = d instanceof Date ? d : new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Default meeting date = the most recent Tuesday on or before today.
 * (User runs the meeting on Tuesdays per the OneNote example "4/21/2026"
 * which was a Tuesday.)
 */
export function mostRecentTuesday(now: Date = new Date()): string {
  const today = new Date(now);
  const dow = today.getDay(); // 0 = Sun, 2 = Tue
  const diff = (dow - 2 + 7) % 7;
  today.setDate(today.getDate() - diff);
  return toISODate(today);
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .toUpperCase()
    .replace(",", "");
}

export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISODate(dt);
}

export function indexProjectsById<T extends { id?: string }>(
  projects: T[] | null | undefined,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const p of projects || []) {
    if (p?.id) map.set(p.id, p);
  }
  return map;
}

export type NoteLike = {
  project_id?: string | null;
  [k: string]: unknown;
};

export type ProjectLike = {
  id?: string;
  name?: string | null;
  project_number?: string | null;
  [k: string]: unknown;
};

export type ProjectNoteRow<P extends ProjectLike = ProjectLike, N extends NoteLike = NoteLike> = {
  projectId: string;
  project: P;
  bullets: N[];
};

/** Group notes by project, drop orphan projects, sort by project name. */
export function buildProjectNoteRows<P extends ProjectLike, N extends NoteLike>(
  notes: N[],
  projectsById: Map<string, P>,
): ProjectNoteRow<P, N>[] {
  const grouped = new Map<string, N[]>();
  for (const n of notes || []) {
    if (!n.project_id) continue;
    if (!grouped.has(n.project_id)) grouped.set(n.project_id, []);
    grouped.get(n.project_id)!.push(n);
  }
  return Array.from(grouped.entries())
    .map(([projectId, bullets]) => ({
      projectId,
      project: projectsById.get(projectId) as P,
      bullets,
    }))
    .filter((r) => r.project)
    .sort((a, b) => (a.project?.name || "").localeCompare(b.project?.name || ""));
}

export function projectIdsWithRows(
  projectRows: Array<{ projectId: string }>,
): Set<string> {
  return new Set((projectRows || []).map((r) => r.projectId));
}

/** Projects not yet on the note sheet, filtered by picker query, name-sorted. */
export function filterAvailableProjects<P extends ProjectLike>(
  projects: P[],
  projectsWithRows: Set<string>,
  projectPickerQuery: string,
): P[] {
  const q = (projectPickerQuery || "").trim().toLowerCase();
  return (projects || [])
    .filter((p) => p.id && !projectsWithRows.has(p.id))
    .filter(
      (p) =>
        !q ||
        (p.name || "").toLowerCase().includes(q) ||
        (p.project_number || "").toLowerCase().includes(q),
    )
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export function countHighlightedNotes<T extends { is_high_priority?: boolean | null }>(
  notes: T[],
): number {
  return (notes || []).filter((n) => n.is_high_priority).length;
}

