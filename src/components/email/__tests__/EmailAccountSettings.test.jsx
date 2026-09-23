// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EmailAccountSettings from "../EmailAccountSettings";

const { filterMock, roleGate } = vi.hoisted(() => ({
  filterMock: vi.fn(() => Promise.resolve([])),
  roleGate: vi.fn(() => ({ allowed: true, isLoading: false })),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    EmailAccount: {
      filter: filterMock,
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/hooks/useProjectRoleAtLeast", () => ({
  useProjectRoleAtLeast: roleGate,
}));

vi.mock("@/services/cacheRegistry", () => ({
  invalidateEntity: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <EmailAccountSettings projectId="project-1" />
    </QueryClientProvider>,
  );
}

const ACCOUNT = {
  id: "acct-1",
  project_id: "project-1",
  email_address: "projects@example.com",
  display_name: "Project Inbox",
  connection_type: "manual_forward",
  is_active: true,
};

beforeEach(() => {
  filterMock.mockImplementation(() => Promise.resolve([]));
  roleGate.mockImplementation(() => ({ allowed: true, isLoading: false }));
});

describe("EmailAccountSettings unavailable connector controls", () => {
  it("keeps supported sources available without exposing Outlook OAuth", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Add Email Source" }));
    expect(await screen.findByText("Manual Forward")).toBeInTheDocument();
    expect(screen.getByText("Power Automate")).toBeInTheDocument();
    expect(screen.queryByText("Outlook OAuth")).not.toBeInTheDocument();
    expect(screen.queryByText(/Azure AD app registration/i)).not.toBeInTheDocument();
  });
});

describe("EmailAccountSettings admin gate (SEC-N1)", () => {
  it("asks for the same admin floor the email_accounts write policies use", () => {
    renderSettings();
    expect(roleGate).toHaveBeenCalledWith("project-1", "admin");
  });

  it("gives an admin the add, toggle and remove controls", async () => {
    filterMock.mockImplementation(() => Promise.resolve([ACCOUNT]));
    renderSettings();
    expect(await screen.findByText("Project Inbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Email Source" })).toBeInTheDocument();
    expect(screen.getByTitle("Deactivate")).toBeInTheDocument();
    expect(screen.getByTitle("Remove account")).toBeInTheDocument();
  });

  it("shows a non-admin the accounts read-only", async () => {
    roleGate.mockImplementation(() => ({ allowed: false, isLoading: false }));
    filterMock.mockImplementation(() => Promise.resolve([ACCOUNT]));
    renderSettings();
    expect(await screen.findByText("Project Inbox")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Email Source" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Deactivate")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Remove account")).not.toBeInTheDocument();
    expect(screen.getByText(/Only project or workspace admins can add, change or remove email accounts/i))
      .toBeInTheDocument();
  });

  it("hides the controls while the role is still loading", () => {
    roleGate.mockImplementation(() => ({ allowed: false, isLoading: true }));
    renderSettings();
    expect(screen.queryByRole("button", { name: "Add Email Source" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Only project or workspace admins/i)).not.toBeInTheDocument();
  });

  it("tells an admin that sending needs platform verification", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Add Email Source" }));
    expect(screen.getByText(/verified by SteelBuild Pro support/i)).toBeInTheDocument();
  });
});
