// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import EmailAccountSettings from "../EmailAccountSettings";

const { filterMock } = vi.hoisted(() => ({
  filterMock: vi.fn(() => Promise.resolve([])),
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
