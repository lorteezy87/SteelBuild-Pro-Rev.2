import type { VisibleNoteFolder } from "@/lib/noteFolders/types";

export interface ProductionNotesProject {
  id: string;
  name: string;
  project_number?: string | null;
  gc_name?: string | null;
}

export interface ProductionNoteRecord {
  id: string;
  project_id: string | null;
  project_name?: string | null;
  note_date: string;
  date_noted?: string | null;
  date_due?: string | null;
  folder_id?: string | null;
  content?: string | null;
  category?: string | null;
  is_high_priority?: boolean | null;
  is_resolved?: boolean | null;
  _optimistic?: boolean;
}

export interface ProductionNoteCreateInput {
  [key: string]: unknown;
  project_id: string;
  project_name: string;
  note_date: string;
  date_noted: string;
  folder_id: string;
  content: string;
  category: string;
  is_high_priority: boolean;
  is_resolved: boolean;
}

export type ProductionNotePatch = Partial<
  Pick<ProductionNoteRecord, "content" | "date_noted" | "date_due" | "is_high_priority">
>;

export interface ProductionNoteProjectRow {
  projectId: string;
  project: ProductionNotesProject;
  bullets: ProductionNoteRecord[];
}

export interface ProductionNotesViewModel {
  projectsById: Map<string, ProductionNotesProject>;
  projectRows: ProductionNoteProjectRow[];
  availableProjects: ProductionNotesProject[];
  totalBullets: number;
  highlightedCount: number;
}

export interface FolderJobLinkViewModel {
  folder: VisibleNoteFolder;
  jobLabels: string[];
  isGeneral: boolean;
  linkKind: "general" | "inherited" | "independent" | "root-linked";
}

export function toISODate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mostRecentTuesday(now: Date = new Date()): string {
  const date = new Date(now.getTime());
  const daysSinceTuesday = (date.getDay() - 2 + 7) % 7;
  date.setDate(date.getDate() - daysSinceTuesday);
  return toISODate(date);
}

export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day)
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase()
    .replace(",", "");
}

export function shiftDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function selectActiveFolder(
  folders: readonly VisibleNoteFolder[],
  selectedFolderId: string | null,
  generalNotesId: string | null | undefined,
): VisibleNoteFolder | null {
  return (
    folders.find((folder) => folder.id === selectedFolderId) ??
    folders.find((folder) => folder.id === generalNotesId) ??
    folders[0] ??
    null
  );
}

export function deriveProductionNotesViewModel(
  projects: readonly ProductionNotesProject[],
  notes: readonly ProductionNoteRecord[],
  projectPickerQuery: string,
): ProductionNotesViewModel {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const grouped = new Map<string, ProductionNoteRecord[]>();

  notes.forEach((note) => {
    if (!note.project_id) return;
    const bullets = grouped.get(note.project_id) ?? [];
    bullets.push(note);
    grouped.set(note.project_id, bullets);
  });

  const projectRows = Array.from(grouped.entries())
    .flatMap(([projectId, bullets]) => {
      const project = projectsById.get(projectId);
      return project ? [{ projectId, project, bullets }] : [];
    })
    .sort((left, right) => left.project.name.localeCompare(right.project.name));

  const projectsWithRows = new Set(projectRows.map((row) => row.projectId));
  const normalizedQuery = projectPickerQuery.trim().toLowerCase();
  const availableProjects = projects
    .filter((project) => !projectsWithRows.has(project.id))
    .filter(
      (project) =>
        !normalizedQuery ||
        project.name.toLowerCase().includes(normalizedQuery) ||
        (project.project_number ?? "").toLowerCase().includes(normalizedQuery),
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    projectsById,
    projectRows,
    availableProjects,
    totalBullets: notes.length,
    highlightedCount: notes.filter((note) => note.is_high_priority).length,
  };
}

export function deriveFolderJobLinkViewModels(
  folders: readonly VisibleNoteFolder[],
  projects: readonly ProductionNotesProject[],
): Map<string, FolderJobLinkViewModel> {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  return new Map(
    folders.map((folder) => {
      const jobLabels = folder.effective_project_ids
        .map((projectId) => {
          const project = projectsById.get(projectId);
          return project?.project_number || project?.name || null;
        })
        .filter((label): label is string => Boolean(label));
      const isGeneral = folder.effective_project_ids.length === 0;
      const linkKind = isGeneral
        ? "general"
        : folder.parent_folder_id == null
          ? "root-linked"
          : folder.independently_linked
            ? "independent"
            : "inherited";
      return [folder.id, { folder, jobLabels, isGeneral, linkKind }];
    }),
  );
}
