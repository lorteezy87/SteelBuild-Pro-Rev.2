// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listVisibleNoteFolders } = vi.hoisted(() => ({
  listVisibleNoteFolders: vi.fn(),
}));

vi.mock("@/components/shared/OrgContext", () => ({
  useOrg: () => ({ currentOrg: { id: "org-1" } }),
}));
vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ role: "admin" }),
}));
vi.mock("@/lib/noteFolders/repository", () => ({
  listVisibleNoteFolders,
  archiveNoteFolder: vi.fn(),
  createNoteFolder: vi.fn(),
  renameNoteFolder: vi.fn(),
  setNoteFolderLinks: vi.fn(),
}));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Project: { list: vi.fn().mockResolvedValue([]) },
    ProductionNote: {
      filter: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/services/auditLogger", () => ({ logActivity: vi.fn() }));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntity: vi.fn() }));
vi.mock("@/components/productionnotes/FolderTree", () => ({
  FolderTree: () => <aside>FOLDER_TREE</aside>,
}));
vi.mock("@/components/productionnotes/FolderLinkDialog", () => ({
  FolderLinkDialog: (): null => null,
}));

import ProductionNotes from "@/pages/ProductionNotes";

describe("Production Notes folder availability", () => {
  beforeEach(() => {
    listVisibleNoteFolders.mockReset();
    listVisibleNoteFolders.mockRejectedValue(new Error("Folder service unavailable"));
  });

  it("shows a persistent folder failure, disables folder-dependent actions, and retries", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <ProductionNotes />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Couldn’t load note folders")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Project" })).toBeDisabled();
    expect(screen.queryByText("No notes for this meeting.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry folders" }));
    await waitFor(() => expect(listVisibleNoteFolders).toHaveBeenCalledTimes(2));
  });
});
