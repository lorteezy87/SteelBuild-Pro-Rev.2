// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import DocumentsControlCenter from "../DocumentsControlCenter";
import type { DocumentsControlCenterProps } from "../DocumentsControlCenter";
import type { DocumentRecord, FolderRecord } from "../documentsControlCenter.derive";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const folders: Array<FolderRecord & { created_at?: string }> = [
  { id: "f1", name: "01 Design Files", parent_folder_id: null, created_at: "2026-03-10T09:25:00" },
  { id: "f2", name: "02 Bid Packages", parent_folder_id: null, created_at: "2026-03-10T09:25:00" },
  { id: "f1a", name: "Structural", parent_folder_id: "f1", created_at: "2026-03-11T09:25:00" },
];
const docs: DocumentRecord[] = [
  { id: "d1", displayName: "AISC Code of Standard Practice.pdf", fileType: "pdf", folder_id: null, uploadedBy: "M. Mulsow", uploadedDate: "2026-03-14T05:03:00", status: "Issued", fileSizeKb: 2048 },
  { id: "d2", displayName: "S-101.pdf", fileType: "pdf", folder_id: "f1a", uploadedDate: "2026-03-15T07:00:00", status: "Under Review" },
];

function setup(over: Partial<DocumentsControlCenterProps> = {}) {
  const props: DocumentsControlCenterProps = {
    projectName: "25-014 Madison",
    allDocuments: docs,
    filteredDocs: docs.filter((d) => d.folder_id === null),
    search: "",
    onSearch: vi.fn(),
    onOpenDoc: vi.fn(),
    onExport: vi.fn(),
    onUpload: vi.fn(),
    selectedIds: new Set(),
    onToggleSelect: vi.fn(),
    onToggleAll: vi.fn(),
    folders,
    currentFolderId: null,
    onNavigateFolder: vi.fn(),
    onCreateFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onBulkDeleteFolders: vi.fn(),
    onBulkMoveFolders: vi.fn(),
    onOpenBulkCreateFolders: vi.fn(),
    onMoveSelectedDocs: vi.fn(),
    onDeleteSelectedDocs: vi.fn(),
    onClearSelection: vi.fn(),
    onDownloadDoc: vi.fn(),
    onDeleteDoc: vi.fn(),
    onFilterChange: vi.fn(),
    onClearFilters: vi.fn(),
    onOpenRecycleBin: vi.fn(),
    onRestoreDoc: vi.fn(),
    ...over,
  };
  const utils = render(<DocumentsControlCenter {...props} />);
  return { ...utils, props };
}

describe("Documents browser", () => {
  it("shows the project root with its top-level folders in the tree and folders before files in the table", () => {
    setup();
    const tree = screen.getByRole("navigation", { name: "Folders" });
    expect(within(tree).getByRole("button", { name: "25-014 Madison" })).toBeInTheDocument();
    expect(within(tree).getByRole("button", { name: "01 Design Files" })).toBeInTheDocument();
    // Nested folder is collapsed until its parent is expanded.
    expect(within(tree).queryByRole("button", { name: "Structural" })).not.toBeInTheDocument();
    fireEvent.click(within(tree).getByRole("button", { name: "Expand 01 Design Files" }));
    expect(within(tree).getByRole("button", { name: "Structural" })).toBeInTheDocument();

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("01 Design Files"),
      expect.stringContaining("02 Bid Packages"),
      expect.stringContaining("AISC Code of Standard Practice.pdf"),
    ]);
    expect(rows[0]).toHaveTextContent("03/10/2026 at 09:25 AM");
    expect(rows[2]).toHaveTextContent("03/14/2026 at 05:03 AM by M. Mulsow");
  });

  it("opens a folder from the table or the tree, and a document from its row", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("row", { name: /02 Bid Packages/ }));
    expect(props.onNavigateFolder).toHaveBeenCalledWith("f2");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Folders" })).getByRole("button", { name: "01 Design Files" }));
    expect(props.onNavigateFolder).toHaveBeenCalledWith("f1");
    fireEvent.click(screen.getByRole("row", { name: /AISC Code/ }));
    expect(props.onOpenDoc).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
  });

  it("titles the table with the current folder, shows a breadcrumb and auto-expands the tree to it", () => {
    setup({ currentFolderId: "f1a", filteredDocs: [docs[1]] });
    expect(screen.getByRole("heading", { level: 2, name: "Structural" })).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", { name: "Folder path" });
    expect(within(crumbs).getByRole("button", { name: "25-014 Madison" })).toBeInTheDocument();
    expect(within(crumbs).getByRole("button", { name: "01 Design Files" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Folders" })).getByRole("button", { name: "Structural" })).toBeInTheDocument();
  });

  it("sorts by name and flips direction from the column header", () => {
    setup();
    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(within(nameHeader).getByRole("button"));
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("02 Bid Packages");
  });

  it("creates a folder inline from New → Folder in the current folder", () => {
    const { props } = setup({ currentFolderId: "f1", filteredDocs: [] });
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Folder$/ }));
    fireEvent.change(screen.getByLabelText("New folder name"), { target: { value: "  Erection Drawings " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(props.onCreateFolder).toHaveBeenCalledWith("Erection Drawings", "f1");
  });

  it("offers upload, bulk folders and export from the New menu", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Upload files/ }));
    expect(props.onUpload).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Export list/ }));
    expect(props.onExport).toHaveBeenCalled();
  });

  it("adds and removes filters through Add filter", () => {
    const { props, rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add filter/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "Issued" } });
    expect(props.onFilterChange).toHaveBeenCalledWith("status", ["Issued"]);
    rerender(<DocumentsControlCenter {...props} activeFilters={{ status: ["Issued"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Status Issued" }));
    expect(props.onFilterChange).toHaveBeenLastCalledWith("status", null);
  });

  it("renames and deletes a folder from its row menu, with a confirmation", () => {
    vi.spyOn(window, "prompt").mockReturnValue("01 Design");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Folder actions for 01 Design Files" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Rename/ }));
    expect(props.onRenameFolder).toHaveBeenCalledWith(expect.objectContaining({ id: "f1" }), "01 Design");
    fireEvent.click(screen.getByRole("button", { name: "Folder actions for 01 Design Files" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    expect(confirm.mock.calls[0][0]).toMatch(/0 documents and 1 sub-folder move up one level/);
    expect(props.onDeleteFolder).toHaveBeenCalledWith(expect.objectContaining({ id: "f1" }));
  });

  it("shows quick views across folders and the recycle bin with restore", () => {
    const deleted = [{ id: "x", displayName: "Old.pdf", fileType: "pdf", deleted_at: "2026-10-01T10:00:00", created_at: "2026-09-01T10:00:00" }];
    const { props, rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Needs review/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Needs review" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /S-101\.pdf/ })).toHaveTextContent("Structural");

    fireEvent.click(screen.getByRole("button", { name: /Recycle bin/ }));
    expect(props.onOpenRecycleBin).toHaveBeenCalled();
    rerender(<DocumentsControlCenter {...props} deletedDocs={deleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(props.onRestoreDoc).toHaveBeenCalledWith(expect.objectContaining({ id: "x" }));
  });

  it("never shows a failed read as an empty folder", () => {
    const { props } = setup({ allDocuments: [], filteredDocs: [], folders: [], loadError: "network down", onRetry: vi.fn() });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load documents. network down");
    expect(screen.queryByText(/This folder is empty/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("guides an empty project to add folders and files", () => {
    setup({ allDocuments: [], filteredDocs: [], folders: [] });
    expect(screen.getByText(/No folders yet/)).toBeInTheDocument();
    expect(screen.getByText(/This folder is empty/)).toBeInTheDocument();
  });

  it("searches across folders: matching folders and a Folder column appear", () => {
    setup({ search: "struct", filteredDocs: [] });
    expect(screen.getByRole("heading", { level: 2, name: /Search results/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Folder" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Structural/ })).toHaveTextContent("01 Design Files");
  });
});
