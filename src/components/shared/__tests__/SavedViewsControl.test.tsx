// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuthContext } from "@/lib/AuthContext";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SavedViewsControl from "../SavedViewsControl";
import { storageKey } from "@/lib/savedRegisterViews";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function renderAs(userId: string | null, filters: Record<string, string | boolean>, onApply = vi.fn()) {
  const value = { user: userId ? { id: userId } : null } as never;
  const ui = (f: Record<string, string | boolean>, v = value) => (
    <AuthContext.Provider value={v}>
      <SavedViewsControl register="drawing_register" currentFilters={f} onApply={onApply} />
    </AuthContext.Provider>
  );
  const r = render(ui(filters));
  return { ...r, onApply, rerenderWith: (f: Record<string, string | boolean>, user?: string) => r.rerender(ui(f, user ? ({ user: { id: user } } as never) : value)) };
}

describe("SavedViewsControl", () => {
  it("saves the current filters under a name and applies them back", () => {
    const { onApply, rerenderWith } = renderAs("u1", { query: "S-1", statusFilter: "on_hold", groupBySet: true });
    expect(screen.getByRole("option", { name: "No saved views" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Holds" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const stored = JSON.parse(localStorage.getItem(storageKey("drawing_register", "u1")) || "[]");
    expect(stored).toEqual([expect.objectContaining({ name: "Holds", filters: { query: "S-1", statusFilter: "on_hold", groupBySet: true } })]);

    rerenderWith({ query: "", statusFilter: "all", groupBySet: false });
    const select = screen.getByLabelText("Saved views");
    fireEvent.change(select, { target: { value: "" } });
    fireEvent.change(select, { target: { value: stored[0].id } });
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Holds" }));
  });

  it("deletes the selected view", () => {
    localStorage.setItem(storageKey("drawing_register", "u1"), JSON.stringify([{ id: "a", name: "Mine", filters: {} }]));
    renderAs("u1", {});
    fireEvent.change(screen.getByLabelText("Saved views"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete selected view" }));
    expect(JSON.parse(localStorage.getItem(storageKey("drawing_register", "u1")) || "[]")).toEqual([]);
  });

  it("keeps each user's views separate and re-reads on account switch", () => {
    localStorage.setItem(storageKey("drawing_register", "u1"), JSON.stringify([{ id: "a", name: "U1 view", filters: {} }]));
    localStorage.setItem(storageKey("drawing_register", "u2"), JSON.stringify([{ id: "b", name: "U2 view", filters: {} }]));
    const { rerenderWith } = renderAs("u1", {});
    expect(screen.getByRole("option", { name: "U1 view" })).toBeInTheDocument();
    rerenderWith({}, "u2");
    expect(screen.queryByRole("option", { name: "U1 view" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "U2 view" })).toBeInTheDocument();
  });

  it("works without an auth provider (falls back to an anonymous bucket)", () => {
    render(<SavedViewsControl register="submittal_register" currentFilters={{}} onApply={vi.fn()} />);
    expect(screen.getByLabelText("Saved views")).toBeInTheDocument();
  });
});
