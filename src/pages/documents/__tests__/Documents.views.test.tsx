// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
const old = "2025-01-01T00:00:00Z";

const { state, presentGeneratedFile } = vi.hoisted(() => ({
  state: {
    documents: [] as Record<string, unknown>[],
    deleted: [] as Record<string, unknown>[],
    props: null as null | Record<string, any>,
  },
  presentGeneratedFile: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({ entities: {}, resolveFileUrl: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: string[]; enabled?: boolean }) => ({
    data: queryKey[0] === "documents" ? state.documents
      : queryKey[0] === "documents-deleted" ? (enabled ? state.deleted : [])
        : [],
    isLoading: false,
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: { id: "project-1", name: "Warehouse" } }),
}));
vi.mock("@/lib/native/fileExport", () => ({ presentGeneratedFile, presentRemoteFile: vi.fn(), presentRemoteFiles: vi.fn() }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/dms/DocumentDetailPanel", () => ({ default: (): null => null }));
vi.mock("@/components/dms/FolderPicker", () => ({ default: (): null => null, collectFolderAndDescendants: vi.fn() }));
vi.mock("@/pages/documents/DocumentsControlCenter", () => ({
  default: (props: Record<string, unknown>): null => { state.props = props; return null; },
}));

import Documents from "@/pages/Documents";

const ids = (rows: { id?: unknown }[]) => rows.map((r) => r.id).sort();

beforeEach(() => {
  vi.clearAllMocks();
  state.documents = [
    { id: "in-folder-review", folder_id: "folder-1", status: "Under Review", category: "Shop Drawing", uploaded_date: old },
    { id: "root-review", folder_id: null, status: "Under Review", category: "Report", uploaded_date: old },
    { id: "root-new", folder_id: null, status: "Draft", uploaded_date: recent },
    { id: "root-plain", folder_id: null, status: "Approved", uploaded_date: old },
  ];
  state.deleted = [{ id: "trash-1", folder_id: null, is_deleted: true, deleted_at: recent }];
  presentGeneratedFile.mockResolvedValue("downloaded");
});

describe("Documents shell — rows, selection and export follow the active view", () => {
  it("shows the open folder by default, then the project-wide quick view when switched", () => {
    render(<Documents />);
    expect(state.props!.view).toBe("folder");
    expect(ids(state.props!.filteredDocs)).toEqual(["root-new", "root-plain", "root-review"]);

    act(() => state.props!.onViewChange("review"));
    expect(state.props!.view).toBe("review");
    expect(ids(state.props!.filteredDocs)).toEqual(["in-folder-review", "root-review"]);

    act(() => state.props!.onViewChange("recent"));
    expect(ids(state.props!.filteredDocs)).toEqual(["root-new"]);
  });

  it("select-all in a quick view selects exactly the rows shown, across folders", () => {
    render(<Documents />);
    act(() => state.props!.onViewChange("review"));
    act(() => state.props!.onToggleAll(true));
    expect([...state.props!.selectedIds].sort()).toEqual(["in-folder-review", "root-review"]);
  });

  it("applies Add filter to a quick view", () => {
    render(<Documents />);
    act(() => state.props!.onViewChange("review"));
    act(() => state.props!.onFilterChange("category", ["Shop Drawing"]));
    expect(ids(state.props!.filteredDocs)).toEqual(["in-folder-review"]);
  });

  it("exports the rows of the active view, not the last open folder", async () => {
    render(<Documents />);
    act(() => state.props!.onViewChange("review"));
    await act(async () => { await state.props!.onExport(); });
    expect(presentGeneratedFile).toHaveBeenCalledTimes(1);
    const blob = presentGeneratedFile.mock.calls[0][0].blob as Blob;
    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(csv.trim().split("\n")).toHaveLength(3); // header + 2 review rows
  });

  it("reads the recycle bin only when opened, and shows its rows", () => {
    render(<Documents />);
    expect(state.props!.deletedDocs).toEqual([]);
    act(() => state.props!.onViewChange("recycle"));
    expect(ids(state.props!.filteredDocs)).toEqual(["trash-1"]);
  });

  it("clears the selection when the view changes", () => {
    render(<Documents />);
    act(() => state.props!.onToggleAll(true));
    expect(state.props!.selectedIds.size).toBe(3);
    act(() => state.props!.onViewChange("review"));
    expect(state.props!.selectedIds.size).toBe(0);
  });
});
