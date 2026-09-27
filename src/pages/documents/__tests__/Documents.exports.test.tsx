// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  documents,
  presentGeneratedFile,
  presentRemoteFile,
  presentRemoteFiles,
  resolveFileUrl,
  toast,
} = vi.hoisted(() => ({
  documents: [
    { id: "a", file_name: "A.pdf", file_url: "storage:a", status: "Draft" },
    { id: "b", file_name: "B.pdf", file_url: "storage:b", status: "Draft" },
  ],
  presentGeneratedFile: vi.fn(),
  presentRemoteFile: vi.fn(),
  presentRemoteFiles: vi.fn(),
  resolveFileUrl: vi.fn(),
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/api/supabaseClient", () => ({ entities: {}, resolveFileUrl }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "documents" ? documents : [],
    isLoading: false,
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: { id: "project-1", name: "Warehouse" } }),
}));
vi.mock("@/lib/native/fileExport", () => ({ presentGeneratedFile, presentRemoteFile, presentRemoteFiles }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/dms/DocumentCard", () => ({ default: (): null => null }));
vi.mock("@/components/dms/DocumentFilters", () => ({ default: (): null => null }));
vi.mock("@/components/dms/DocumentDetailPanel", () => ({ default: (): null => null }));
vi.mock("@/components/dms/FolderPicker", () => ({
  default: (): null => null,
  collectFolderAndDescendants: vi.fn(),
}));
vi.mock("@/pages/documents/Toolbar", () => ({
  default: ({ onExportCsv }: { onExportCsv: () => void }) => <button onClick={onExportCsv}>Export CSV</button>,
}));
vi.mock("@/pages/documents/DocumentsControlCenter", () => ({
  default: ({ onToggleAll, batchActions, documentControls }: {
    onToggleAll: (checked: boolean) => void;
    batchActions: ReactNode;
    documentControls: ReactNode;
  }) => <>
    <button onClick={() => onToggleAll(true)}>Select all documents</button>
    {batchActions}
    {documentControls}
  </>,
}));

import Documents from "@/pages/Documents";

beforeEach(() => {
  vi.clearAllMocks();
  resolveFileUrl.mockImplementation(async (url: string) => `https://files.example.com/${url}`);
  presentGeneratedFile.mockResolvedValue("shared");
  presentRemoteFile.mockResolvedValue("shared");
  presentRemoteFiles.mockResolvedValue("shared");
});

function selectAndDownloadDocuments(): void {
  render(<Documents />);
  fireEvent.click(screen.getByRole("button", { name: "Select all documents" }));
  fireEvent.click(screen.getByRole("button", { name: /^DOWNLOAD$/ }));
}

describe("Documents export actions", () => {
  it("presents selected documents as one group and waits before reporting success", async () => {
    let finishShare: ((result: string) => void) | undefined;
    presentRemoteFiles.mockReturnValue(new Promise((resolve) => { finishShare = resolve; }));

    selectAndDownloadDocuments();

    await waitFor(() => expect(presentRemoteFiles).toHaveBeenCalledOnce());
    expect(presentRemoteFiles).toHaveBeenCalledWith({
      files: [
        { url: "https://files.example.com/storage:a", filename: "A.pdf" },
        { url: "https://files.example.com/storage:b", filename: "B.pdf" },
      ],
      title: "Selected documents",
      errorLabel: "selected documents",
    });
    expect(presentRemoteFile).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => { finishShare?.("shared"); });
    expect(toast.success).toHaveBeenCalledWith("2 document(s) shared");
  });

  it.each(["failed", "cancelled"])("does not report bulk download success after a %s presentation", async (result) => {
    presentRemoteFiles.mockResolvedValue(result);
    selectAndDownloadDocuments();

    await waitFor(() => expect(presentRemoteFiles).toHaveBeenCalledOnce());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("reports a missing document separately from the successfully shared group", async () => {
    resolveFileUrl.mockResolvedValueOnce(null).mockResolvedValueOnce("https://files.example.com/b.pdf");
    selectAndDownloadDocuments();

    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith("1 shared, 1 failed"));
    expect(presentRemoteFiles).toHaveBeenCalledWith(expect.objectContaining({
      files: [{ url: "https://files.example.com/b.pdf", filename: "B.pdf" }],
    }));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it.each(["failed", "cancelled"])("does not report CSV success after a %s presentation", async (result) => {
    presentGeneratedFile.mockResolvedValue(result);
    render(<Documents />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => expect(presentGeneratedFile).toHaveBeenCalledOnce());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
