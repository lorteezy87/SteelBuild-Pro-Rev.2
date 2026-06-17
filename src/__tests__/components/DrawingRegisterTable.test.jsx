// @vitest-environment jsdom
/**
 * DrawingRegisterTable integration test — the clean flat per-set Drawing
 * Register (the hub's Drawings tab). Renders the real component inside the
 * router + QueryClient with Supabase mocked, and asserts the per-set rows,
 * submittal-aware status / released counts, the management toolbar (incl.
 * edit-permission gating), and search filtering.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/api/supabaseClient", () => {
  const noop = {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
  };
  return { entities: new Proxy({}, { get: () => noop }), resolveFileUrl: vi.fn((u) => u) };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return chain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// AI flag off so the per-row Impact Report button is deterministic.
vi.mock("@/hooks/useFeatureFlag", () => ({ useFlag: () => false, useFeatureFlag: () => false }));

// Configurable permission so the gating test can flip to a read-only user.
const { security } = vi.hoisted(() => ({ security: { can: () => true } }));
vi.mock("@/components/shared/useAppSecurity", () => ({
  useAppSecurity: () => ({ can: (...args) => security.can(...args), user: { email: "test@example.com" } }),
}));

import { DrawingRegisterTable } from "@/pages/drawingSubmittalHub/components";

const SETS = [
  {
    key: "id:1", setId: "1", name: "Main Steel - IFC",
    parent: { id: "1", set_name: "Main Steel - IFC", set_number: "S-001", discipline: "Structural", sheet_count: 3 },
    sheets: [
      { id: "s1", stage: "Released", revision_number: "2" },
      { id: "s2", stage: "Released", revision_number: "1" },
      { id: "s3", stage: "Released", revision_number: "2" },
    ],
    submittals: [{ round_number: 2, status: "Released for Fabrication", required_date: "2025-01-01" }],
  },
  {
    key: "id:2", setId: "2", name: "Anchor Bolts - OFA",
    parent: { id: "2", set_name: "Anchor Bolts - OFA", set_number: "AB-001", discipline: "Structural", sheet_count: 2 },
    sheets: [
      { id: "a1", stage: "IFA", revision_number: "0" },
      { id: "a2", stage: "IFA", revision_number: "0" },
    ],
    submittals: [{ round_number: 1, status: "Issued for Approval", required_date: "2020-01-01" }],
  },
];

function renderTable(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DrawingRegisterTable
          setPackages={SETS}
          projectId="p1"
          activeProject={{ id: "p1", name: "Test" }}
          drawingSets={[]}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DrawingRegisterTable (Drawing Register)", () => {
  beforeEach(() => { security.can = () => true; });

  it("renders one clean row per drawing set", () => {
    renderTable();
    expect(screen.getByText("Main Steel - IFC")).toBeInTheDocument();
    expect(screen.getByText("Anchor Bolts - OFA")).toBeInTheDocument();
  });

  it("shows submittal-aware status + released counts per set", () => {
    renderTable();
    expect(screen.getByText("Released for Fabrication")).toBeInTheDocument();
    expect(screen.getByText("Issued for Approval")).toBeInTheDocument();
    expect(screen.getByText("3/3")).toBeInTheDocument(); // Main Steel fully released
    expect(screen.getByText("0/2")).toBeInTheDocument(); // Anchor Bolts none released
  });

  it("surfaces the management toolbar for an editor", () => {
    renderTable();
    expect(screen.getByText(/Upload Drawings/i)).toBeInTheDocument();
    expect(screen.getByText(/Import Log/i)).toBeInTheDocument();
    expect(screen.getByText(/full editor/i)).toBeInTheDocument();
  });

  it("hides upload/import for a read-only user but keeps the full-editor link", () => {
    security.can = () => false;
    renderTable();
    expect(screen.queryByText(/Upload Drawings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Import Log/i)).not.toBeInTheDocument();
    expect(screen.getByText(/full editor/i)).toBeInTheDocument();
  });

  it("filters the register by search", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.type(screen.getByPlaceholderText(/search drawing sets/i), "anchor");
    expect(screen.queryByText("Main Steel - IFC")).not.toBeInTheDocument();
    expect(screen.getByText("Anchor Bolts - OFA")).toBeInTheDocument();
  });
});
