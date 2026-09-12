import { describe, expect, it } from "vitest";
import type { VisibleNoteFolder } from "@/lib/noteFolders/types";
import {
  deriveFolderJobLinkViewModels,
  deriveProductionNotesViewModel,
  mostRecentTuesday,
  selectActiveFolder,
  shiftDate,
  type ProductionNoteRecord,
  type ProductionNotesProject,
} from "../productionNotesDerive";

const projects: ProductionNotesProject[] = [
  { id: "b", name: "Bravo", project_number: "200" },
  { id: "a", name: "Alpha", project_number: "100" },
  { id: "c", name: "Charlie", project_number: "300" },
];

const notes: ProductionNoteRecord[] = [
  {
    id: "n1",
    project_id: "b",
    note_date: "2026-09-08",
    content: "Second",
    is_high_priority: true,
  },
  {
    id: "n2",
    project_id: "a",
    note_date: "2026-09-08",
    content: "First",
    is_high_priority: false,
  },
  {
    id: "n3",
    project_id: "missing",
    note_date: "2026-09-08",
    content: "Deleted project",
  },
  {
    id: "n4",
    project_id: null,
    note_date: "2026-09-08",
    content: "Unassigned",
  },
];

const folder = (
  id: string,
  partial: Partial<VisibleNoteFolder> = {},
): VisibleNoteFolder => ({
  id,
  org_id: "org-1",
  parent_folder_id: null,
  name: id,
  link_mode: "independent",
  is_system: false,
  version: 1,
  created_by: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  archived_at: null,
  archived_by: null,
  archive_reason: null,
  effective_project_ids: [],
  independently_linked: false,
  can_manage_links: true,
  can_edit: true,
  ...partial,
});

describe("Production Notes date derivations", () => {
  it("uses the latest local Tuesday without crossing into UTC semantics", () => {
    expect(mostRecentTuesday(new Date(2026, 8, 12, 23, 30))).toBe("2026-09-08");
    expect(mostRecentTuesday(new Date(2026, 8, 8, 0, 30))).toBe("2026-09-08");
    expect(shiftDate("2026-09-08", 7)).toBe("2026-09-15");
  });
});

describe("Production Notes workspace view model", () => {
  it("groups visible projects, preserves bullet order, and sorts rows by project name", () => {
    const view = deriveProductionNotesViewModel(projects, notes, "");
    expect(view.projectRows.map((row) => row.project.name)).toEqual(["Alpha", "Bravo"]);
    expect(view.projectRows[1]?.bullets.map((note) => note.id)).toEqual(["n1"]);
    expect(view.totalBullets).toBe(4);
    expect(view.highlightedCount).toBe(1);
  });

  it("excludes projects already represented and filters the remaining picker options", () => {
    const view = deriveProductionNotesViewModel(projects, notes, "300");
    expect(view.availableProjects.map((project) => project.name)).toEqual(["Charlie"]);
  });
});

describe("Production Notes folder view models", () => {
  const general = folder("general", { name: "General Notes", is_system: true });
  const rootLinked = folder("root", {
    effective_project_ids: ["a", "b"],
  });
  const inherited = folder("inherited", {
    parent_folder_id: "root",
    link_mode: "inherited",
    effective_project_ids: ["a", "b"],
  });
  const independent = folder("independent", {
    parent_folder_id: "root",
    effective_project_ids: ["b"],
    independently_linked: true,
  });

  it("falls back to General Notes and then the first visible folder", () => {
    const folders = [rootLinked, general];
    expect(selectActiveFolder(folders, null, "general")?.id).toBe("general");
    expect(selectActiveFolder(folders, "missing", null)?.id).toBe("root");
  });

  it("distinguishes general, inherited, independent, and root-linked job semantics", () => {
    const views = deriveFolderJobLinkViewModels(
      [general, rootLinked, inherited, independent],
      projects,
    );
    expect(views.get("general")?.linkKind).toBe("general");
    expect(views.get("root")?.linkKind).toBe("root-linked");
    expect(views.get("root")?.jobLabels).toEqual(["100", "200"]);
    expect(views.get("inherited")?.linkKind).toBe("inherited");
    expect(views.get("independent")?.linkKind).toBe("independent");
  });
});
