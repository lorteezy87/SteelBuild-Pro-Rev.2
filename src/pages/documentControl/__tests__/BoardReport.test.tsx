// @vitest-environment jsdom
/**
 * The Board Report's standing guarantees, asserted rather than trusted.
 *
 * 1. WRITES ARE GATED AND CONFIRMED. Create / edit / delete were approved on
 *    2026-10-22. Every write control follows the project role (a viewer sees
 *    them disabled, never failing on click), a delete always asks first, and
 *    selecting a row still writes nothing.
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
  role: "pm" as "pm" | "viewer",
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
  // Newest first, the way the query orders them.
  transmittals: [
    {
      id: "t1",
      transmittal_number: "T-118-064",
      recipient_company: "Erection crew 2",
      sent_to: "R. Vega",
      purpose: "For erection",
      date_sent: "2026-10-17T14:20:00Z",
      recipient_email: "r.vega@crew2.example",
      acknowledged_at: null as string | null,
      acknowledged_by_name: null as string | null,
    },
    {
      id: "t0",
      transmittal_number: "T-118-061",
      recipient_company: "Erection crew 2",
      sent_to: "R. Vega",
      purpose: "For erection",
      date_sent: "2026-10-02T14:20:00Z",
      recipient_email: "r.vega@crew2.example",
      acknowledged_at: "2026-10-02T18:00:00Z" as string | null,
      acknowledged_by_name: "R. Vega" as string | null,
    },
  ],
  /**
   * T-118-061 issued E-203 at Rev 0 and 4001 at Rev 0; T-118-064 re-issues
   * E-203 at Rev 1 (a supersede) and 4001 again at Rev 0 (a plain resend,
   * which supersedes nothing).
   */
  transmittalItems: [
    { id: "i1", transmittal_id: "t0", number_at_send: "E-203", revision_at_send: "0", title_at_send: "Seq 3 roof framing plan", sort_order: 1 },
    { id: "i2", transmittal_id: "t0", number_at_send: "4001", revision_at_send: "0", title_at_send: "Stair ST-1 stringers", sort_order: 2 },
    { id: "i3", transmittal_id: "t1", number_at_send: "E-203", revision_at_send: "1", title_at_send: "Seq 3 roof framing plan", sort_order: 1 },
    { id: "i4", transmittal_id: "t1", number_at_send: "4001", revision_at_send: "0", title_at_send: "Stair ST-1 stringers", sort_order: 2 },
  ] as Array<Record<string, unknown>> | null,
}));

vi.mock("@/api/supabaseClient", () => ({
  EFFECTIVE_LIST_CAP: 1000,
  entities: {
    Submittal: { filter: vi.fn(async () => m.submittals) },
    RFI: { filter: vi.fn(async () => m.rfis) },
    DrawingTransmittal: {
      filter: vi.fn(async () => m.transmittals),
      create: vi.fn(async (row: Record<string, unknown>) => ({ id: "t-new", status: "sent", ...row })),
      update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
    },
    DrawingTransmittalItem: {
      filter: vi.fn(async () => {
        // null stands for a read that does not land, so the pane and the
        // Sheets column have to say "unknown" rather than "none".
        if (m.transmittalItems === null) throw new Error("contents unavailable");
        return m.transmittalItems;
      }),
    },
  },
}));

vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({
    // Mirrors the real floors closely enough for the gate: viewers do nothing.
    can: () => m.role === "pm",
  }),
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
import { entities } from "@/api/supabaseClient";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

/** The loaded contents fixture, kept so a test that blanks it can restore it. */
const ITEMS = m.transmittalItems;

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

  it("disables every write control for a role that may not write, and offers no create", async () => {
    m.role = "viewer";
    try {
      renderPage();
      for (const tab of ["Register", "Submittals", "RFIs", "Transmittals"]) {
        await goTo(tab);
        expect(screen.queryByRole("button", { name: /^\+ New/ })).toBeNull();
        for (const name of [/^Edit/, /^Delete$/, /acknowledgement/i]) {
          for (const control of screen.queryAllByRole("button", { name })) {
            expect(control).toBeDisabled();
            // It says why instead of silently failing.
            expect(control).toHaveAttribute("title", expect.stringMatching(/project role cannot/));
          }
        }
      }
    } finally {
      m.role = "pm";
    }
  });

  it("offers create on each log for a role that may write", async () => {
    renderPage();
    for (const [tab, label] of [
      ["Register", "+ New sheet"],
      ["Submittals", "+ New submittal"],
      ["RFIs", "+ New RFI"],
      ["Transmittals", "+ New transmittal"],
    ]) {
      await goTo(tab);
      expect(screen.getByRole("button", { name: label })).toBeEnabled();
    }
  });

  it("asks before deleting, and deletes a transmittal softly so its audit trail survives", async () => {
    const { fireEvent, waitFor } = await import("@testing-library/react");
    renderPage();
    await goTo("Transmittals");
    await screen.findByRole("button", { name: /Transmittal T-118-064/ });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    // Nothing is written until the confirmation is accepted.
    expect(entities.DrawingTransmittal.update).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(entities.DrawingTransmittal.update).toHaveBeenCalledWith("t1", { is_deleted: true }),
    );
  });

  it("records who acknowledged a transmittal, and will not record an anonymous one", async () => {
    const { fireEvent, waitFor } = await import("@testing-library/react");
    vi.mocked(entities.DrawingTransmittal.update).mockClear();
    renderPage();
    await goTo("Transmittals");
    await screen.findByRole("button", { name: /Transmittal T-118-064/ });
    fireEvent.click(screen.getByRole("button", { name: "Record acknowledgement" }));
    const dialog = await screen.findByRole("dialog", { name: /Record acknowledgement/ });
    const by = within(dialog).getByLabelText("Acknowledged by");
    // Prefilled from the attention line; cleared, the save is refused.
    expect(by).toHaveValue("R. Vega");
    fireEvent.change(by, { target: { value: "  " } });
    expect(within(dialog).getByRole("button", { name: "Record acknowledgement" })).toBeDisabled();
    fireEvent.change(by, { target: { value: "M. Ortiz" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record acknowledgement" }));
    await waitFor(() =>
      expect(entities.DrawingTransmittal.update).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ acknowledged_by_name: "M. Ortiz", acknowledged_at: expect.any(String) }),
      ),
    );
  });

  it("logs a new transmittal as outgoing on the active project", async () => {
    const { fireEvent, waitFor } = await import("@testing-library/react");
    renderPage();
    await goTo("Transmittals");
    fireEvent.click(screen.getByRole("button", { name: "+ New transmittal" }));
    const dialog = await screen.findByRole("dialog", { name: "New transmittal" });
    const save = within(dialog).getByRole("button", { name: "Log transmittal" });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Transmittal number"), { target: { value: "T-118-065" } });
    fireEvent.change(within(dialog).getByLabelText("Recipient company"), { target: { value: "Erection crew 2" } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(entities.DrawingTransmittal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transmittal_number: "T-118-065",
          direction: "outgoing",
          recipient_company: "Erection crew 2",
          project_id: "p1",
        }),
      ),
    );
  });

  it("selecting a row writes nothing", async () => {
    const { fireEvent } = await import("@testing-library/react");
    vi.mocked(entities.DrawingTransmittal.update).mockClear();
    vi.mocked(entities.DrawingTransmittal.create).mockClear();
    renderPage();
    for (const tab of ["Register", "Submittals", "RFIs", "Transmittals"]) {
      await goTo(tab);
      for (const row of screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"))) {
        fireEvent.click(row);
      }
    }
    expect(entities.DrawingTransmittal.update).not.toHaveBeenCalled();
    expect(entities.DrawingTransmittal.create).not.toHaveBeenCalled();
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
   * The design's transmittal screen carries six columns and a pane that lists
   * what went out. The Sheets column and the contents list shipped missing
   * because `drawing_transmittal_items` was not read; these pin them.
   */
  describe("transmittal contents", () => {
    // The transmittal number appears in both the row and the pane eyebrow, so
    // this only navigates; each test asserts on what it actually cares about.
    const findRows = async () => {
      await goTo("Transmittals");
    };

    it("prints a real sheet count in the Sheets column", async () => {
      renderPage();
      await findRows();
      await screen.findByText("Contents");
      // Both transmittals carry two sheets each.
      expect(screen.getByText("Sheets")).toBeInTheDocument();
      expect(await screen.findByText("2 sheets")).toBeInTheDocument();
    });

    it("lists each sheet as number, revision and title", async () => {
      renderPage();
      await findRows();
      await screen.findByText("Contents");
      expect(screen.getAllByText("E-203").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Seq 3 roof framing plan").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Stair ST-1 stringers").length).toBeGreaterThan(0);
    });

    it("shows the sheet list as unknown, never as empty, when the read fails", async () => {
      m.transmittalItems = null;
      try {
        renderPage();
        await findRows();
        expect(await screen.findByText("Sheet list not loaded.")).toBeInTheDocument();
        // The honest answer is a dash. A 0 would describe a transmittal that
        // carried no sheets, which is not a thing that happens.
        expect(screen.queryByText(/No sheets are recorded/)).not.toBeInTheDocument();
      } finally {
        m.transmittalItems = ITEMS;
      }
    });

    it("flags the earlier revision a re-issue supersedes", async () => {
      renderPage();
      await findRows();
      expect(await screen.findByText(/Supersedes 1 earlier revision/)).toBeInTheDocument();
      // E-203 went from Rev 0 to Rev 1, so Rev 0 is the copy still in the field.
      expect(screen.getByText("E-203 Rev 0")).toBeInTheDocument();
    });

    it("does not call a same-revision resend a supersede", async () => {
      renderPage();
      await findRows();
      await screen.findByText(/Supersedes 1 earlier revision/);
      // 4001 was sent twice at Rev 0 — a resend, not a recall.
      expect(screen.queryByText("4001 Rev 0")).not.toBeInTheDocument();
    });

    /**
     * `drawing_id` and `gc_drawing_id` are separate drawing spaces and the same
     * sheet number lives in both, so keying this history by the number alone
     * raised a pull-from-field warning against an unrelated drawing.
     */
    it("does not merge a GC drawing with a shop drawing that shares its number", async () => {
      m.transmittalItems = [
        { id: "g1", transmittal_id: "t0", gc_drawing_id: "gc-501", number_at_send: "A-501", revision_at_send: "0", title_at_send: "GC architectural plan", sort_order: 1 },
        { id: "s1", transmittal_id: "t1", drawing_id: "shop-501", number_at_send: "A-501", revision_at_send: "2", title_at_send: "Shop detail A-501", sort_order: 1 },
      ];
      try {
        renderPage();
        await findRows();
        await screen.findByText("Contents");
        // Same number, different drawing spaces, different revisions — and
        // still nothing to pull from the field.
        expect(screen.queryByText(/Supersedes/)).not.toBeInTheDocument();
      } finally {
        m.transmittalItems = ITEMS;
      }
    });

    /**
     * The pane's claim is that THIS recipient still holds the earlier copy, so
     * a delivery to another company is not evidence about them.
     */
    it("does not tell one recipient to pull a revision another company was sent", async () => {
      const original = m.transmittals;
      m.transmittals = [
        { ...original[0], recipient_company: "Steel erectors LLC", sent_to: "P. Nolan", recipient_email: "p.nolan@erectors.example" },
        { ...original[1] },
      ];
      try {
        renderPage();
        await findRows();
        await screen.findByText("Contents");
        expect(screen.queryByText(/Supersedes/)).not.toBeInTheDocument();
      } finally {
        m.transmittals = original;
      }
    });

    /**
     * A capped read can be missing the intervening issuance, which names the
     * WRONG prior revision — on a pane that is at the same time admitting the
     * sheet list did not load. Absence is not evidence.
     */
    it("claims no supersede at all from a truncated contents read", async () => {
      // EFFECTIVE_LIST_CAP is mocked at 1000; fill it so the read reads as cut off.
      const filler = Array.from({ length: 998 }, (_, i) => ({
        id: `f${i}`,
        transmittal_id: "t0",
        number_at_send: `F-${i}`,
        revision_at_send: "0",
        title_at_send: `Filler ${i}`,
        sort_order: i + 10,
      }));
      m.transmittalItems = [...(ITEMS ?? []), ...filler];
      try {
        renderPage();
        await findRows();
        expect(await screen.findByText("Sheet list not loaded.")).toBeInTheDocument();
        expect(screen.queryByText(/Supersedes/)).not.toBeInTheDocument();
      } finally {
        m.transmittalItems = ITEMS;
      }
    });
  });

  /**
   * The comps label the register's next-step button by what the sheet needs
   * next. It is a link out to the flow that owns that step (editing the sheet
   * itself is the pane's Edit button), but the label is the design's, and a
   * single generic one threw that away.
   */
  it("labels the register's primary action by sheet status", async () => {
    renderPage();
    await goTo("Register");
    // E-203 is Revise & Resubmit and selected first.
    expect(screen.getByRole("link", { name: "Upload next revision" })).toBeInTheDocument();

    const { fireEvent } = await import("@testing-library/react");
    // 4001 carries an active hold, which outranks its Released stage.
    fireEvent.click(screen.getByText("Stair ST-1 stringers"));
    expect(screen.getByRole("link", { name: "Open RFI" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Upload next revision" })).not.toBeInTheDocument();
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
