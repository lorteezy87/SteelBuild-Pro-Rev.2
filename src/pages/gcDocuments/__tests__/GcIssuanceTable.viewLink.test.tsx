// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import GcIssuanceTable from "../GcIssuanceTable";

const storage = vi.hoisted(() => ({ resolve: vi.fn(async () => "https://storage.example/signed.pdf") }));
vi.mock("@/api/client/storage", () => ({ resolveFileUrl: storage.resolve }));

type AnyProps = Record<string, unknown>;

// The real prop type is built from the generated gc_drawings row, which is far
// wider than this test needs. Cast once at the boundary and build minimal
// fixtures, rather than hand-maintaining a full row per sheet.
const Table = GcIssuanceTable as unknown as React.FC<AnyProps>;

function issuance(overrides: AnyProps = {}): AnyProps {
  return {
    id: "set-1",
    set: {
      id: "set-1",
      set_name: "ASI 012",
      doc_type: "asi",
      doc_number: "ASI 012",
      steel_impact: "impacted",
      received_date: "2026-09-01",
      sheet_count: 2,
    },
    sheets: [],
    currentSheets: [],
    ...overrides,
  };
}

function sheet(id: string, file_url: string | null) {
  return {
    id,
    drawing_number: `S-${id}`,
    title: `Sheet ${id}`,
    revision: "A",
    file_url,
    is_superseded: false,
  };
}

function renderTable(sheets: ReturnType<typeof sheet>[]) {
  return render(
    <MemoryRouter>
      <Table
        issuances={[issuance({ sheets, currentSheets: sheets })]}
        expanded={new Set(["set-1"])}
        canEdit={false}
        canDelete={false}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
        onSetImpact={vi.fn()}
        onDelete={vi.fn()}
      />
    </MemoryRouter>,
  );
}

function renderAffectedLinks(linked: boolean) {
  return render(
    <MemoryRouter>
      <Table
        issuances={[issuance({ label: "ASI 012" })]}
        expanded={new Set(["set-1"])}
        linksByIssuance={linked ? new Map([["set-1", [{
          id: "link-1", project_id: "project-1", gc_drawing_set_id: "set-1",
          drawing_set_id: "shop-1", created_by: null, created_at: "2026-10-07",
        }]]]) : new Map()}
        shopSets={[{ id: "shop-1", set_name: "Canopy framing", register: "structural" }]}
        impactLinksStatus="available"
        canEdit={false}
        canDelete={false}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
        onSetImpact={vi.fn()}
        onDelete={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("GcIssuanceTable view link", () => {
  it("links a sheet that has a file into the GC viewer, keyed by its id", () => {
    renderTable([sheet("301", "projects/p/asi-012.pdf")]);

    const link = screen.getByRole("link", { name: "View" });
    expect(link).toHaveAttribute("href", "/GcDrawingViewer?doc=301");
  });

  it("keeps a document-only issuance PDF accessible without inventing a sheet", async () => {
    render(
      <MemoryRouter>
        <Table
          issuances={[issuance({ set: { ...issuance().set as object, file_url: "org/uploads/asi.pdf" }, label: "ASI 012" })]}
          expanded={new Set(["set-1"])}
          canEdit={false}
          canDelete={false}
          onToggleExpand={vi.fn()}
          onEdit={vi.fn()}
          onSetImpact={vi.fn()}
          onDelete={vi.fn()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole("link", { name: "Open GC source PDF" })).toHaveAttribute("href", "https://storage.example/signed.pdf"));
    expect(storage.resolve).toHaveBeenCalledWith("org/uploads/asi.pdf");
    expect(screen.getByTitle("GC source PDF preview")).toHaveAttribute("src", "https://storage.example/signed.pdf");
  });

  // A register row can be logged before its PDF lands. Offering View there
  // would open an empty viewer, which reads as a broken file rather than as
  // "nothing uploaded yet" -- so say which it is instead of linking.
  it("offers no link, and says why, when the sheet has no file", () => {
    renderTable([sheet("302", null)]);

    expect(screen.queryByRole("link", { name: "View" })).toBeNull();
    expect(screen.getByText("No file")).toBeInTheDocument();
  });

  it("decides per sheet, not per issuance", () => {
    renderTable([sheet("303", "projects/p/asi-012.pdf"), sheet("304", null)]);

    expect(screen.getAllByRole("link", { name: "View" })).toHaveLength(1);
    expect(screen.getByText("No file")).toBeInTheDocument();

    const withFile = screen.getByText("S-303").closest("tr") as HTMLElement;
    expect(within(withFile).getByRole("link", { name: "View" })).toBeInTheDocument();
  });

  it("shows only explicitly linked shop set IDs, distinct from GC sheet numbers", () => {
    renderAffectedLinks(true);
    expect(screen.getByText("1 affected shop set explicitly linked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Canopy framing" })).toHaveAttribute(
      "href", "/DrawingSubmittalHub?hub_tab=drawings&hub_view=sets&set=shop-1",
    );
    expect(screen.getByText(/Impact mapping only/)).toBeInTheDocument();
  });

  it("says no exact links where the relation has none", () => {
    renderAffectedLinks(false);
    expect(screen.getByText("No shop sets explicitly linked")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Canopy framing" })).toBeNull();
  });
});
