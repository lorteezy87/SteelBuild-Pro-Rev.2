// @vitest-environment jsdom

import React from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

const gateMocks = vi.hoisted(() => ({ project: vi.fn(), pieces: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: (table) => {
  if (table === "projects") return { select: () => ({ eq: () => ({ maybeSingle: gateMocks.project }) }) };
  const builder = { select: () => builder, eq: () => builder, is: () => builder, or: gateMocks.pieces };
  return builder;
} } }));
beforeEach(() => {
  gateMocks.project.mockReset().mockResolvedValue({ data: { piece_control_mode: "off" }, error: null });
  gateMocks.pieces.mockReset().mockResolvedValue({ count: 0, error: null });
});

// WPFormModal fetches the project's RFIs via react-query; stub the data layer.
vi.mock("@/api/supabaseClient", () => ({
  entities: { RFI: { filter: vi.fn(() => Promise.resolve([])) } },
}));

import WPFormModal from "../WPFormModal";

const projects = [{ id: "proj-1", name: "Rivergate Logistics Center" }];
const drawings = [
  { id: "dwg-1", project_id: "proj-1", sheet_number: "S-201", title: "Framing Plan", stage: "IFC" },
];
const existingWp = { id: "wp-1", project_id: "proj-1", name: "North frame", phase: "Detailing", status: "Not Started", percent_complete: 0, linked_drawing_ids: "dwg-1" };

function renderModal(props) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...render(
    <QueryClientProvider client={qc}>
      <WPFormModal open onClose={vi.fn()} onSave={vi.fn()} wp={null} projects={projects} nextNumber="WP-010" {...props} />
    </QueryClientProvider>,
  ), queryClient: qc };
}

describe("WPFormModal — new WP drawing assignment", () => {
  it.each(["pending-project", "error-project", "missing-project", "pending-pieces", "error-pieces", "unknown-piece-count"])("locks and omits standalone edit progress with %s evidence", async state => {
    if (state === "pending-project") gateMocks.project.mockReturnValue(new Promise(() => {}));
    else if (state === "error-project") gateMocks.project.mockResolvedValue({ data: null, error: new Error("Project unavailable") });
    else if (state === "missing-project") gateMocks.project.mockResolvedValue({ data: null, error: null });
    else {
      gateMocks.project.mockResolvedValue({ data: { piece_control_mode: "live" }, error: null });
      if (state === "pending-pieces") gateMocks.pieces.mockReturnValue(new Promise(() => {}));
      if (state === "error-pieces") gateMocks.pieces.mockResolvedValue({ count: null, error: new Error("Pieces unavailable") });
      if (state === "unknown-piece-count") gateMocks.pieces.mockResolvedValue({ count: null, error: null });
    }
    const onSave = vi.fn();
    const { container, queryClient } = renderModal({ wp: existingWp, onSave, allDrawings: drawings });
    await waitFor(() => expect(gateMocks.project).toHaveBeenCalled());
    if (state.includes("pieces") || state.includes("count")) await waitFor(() => expect(gateMocks.pieces).toHaveBeenCalled());
    if (!state.startsWith("pending")) await waitFor(() => expect(queryClient.getQueryState(["wp-piece-progress-gate", "proj-1", "wp-1"])?.status).toBe("error"));
    expect(container.querySelectorAll("select")[1]).toBeDisabled();
    expect(container.querySelectorAll("select")[2]).toBeDisabled();
    expect(container.querySelector('input[max="100"]')).toBeDisabled();
    expect(screen.getByText(/Phase, status and % complete stay locked/)).toBeInTheDocument();
    if (!state.startsWith("pending")) expect(screen.getByText("Retry progress checks", { selector: "button" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Update", { selector: "button" }));
    expect(onSave).toHaveBeenCalledOnce();
    for (const key of ["phase", "status", "percent_complete"]) expect(onSave.mock.calls[0][0]).not.toHaveProperty(key);
  });

  it("recovers standalone manual progress after retry verifies mode off", async () => {
    gateMocks.project.mockResolvedValue({ data: null, error: new Error("Unavailable") });
    const { container } = renderModal({ wp: existingWp });
    const retry = await screen.findByText("Retry progress checks", { selector: "button" });
    gateMocks.project.mockResolvedValue({ data: { piece_control_mode: "off" }, error: null });
    fireEvent.click(retry);
    await waitFor(() => expect(container.querySelectorAll("select")[1]).toBeEnabled());
    expect(screen.queryByText(/Phase, status and % complete stay locked/)).not.toBeInTheDocument();
    expect(gateMocks.pieces).not.toHaveBeenCalled();
  });

  it.each(["off", "live"])("allows standalone manual progress after successful %s configuration and empty scope", async mode => {
    gateMocks.project.mockResolvedValue({ data: { piece_control_mode: mode }, error: null });
    const onSave = vi.fn();
    const { container } = renderModal({ wp: existingWp, onSave });
    await waitFor(() => expect(container.querySelectorAll("select")[1]).toBeEnabled());
    fireEvent.click(screen.getByText("Update", { selector: "button" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ phase: "Detailing", status: "Not Started", percent_complete: 0 }));
    if (mode === "off") expect(gateMocks.pieces).not.toHaveBeenCalled();
    else expect(gateMocks.pieces).toHaveBeenCalled();
  });

  it.each(["pending", "error"])("uses proven canonical evidence while its independent gate is %s", async state => {
    gateMocks.project.mockImplementation(() => state === "pending" ? new Promise(() => {}) : Promise.reject(new Error("Unavailable")));
    const onSave = vi.fn();
    const wp = { id: "wp-1", project_id: "proj-1", name: "North frame", phase: "Detailing", status: "Not Started", percent_complete: 0, linked_drawing_ids: "dwg-1" };
    const { container, queryClient } = renderModal({ wp, onSave, pieceDrivenEvidence: true, allDrawings: drawings });
    await waitFor(() => expect(gateMocks.project).toHaveBeenCalled());
    await waitFor(() => expect(queryClient.getQueryState(["wp-piece-progress-gate", "proj-1", "wp-1"])?.status).toBe(state));
    const selects = container.querySelectorAll("select");
    expect(selects[1]).toBeDisabled();
    expect(selects[2]).toBeDisabled();
    expect(container.querySelector('input[max="100"]')).toBeDisabled();
    // The existing PhoenixModal backdrop hides its subtree from ARIA queries.
    // This regression exercises the real form's save handler and payload.
    fireEvent.click(screen.getByText("Update", { selector: "button" }));
    expect(onSave).toHaveBeenCalledOnce();
    const payload = onSave.mock.calls[0][0];
    expect(payload).not.toHaveProperty("phase");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("percent_complete");
    expect(payload.name).toBe("North frame");
  });

  it.each(["pending", "error"])("keeps confirmed manual progress editable while the independent lookup is %s", state => {
    gateMocks.project.mockImplementation(() => state === "pending" ? new Promise(() => {}) : Promise.reject(new Error("Unavailable")));
    const onSave = vi.fn();
    const wp = { id: "wp-1", project_id: "proj-1", name: "Manual package", linked_drawing_ids: "" };
    const { container } = renderModal({ wp, onSave, pieceDrivenEvidence: false });
    const selects = container.querySelectorAll("select");
    expect(selects[1]).toBeEnabled();
    expect(selects[2]).toBeEnabled();
    fireEvent.click(screen.getByText("Update", { selector: "button" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ phase: "Detailing", status: "Not Started", percent_complete: 0 }));
  });

  it("keeps new-create progress usable without an existing piece scope", () => {
    gateMocks.project.mockReturnValue(new Promise(() => {}));
    const onSave = vi.fn();
    const { container } = renderModal({ defaultProjectId: "proj-1", onSave });
    expect(container.querySelectorAll("select")[1]).toBeEnabled();
    fireEvent.change(screen.getByPlaceholderText("Work package name..."), { target: { value: "New framing scope" } });
    fireEvent.click(screen.getByText("Create", { selector: "button" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "New framing scope", phase: "Detailing", status: "Not Started", percent_complete: 0 }));
    expect(gateMocks.project).not.toHaveBeenCalled();
  });

  it("omits standalone progress if verification starts refreshing before the save handler repaints", async () => {
    const onSave = vi.fn();
    const { container, queryClient } = renderModal({ wp: existingWp, onSave });
    await waitFor(() => expect(container.querySelectorAll("select")[1]).toBeEnabled());
    gateMocks.project.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: ["wp-piece-progress-gate", "proj-1", "wp-1"] });
      fireEvent.click(screen.getByText("Update", { selector: "button" }));
    });
    expect(onSave).toHaveBeenCalledOnce();
    for (const key of ["phase", "status", "percent_complete"]) expect(onSave.mock.calls[0][0]).not.toHaveProperty(key);
  });

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

  it("keeps drawing-set picker rows readable after hover (theme tokens, not hardcoded navy)", () => {
    renderModal({ allDrawings: setDrawings, defaultProjectId: "proj-1" });
    const search = screen.getByPlaceholderText(/search drawing sets by name/i);
    fireEvent.focus(search);
    const row = screen.getByText("Anchor Bolts - OFA").closest("div");
    expect(row.style.color).toBe("var(--text-primary)");
    expect(row.style.background).not.toMatch(/rgb\(\s*18\s*,\s*25\s*,\s*38\s*\)/);
    fireEvent.mouseEnter(row);
    expect(row.style.background).toBe("var(--hover-bg)");
    expect(row.style.color).toBe("var(--text-primary)");
    fireEvent.mouseLeave(row);
    expect(row.style.background).toBe("transparent");
    expect(row.style.color).toBe("var(--text-primary)");
    expect(row.style.background).not.toMatch(/rgb\(\s*12\s*,\s*17\s*,\s*25\s*\)/);
  });
});
