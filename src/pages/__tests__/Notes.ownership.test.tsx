// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/lib/AuthContext";
import { LEGACY_NOTES_KEY, localDataKey } from "@/lib/localDataOwnership";
import type { InkDocument, PaperStyle } from "@/lib/notesInk/types";
import Notes from "../Notes";

const mocks = vi.hoisted(() => ({ orgId: "one" as string | null }));
vi.mock("@/lib/AuthContext", async () => ({
  AuthContext: (await import("react")).createContext(null),
}));
vi.mock("@/components/shared/OrgContext", () => ({
  useOptionalOrg: () => ({ currentOrg: mocks.orgId ? { id: mocks.orgId } : null }),
}));
vi.mock("@/lib/native/fileExport", () => ({ presentGeneratedFile: vi.fn() }));
vi.mock("@/components/notes/InkCanvas", () => ({
  setInkPaper: (doc: InkDocument, paper: PaperStyle) => ({ ...doc, paper }),
  InkCanvas: ({ doc, mode, onChange }: {
    doc: InkDocument; mode: string; onChange: (next: InkDocument) => void;
  }) => <div data-testid="ink" data-mode={mode}>
    <span>{doc.strokes.length} saved strokes</span>
    <button type="button" onClick={() => onChange({
      ...doc,
      strokes: [...doc.strokes, {
        id: "stroke-1", tool: "pen", color: "#000000", size: 2,
        points: [{ x: 1, y: 2, p: 0.5, t: 1 }],
      }],
    })}>Draw sample stroke</button>
  </div>,
}));

const authFor = (id: string | null) => ({
  isAuthenticated: !!id,
  user: id ? { id, email: id + "@example.test", full_name: id, role: "user" } : null,
}) as AuthContextValue;
const tree = (userId: string | null) =>
  <AuthContext.Provider value={authFor(userId)}><Notes /></AuthContext.Provider>;

beforeEach(() => { localStorage.clear(); mocks.orgId = "one"; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each([
  { userId: "b", orgId: "one", label: "user" },
  { userId: "a", orgId: "two", label: "workspace" },
])("isolates text and ink across a $label switch and restores only the returning owner's notes", ({ userId, orgId }) => {
  const view = render(tree("a"));
  fireEvent.click(screen.getByRole("button", { name: "New note" }));
  fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "A private title" } });
  fireEvent.change(screen.getByPlaceholderText(/Type notes here/), { target: { value: "A private text" } });
  fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
  fireEvent.click(screen.getByRole("button", { name: "Draw sample stroke" }));
  fireEvent.click(screen.getByRole("button", { name: "Undo stroke" }));
  expect(screen.getByText("0 saved strokes")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Redo stroke" }));
  expect(screen.getByText("1 saved strokes")).toBeTruthy();
  const firstKey = localDataKey("notes", { userId: "a", orgId: "one" })!;
  const firstPayload = localStorage.getItem(firstKey);

  mocks.orgId = orgId;
  view.rerender(tree(userId));
  expect(screen.queryByDisplayValue("A private title")).toBeNull();
  expect(screen.queryByDisplayValue("A private text")).toBeNull();
  expect(screen.queryByTestId("ink")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "New note" }));
  fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "Other scope" } });
  expect(screen.getByText("0 saved strokes")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Redo stroke" }));
  expect(screen.getByText("0 saved strokes")).toBeTruthy();
  expect(localStorage.getItem(firstKey)).toBe(firstPayload);

  mocks.orgId = "one";
  view.rerender(tree("a"));
  expect(screen.getByDisplayValue("A private text")).toBeTruthy();
  expect(screen.getByText("1 saved strokes")).toBeTruthy();
  expect(screen.getByTestId("ink").getAttribute("data-mode")).toBe("text");
  expect(screen.queryByDisplayValue("Other scope")).toBeNull();
});

it("preserves ownerless legacy notes without reading or assigning their content", () => {
  const legacy = JSON.stringify([{ id: "legacy", title: "Unknown owner's secret", text: "Do not expose" }]);
  localStorage.setItem(LEGACY_NOTES_KEY, legacy);
  const read = vi.spyOn(Storage.prototype, "getItem");
  const view = render(tree("a"));
  expect(screen.getByRole("status").textContent).toContain("preserved and hidden");
  expect(screen.queryByText("Unknown owner's secret")).toBeNull();
  view.rerender(tree("b"));
  expect(read.mock.calls.some(([key]) => key === LEGACY_NOTES_KEY)).toBe(false);
  read.mockRestore();
  expect(localStorage.getItem(LEGACY_NOTES_KEY)).toBe(legacy);
});

it("does not create an anonymous or workspace-free notes store", () => {
  const view = render(tree(null));
  expect(screen.getByRole("status").textContent).toContain("Sign in and choose a workspace");
  expect(screen.queryByRole("button", { name: "New note" })).toBeNull();
  mocks.orgId = null;
  view.rerender(tree("a"));
  expect(localStorage.length).toBe(0);
});
