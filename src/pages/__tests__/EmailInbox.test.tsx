// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const { nativeState } = vi.hoisted(() => ({ nativeState: { enabled: false } }));

vi.mock("@/lib/native/platform", () => ({
  isNativePlatform: () => nativeState.enabled,
}));

vi.mock("@/hooks/useProjectId", () => ({
  useProjectId: () => "project-1",
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    EmailMessage: {
      filter: vi.fn(() => Promise.resolve([])),
      update: vi.fn(),
      bulkUpdate: vi.fn(),
    },
    EmailAttachment: {
      filter: vi.fn(() => Promise.resolve([])),
    },
  },
}));

vi.mock("@/hooks/useRealtimeInvalidation", () => ({
  useRealtimeInvalidation: vi.fn(),
}));

vi.mock("@/components/shared/useAppSecurity", () => ({
  useAppSecurity: () => ({ user: { email: "pm@example.com" } }),
}));

vi.mock("@/services/cacheRegistry", () => ({
  invalidateEntity: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import EmailInbox from "@/pages/EmailInbox";

function renderInbox() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <EmailInbox />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("EmailInbox page", () => {
  afterEach(() => { nativeState.enabled = false; });

  it("renders the inbox heading and Email Settings affordance", () => {
    renderInbox();

    expect(screen.getByRole("heading", { name: "Email Inbox" })).toBeInTheDocument();
    expect(screen.getByTitle("Email Settings")).toBeInTheDocument();
  });

  it("drops the Email Settings shortcut in the native app, where Integrations is web-only", () => {
    nativeState.enabled = true;
    renderInbox();

    expect(screen.getByRole("heading", { name: "Email Inbox" })).toBeInTheDocument();
    expect(screen.queryByTitle("Email Settings")).not.toBeInTheDocument();
  });
});
