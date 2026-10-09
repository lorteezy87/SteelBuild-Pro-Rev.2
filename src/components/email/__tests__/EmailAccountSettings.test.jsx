// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import EmailAccountSettings from "../EmailAccountSettings";

const { filterMock, rpcMock } = vi.hoisted(() => ({
  filterMock: vi.fn(() => Promise.resolve([])),
  rpcMock: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: rpcMock } }));

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

  it("keeps an unverified mailbox visible and explains the verification requirement", async () => {
    filterMock.mockResolvedValueOnce([{ id: "mailbox", email_address: "project@example.invalid", is_active: true, connection_type: "manual_forward" }]);
    rpcMock.mockResolvedValueOnce({ data: [{ account_id: "mailbox", verified: false, send_provider: null }], error: null });
    renderSettings();
    expect(await screen.findByText("project@example.invalid")).toBeInTheDocument();
    expect(await screen.findByText("Unverified — sending disabled")).toBeInTheDocument();
    expect(screen.getByText(/Adding or activating an email source does not authorize sending/i)).toBeInTheDocument();
  });

  it("shows verified sending and inbound-only states without implying activation is proof", async () => {
    filterMock.mockResolvedValueOnce([
      { id: "sending", email_address: "send@example.invalid", is_active: true },
      { id: "inbound", email_address: "inbound@example.invalid", is_active: true },
    ]);
    rpcMock.mockResolvedValueOnce({ data: [{ account_id: "sending", verified: true, send_provider: "resend" }, { account_id: "inbound", verified: true, send_provider: "inbound_only" }], error: null });
    renderSettings();
    expect(await screen.findByText("Verified for sending")).toBeInTheDocument();
    expect(screen.getByText("Verified for inbound only")).toBeInTheDocument();
  });

  it("retains mailbox metadata and shows verification unavailable when the lookup fails", async () => {
    filterMock.mockResolvedValueOnce([{ id: "mailbox", email_address: "project@example.invalid", is_active: true }]);
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error("Unavailable") });
    renderSettings();
    expect(await screen.findByText("Verification unavailable — sending disabled")).toBeInTheDocument();
    expect(screen.getByText("project@example.invalid")).toBeInTheDocument();
  });
});
