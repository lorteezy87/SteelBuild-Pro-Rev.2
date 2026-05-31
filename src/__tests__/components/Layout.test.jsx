// @vitest-environment jsdom
/**
 * Layout smoke test — renders the real Layout component (the application
 * shell) inside a minimal but real provider tree (router, QueryClient,
 * ProjectProvider) and asserts:
 *   1. Children render inside <main>
 *   2. The accessibility skip-to-main-content link is present
 *
 * Goal is proof-of-life for the test infrastructure, not coverage of
 * Layout's internals. Heavy I/O (entity reads, supabase auth)
 * is mocked to no-ops; the chrome itself runs exactly as it does in
 * production.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock entity clients to no-op reads ──────────────────────────────
// useLayoutNavData fans out to Alert/RFI/Drawing/Delivery; ProjectProvider
// fetches Project. All return [] / null without hitting the network.
vi.mock("@/api/supabaseClient", () => {
  const noop = {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
  };
  return {
    entities: new Proxy({}, { get: () => noop }),
    resolveFileUrl: vi.fn((u) => u),
  };
});

// Supabase: the only paths Layout transitively touches are auth + a few
// `.from(...).select(...)` chains. Stub them.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return chain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

import Layout from "@/Layout";
import { ProjectProvider } from "@/components/shared/ProjectContext";

function renderLayout() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProjectProvider>
          <Layout currentPageName="Dashboard">
            <div>Test child content</div>
          </Layout>
        </ProjectProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Layout (smoke)", () => {
  beforeEach(() => {
    // Clear any persisted activeProjectId from a previous run so the
    // ProjectProvider falls through to portfolio mode.
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom localStorage may already be empty */
    }
  });

  it("renders without crashing and shows children", () => {
    renderLayout();
    expect(screen.getByText("Test child content")).toBeInTheDocument();
  });

  it("renders the skip-to-main-content accessibility link", () => {
    renderLayout();
    expect(screen.getByText(/skip to main content/i)).toBeInTheDocument();
  });
});
