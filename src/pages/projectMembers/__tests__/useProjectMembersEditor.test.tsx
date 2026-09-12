// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectMembersEditor } from "@/pages/projectMembers/useProjectMembersEditor";

const mocks = vi.hoisted(() => ({
  projectList: vi.fn(),
  userFilter: vi.fn(),
  userProjectFilter: vi.fn(),
  userProjectCreate: vi.fn(),
  userProjectUpdate: vi.fn(),
  userProjectDelete: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Project: { list: mocks.projectList },
    User: { filter: mocks.userFilter },
    UserProject: {
      filter: mocks.userProjectFilter,
      create: mocks.userProjectCreate,
      update: mocks.userProjectUpdate,
      delete: mocks.userProjectDelete,
    },
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function activityQuery() {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: (
      resolve: (value: { data: []; error: null }) => unknown,
    ) => resolve({ data: [], error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useProjectMembersEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectList.mockResolvedValue([
      { id: "project-1", name: "Project One" },
    ]);
    mocks.userProjectFilter.mockResolvedValue([
      {
        id: "membership-1",
        user_id: "user-1",
        project_id: "project-1",
        role: "admin",
        created_at: null,
      },
    ]);
    mocks.userFilter.mockImplementation(
      async (conditions: { id?: string[]; email?: string }) => {
        if (conditions.email) {
          return [{ id: "user-2", email: conditions.email, full_name: "New User" }];
        }
        return [{ id: "user-1", email: "admin@example.com", full_name: "Admin" }];
      },
    );
    mocks.userProjectCreate.mockResolvedValue({ id: "membership-2" });
    mocks.from.mockImplementation(() => activityQuery());
  });

  it("does not issue project roster or activity reads without management access", async () => {
    renderHook(
      () =>
        useProjectMembersEditor({
          selectedProjectId: "project-1",
          canManageSelectedProject: false,
        }),
      { wrapper },
    );

    await waitFor(() => expect(mocks.projectList).toHaveBeenCalledTimes(1));
    expect(mocks.userProjectFilter).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("scopes reads and additions to the selected project with the default project role", async () => {
    const { result } = renderHook(
      () =>
        useProjectMembersEditor({
          selectedProjectId: "project-1",
          canManageSelectedProject: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.members).toHaveLength(1));
    expect(mocks.userProjectFilter).toHaveBeenCalledWith(
      { project_id: "project-1" },
      "created_at",
    );

    act(() => result.current.setNewMemberEmail("  NEW@Example.COM "));
    act(() => result.current.handleAddMember());

    await waitFor(() =>
      expect(mocks.userProjectCreate).toHaveBeenCalledWith({
        user_id: "user-2",
        project_id: "project-1",
        role: "pm",
      }),
    );
  });
});
