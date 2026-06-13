// @vitest-environment jsdom
//
// Import-flow integration test for the Production Status importer (Tekla EPM /
// FabSuite CSV → piece_production). Drives the REAL modal — upload → parse →
// staged review → commit — with only the repository commit mocked, asserting the
// exact (projectId, rows) payload handed to the writer. Companion to the Drawing
// Log test; together they prove the staged-import pattern across two importers.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const commitProductionRows = vi.fn().mockResolvedValue({ created: 2, updated: 0 });
vi.mock("@/lib/production/repository", () => ({ commitProductionRows: (...a) => commitProductionRows(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import ProductionStatusImportModal from "@/components/production/ProductionStatusImportModal";

// jsdom File.text() can be flaky across versions — pin it to our bytes.
function csvFile(text, name = "production.csv") {
  const file = new File([text], name, { type: "text/csv" });
  file.text = async () => text;
  return file;
}

const PROD_CSV = [
  "Piece Mark,Assembly,Status,% Complete,Qty,Weight,Sequence,Area",
  "B-101,A-1,Welding,60,2,450,S1,North",
  "C-200,A-2,Shipped,100,1,300,S2,South",
].join("\n");

function renderModal(props = {}) {
  return render(
    <ProductionStatusImportModal open projectId="p1" projectName="Skyport" existing={[]} onClose={() => {}} onImported={() => {}} {...props} />,
  );
}

describe("ProductionStatusImportModal — import flow", () => {
  beforeEach(() => { vi.clearAllMocks(); commitProductionRows.mockResolvedValue({ created: 2, updated: 0 }); });

  it("uploads a production CSV, stages the pieces, and commits them", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.upload(document.querySelector('input[type="file"]'), csvFile(PROD_CSV));
    await user.click(await screen.findByRole("button", { name: /Review pieces/i }));

    // staged review shows both pieces as new
    await waitFor(() => expect(screen.getByText("B-101")).toBeInTheDocument(), { timeout: 4000 });
    expect(screen.getByText("C-200")).toBeInTheDocument();
    expect(screen.getAllByText(/CREATE/i).length).toBeGreaterThanOrEqual(2);

    // commit → repository gets (projectId, the parsed rows)
    await user.click(screen.getByRole("button", { name: /Import 2 pieces/i }));
    await waitFor(() => expect(commitProductionRows).toHaveBeenCalledTimes(1), { timeout: 4000 });

    const [projectId, rows] = commitProductionRows.mock.calls[0];
    expect(projectId).toBe("p1");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.piece_mark).sort()).toEqual(["B-101", "C-200"]);
    // the welded piece resolved to the canonical Weld stage (not Shipped), per
    // the status map — the resolved stage is carried in `status`.
    const b101 = rows.find((r) => r.piece_mark === "B-101");
    expect(b101.status).toBe("Weld");
  });

  it("can exclude a row before import", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.upload(document.querySelector('input[type="file"]'), csvFile(PROD_CSV));
    await user.click(await screen.findByRole("button", { name: /Review pieces/i }));
    await screen.findByText("B-101");

    await user.click(screen.getByLabelText("Include C-200")); // uncheck it
    await user.click(screen.getByRole("button", { name: /Import 1 piece/i }));

    await waitFor(() => expect(commitProductionRows).toHaveBeenCalledTimes(1));
    const [, rows] = commitProductionRows.mock.calls[0];
    expect(rows.map((r) => r.piece_mark)).toEqual(["B-101"]);
  });

  it("surfaces a parse error when the piece-mark column is missing", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.upload(document.querySelector('input[type="file"]'), csvFile("foo,bar\n1,2", "bad.csv"));
    await user.click(await screen.findByRole("button", { name: /Review pieces/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument(), { timeout: 4000 });
    expect(commitProductionRows).not.toHaveBeenCalled();
  });
});
