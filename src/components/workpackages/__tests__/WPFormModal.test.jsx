// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// WPFormModal fetches the project's RFIs via react-query; stub the data layer.
vi.mock("@/api/supabaseClient", () => ({
  entities: { RFI: { filter: vi.fn(() => Promise.resolve([])) } },
}));

import WPFormModal from "../WPFormModal";

const projects = [{ id: "proj-1", name: "Skyport at Redfield" }];
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
