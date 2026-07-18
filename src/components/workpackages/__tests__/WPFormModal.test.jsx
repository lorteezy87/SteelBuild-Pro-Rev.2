// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// WPFormModal fetches the project's RFIs via react-query; stub the data layer.
vi.mock("@/api/supabaseClient", () => ({
  entities: { RFI: { filter: vi.fn(() => Promise.resolve([])) } },
}));

import WPFormModal from "../WPFormModal";

const projects = [{ id: "proj-1", name: "Rivergate Logistics Center" }];
const drawings = [
  { id: "dwg-1", project_id: "proj-1", sheet_number: "S-201", title: "Framing Plan", stage: "IFC" },
];

function renderModal(props) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WPFormModal open onClose={vi.fn()} onSave={vi.fn()} wp={null} projects={projects} nextNumber="WP-010" {...props} />
    </QueryClientProvider>,
  );
}

describe("WPFormModal — new WP drawing assignment", () => {
  it("pre-selects the active project so the drawings picker is unlocked", () => {
    const { container } = renderModal({ allDrawings: drawings, defaultProjectId: "proj-1" });
    // First <select> in the form is the Project select — it should carry the active project.
    const projectSelect = container.querySelector("select");
    expect(projectSelect.value).toBe("proj-1");
    // …and the "pick a project first" gate must be gone since a project is set.
    expect(screen.queryByText(/Select a project to see available drawings/i)).toBeNull();
  });

  it("keeps the picker gated when there is no active project (All Projects view)", () => {
    const { container } = renderModal({ allDrawings: drawings, defaultProjectId: "" });
    const projectSelect = container.querySelector("select");
    expect(projectSelect.value).toBe("");
    expect(screen.getByText(/Select a project to see available drawings/i)).toBeInTheDocument();
  });
});

// Two sets: "Main Steel - IFC" (2 sheets) and "Anchor Bolts - OFA" (1 sheet).
const setDrawings = [
  { id: "d1", project_id: "proj-1", sheet_number: "S-201", title: "Framing Plan", stage: "IFC", drawing_set_name: "Main Steel - IFC" },
  { id: "d2", project_id: "proj-1", sheet_number: "S-202", title: "Roof Framing", stage: "IFC", drawing_set_name: "Main Steel - IFC" },
  { id: "d3", project_id: "proj-1", sheet_number: "A-101", title: "Anchor Layout", stage: "OFA", drawing_set_name: "Anchor Bolts - OFA" },
];

describe("WPFormModal — set-based drawing assignment (§21)", () => {
  it("groups linked sheets into a single drawing-set chip (not per-sheet)", () => {
    const wp = { id: "wp-1", project_id: "proj-1", name: "WP A", linked_drawing_ids: "d1,d2" };
    renderModal({ allDrawings: setDrawings, defaultProjectId: "proj-1", wp });
    // One chip for the SET, labelled by set name + sheet count…
    expect(screen.getByText("Main Steel - IFC")).toBeInTheDocument();
    expect(screen.getByText(/2 sheets/i)).toBeInTheDocument();
    // …and NOT individual per-sheet chips like the old "[S-201]" picker.
    expect(screen.queryByText(/\[S-201\]/)).toBeNull();
    expect(screen.queryByText(/\[S-202\]/)).toBeNull();
  });

  it("offers drawing SETS in the picker, not individual sheets", () => {
    renderModal({ allDrawings: setDrawings, defaultProjectId: "proj-1" });
    const search = screen.getByPlaceholderText(/search drawing sets by name/i);
    fireEvent.focus(search);
    // Both unlinked sets are offered…
    expect(screen.getByText("Anchor Bolts - OFA")).toBeInTheDocument();
    expect(screen.getByText("Main Steel - IFC")).toBeInTheDocument();
    // …as sets (sheet-count summary), not raw sheet-number rows.
    expect(screen.queryByText(/\[A-101\]/)).toBeNull();
  });
});
