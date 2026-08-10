// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { projectState } = vi.hoisted(() => ({
  projectState: { id: null },
}));

vi.mock("@/hooks/useProjectId", () => ({
  useProjectId: () => projectState.id,
}));

vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ isAdmin: false }),
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
  default: () => null,
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
});
