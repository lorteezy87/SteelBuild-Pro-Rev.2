// @vitest-environment jsdom
/**
 * The Board Report's two standing guarantees, asserted rather than trusted.
 *
 * 1. READ-ONLY. The page this replaced wrote nothing, so reviewing a document
 *    was never an irreversible act. Every action here is a link out to the
 *    flow that owns the write, or disabled. A future change that wires a save
 *    button straight into this page should fail here first.
 * 2. NO HARDCODED COMPANY. Every screen in the design comps shows a literal
 *    fabricator name in the masthead; CLAUDE.md records the owner's decision
 *    that no part of this product may name it. The wordmark reads the
 *    signed-in organization, and renders nothing when there is no org.
 */
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  theme: "light" as string,
  orgName: "Harbor Fabrication" as string | null,
  register: [
    {
      drawing_id: "d1",
      project_id: "p1",
      sheet_number: "E-203",
      sheet_title: "Seq 3 roof framing plan",
      discipline: "E",
      drawing_set_name: "Erection — Seq 3",
      stage: "IFA",
      current_revision: "0",
      current_status: "Revise & Resubmit",
      current_issued_at: "2026-09-22",
      current_revision_id: null as string | null,
      open_impact_count: 0,
      pending_review_count: 0,
      rfi_count: 1,
      work_package_count: 0,
      last_activity: null as string | null,
      active_hold_id: null as string | null,
      thumbnail_url: "https://example.test/e203.png" as string | null,
      linked_rfi_ids: "RFI #041" as string | null,
    },
    {
      drawing_id: "d2",
      project_id: "p1",
      sheet_number: "4001",
      sheet_title: "Stair ST-1 stringers",
      discipline: "ST",
      drawing_set_name: "Stairs",
      stage: "Released",
      current_revision: "0",
      current_status: null as string | null,
      current_issued_at: "2026-09-30",
      current_revision_id: null as string | null,
      open_impact_count: 0,
      pending_review_count: 0,
      rfi_count: 2,
      work_package_count: 0,
      last_activity: null as string | null,
      active_hold_id: "h1",
      active_hold_reason: "Grid J landing elevation unresolved",
      thumbnail_url: null as string | null,
      linked_rfi_ids: "RFI #041, RFI #052" as string | null,
    },
  ],
  submittals: [
    {
      id: "s1",
      submittal_number: "S-004",
      title: "Seq 1 columns & base plates",
      drawing_set_ids: ["a", "b"],
      submitted_date: "2026-09-25",
      ball_in_court: "EOR",
      status: "Under Review",
      returned_date: null as string | null,
      reviewer: "D. Okafor",
    },
  ],
  rfis: [
    {
      id: "r1",
      rfi_number: "RFI 041",
      title: "Stair landing elevation at Grid J",
      drawing_reference: "A-501",
      ball_in_court: "Architect",
      due_date: "2026-10-13",
      submitted_date: "2026-10-06",
      question: "A-501 and S-201 differ by 1.5 inches.",
      description: "Hold S-201 and take the difference in the finish build-up.",
      status: "Open",
      // The live signal is the operator's tick in metadata; holds_released_count
      // is released-hold history and must NOT read as a current blocker.
      metadata: { fab_hold: true, proposed_solution: "Hold S-201 and take the difference in the finish build-up." },
      holds_released_count: 0,
    },
  ],
  transmittals: [
    {
      id: "t1",
      transmittal_number: "T-118-064",
      recipient_company: "Erection crew 2",
      sent_to: "R. Vega",
      purpose: "For erection",
      date_sent: "2026-10-17T14:20:00Z",
      acknowledged_at: null as string | null,
      acknowledged_by_name: null as string | null,
    },
  ],
}));

vi.mock("@/api/supabaseClient", () => ({
  EFFECTIVE_LIST_CAP: 1000,
  entities: {
    Submittal: { filter: vi.fn(async () => m.submittals) },
    RFI: { filter: vi.fn(async () => m.rfis) },
    DrawingTransmittal: { filter: vi.fn(async () => m.transmittals) },
  },
}));

vi.mock("@/hooks/useDrawingRegister", () => ({
  useDrawingRegister: () => ({ data: m.register, isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => "p1" }));
vi.mock("@/hooks/useDocumentTitle", () => ({ default: () => {} }));
vi.mock("@/components/shared/ThemeContext", () => ({ useTheme: () => ({ theme: m.theme }) }));
vi.mock("@/components/shared/OrgContext", () => ({
  useOptionalOrg: () => (m.orgName === null ? undefined : { currentOrg: { name: m.orgName } }),
}));

import DocumentControl from "../../DocumentControl";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

const renderPage = () => render(<DocumentControl />, { wrapper });
const goTo = async (tab: string) => {
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.click(screen.getByRole("button", { name: tab }));
};

describe("Document Control Board Report", () => {
  it("opens on the Brief with the five screens reachable", () => {
    renderPage();
    for (const tab of ["Brief", "Register", "Submittals", "RFIs", "Transmittals"]) {
      expect(screen.getByRole("button", { name: tab })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Brief" })).toHaveAttribute("aria-current", "page");
  });

  it("reads the masthead company from the signed-in organization", () => {
    renderPage();
    expect(screen.getByText("Harbor Fabrication")).toBeInTheDocument();
  });

  it("renders no company at all when there is no organization, rather than guessing one", () => {
    m.orgName = null;
    try {
      const { container } = renderPage();
      expect(screen.getByText("Document Control")).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/S&H/i);
    } finally {
      m.orgName = "Harbor Fabrication";
    }
  });

  it("names no hardcoded fabricator anywhere on any screen", async () => {
    const { container } = renderPage();
    for (const tab of ["Register", "Submittals", "RFIs", "Transmittals", "Brief"]) {
      await goTo(tab);
      expect(container.textContent).not.toMatch(/S&H/i);
    }
  });

  it("shows a held sheet as held even though its stage says released", async () => {
    renderPage();
    await goTo("Register");
    const row = screen.getByRole("button", { name: /Sheet 4001/ });
    expect(within(row).getByText("HOLD")).toBeInTheDocument();
  });

  it("writes nothing: every pane action is a link out or disabled", async () => {
    renderPage();
    for (const tab of ["Register", "Submittals", "RFIs", "Transmittals"]) {
      await goTo(tab);
      // Buttons that are not tabs, rows or filter chips are pane actions.
      const actions = screen
        .getAllByRole("button")
        .filter((b) => !b.hasAttribute("aria-pressed") && !b.hasAttribute("aria-current") && b.getAttribute("aria-label") === null)
        .filter((b) => !["Brief", "Register", "Submittals", "RFIs", "Transmittals"].includes(b.textContent ?? ""));
      for (const action of actions) {
        expect(action).toBeDisabled();
      }
    }
  });

  it("keeps the intake desk reachable from the register pane", async () => {
    renderPage();
    await goTo("Register");
    expect(screen.getByRole("link", { name: /Intake desk/i })).toHaveAttribute("href", "/DocumentIntake");
  });

  it("selecting a row changes the pane and nothing else", async () => {
    const { fireEvent } = await import("@testing-library/react");
    renderPage();
    await goTo("Register");
    const second = screen.getByRole("button", { name: /Sheet 4001/ });
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-pressed", "true");
    // The hold reason lives only in the pane, so finding it proves the pane
    // followed the selection rather than that the row is still on screen.
    expect(screen.getByText(/Grid J landing elevation unresolved/)).toBeInTheDocument();
  });

  it("states the situation in a sentence that agrees with the metrics", async () => {
    renderPage();
    await goTo("RFIs");
    // The sentence is derived from the same counts the metrics are, so it
    // cannot contradict them. Both must say it — that agreement IS the test.
    expect(screen.getAllByText(/holding fabrication/i)).toHaveLength(2);
  });

  /**
   * AGENTS.md: "SteelBuild is dual-theme. Do not force command pages
   * light-only." The body used to read a fixed light palette, which put a
   * bright report inside dark application chrome.
   */
  it("follows the application theme instead of forcing itself light", async () => {
    const { container: light } = renderPage();
    await goTo("Register");
    const lightHtml = light.innerHTML;

    m.theme = "dark";
    try {
      const { container: darkC } = renderPage();
      expect(darkC.innerHTML).not.toBe(lightHtml);
      // jsdom serialises inline colours as rgb(). #0C0F12 is the dark page
      // surface; #FAFAF8 (250,250,248) is the light one it must not use.
      expect(darkC.innerHTML).toContain("rgb(12, 15, 18)");
      expect(lightHtml).toContain("rgb(250, 250, 248)");
    } finally {
      m.theme = "light";
    }
  });

  /**
   * The two panes that migration 20261022082000 unblocks. Both have to keep an
   * unread column apart from a real absence.
   */
  describe("sheet media and RFI linkage", () => {
    it("shows the real sheet thumbnail when the register carries one", async () => {
      renderPage();
      await goTo("Register");
      const img = screen.getByRole("img", { name: /Sheet E-203/i });
      expect(img).toHaveAttribute("src", "https://example.test/e203.png");
    });

    it("falls back to the placeholder when a sheet has no thumbnail", async () => {
      const { fireEvent } = await import("@testing-library/react");
      renderPage();
      await goTo("Register");
      fireEvent.click(screen.getByText("Stair ST-1 stringers"));
      expect(screen.queryByRole("img", { name: /Sheet 4001/i })).not.toBeInTheDocument();
      expect(screen.getByText(/sheet preview/)).toBeInTheDocument();
    });

    it("names the sheets an RFI is holding, as chips", async () => {
      renderPage();
      await goTo("RFIs");
      expect(screen.getByText("Sheets held")).toBeInTheDocument();
      // RFI 041 is named by both fixture sheets' linked_rfi_ids.
      expect(screen.getByText("E-203")).toBeInTheDocument();
      expect(screen.getByText("4001")).toBeInTheDocument();
    });

    it("says the linkage is unavailable rather than printing none when the column is absent", async () => {
      // The view before 20261022082000: no `linked_rfi_ids` key at all.
      const original = m.register;
      m.register = original.map((r) => {
        const { linked_rfi_ids: _omitted, ...rest } = r;
        return rest;
      }) as typeof original;
      try {
        renderPage();
        await goTo("RFIs");
        expect(screen.getByText(/Sheet linkage not available/i)).toBeInTheDocument();
        expect(screen.queryByText(/No sheet names this RFI/i)).not.toBeInTheDocument();
      } finally {
        m.register = original;
      }
    });

    it("reports a real empty when the column was read and no sheet matches", async () => {
      const original = m.register;
      m.register = original.map((r) => ({ ...r, linked_rfi_ids: null as string | null })) as typeof original;
      try {
        renderPage();
        await goTo("RFIs");
        expect(screen.getByText(/No sheet names this RFI/i)).toBeInTheDocument();
        expect(screen.queryByText(/Sheet linkage not available/i)).not.toBeInTheDocument();
      } finally {
        m.register = original;
      }
    });
  });

  it("asks for a project rather than rendering an empty board", async () => {
    vi.resetModules();
    vi.doMock("@/hooks/useProjectId", () => ({ useProjectId: (): string | null => null }));
    const { default: Page } = (await import("../../DocumentControl")) as { default: () => JSX.Element };
    render(<Page />, { wrapper });
    expect(screen.getByText(/Select a project/i)).toBeInTheDocument();
    vi.doUnmock("@/hooks/useProjectId");
  });
});
