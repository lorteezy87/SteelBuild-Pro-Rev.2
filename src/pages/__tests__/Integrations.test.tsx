// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface ProjectState {
  id: string | null;
}

interface PermissionState {
  isAdmin: boolean;
}

const { permissionState, projectState } = vi.hoisted((): {
  permissionState: PermissionState;
  projectState: ProjectState;
} => ({
  permissionState: { isAdmin: false },
  projectState: { id: null },
}));

vi.mock("@/hooks/useProjectId", () => ({
  useProjectId: () => projectState.id,
}));

vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ isAdmin: permissionState.isAdmin }),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    EmailAccount: {
      filter: vi.fn(() => Promise.resolve([])),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/services/cacheRegistry", () => ({
  invalidateEntity: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/dms/DocumentStorageSettings", () => ({
  default: ({ projectId }: { projectId: string }) => (
    <div>Linked folders for {projectId}</div>
  ),
}));

import Integrations from "@/pages/Integrations";

function renderIntegrations() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <Integrations />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("Integrations catalog", () => {
  beforeEach(() => {
    permissionState.isAdmin = false;
    projectState.id = null;
  });

  it("renders every integration area in the customer catalog", () => {
    renderIntegrations();

    for (const areaName of [
      "Email",
      "Accounting",
      "Document Storage",
      "Scheduling Imports / Exports",
      "Autodesk / IFC / BIM",
    ]) {
      expect(screen.getAllByText(areaName).length).toBeGreaterThan(0);
    }
  });

  it("shows Email providers and live account configuration for an active project", async () => {
    projectState.id = "project-1";
    renderIntegrations();

    fireEvent.click(screen.getByRole("button", { name: /Email.*Capture RFIs/i }));

    expect(screen.getByText("Email forwarding")).toBeInTheDocument();
    expect(screen.getByText("Power Automate")).toBeInTheDocument();
    expect(screen.getByText("Outlook (direct connect)")).toBeInTheDocument();
    expect(screen.getByText("Gmail")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live Configuration" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Email Accounts" })).toBeInTheDocument();
  });

  it("keeps project settings fail-closed until a project is active", () => {
    const { rerender } = renderIntegrations();

    expect(screen.queryByRole("heading", { name: "Live Configuration" })).not.toBeInTheDocument();

    projectState.id = "project-1";
    rerender(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <Integrations />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Live Configuration" })).toBeInTheDocument();
    expect(screen.getByText("Linked folders for project-1")).toBeInTheDocument();
  });

  it("exposes internal status and risk only through the admin developer toggle", () => {
    permissionState.isAdmin = true;
    renderIntegrations();

    expect(screen.queryByText("Build Order")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Developer view" }));

    expect(screen.getByRole("heading", { name: "Build Order" })).toBeInTheDocument();
    expect(screen.getAllByText("Partially Live").length).toBeGreaterThan(0);
  });
});
