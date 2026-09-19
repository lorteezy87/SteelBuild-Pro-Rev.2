// @vitest-environment jsdom
//
// Render guard for the sheet picker's empty state. The holds query and the
// register query are SEPARATE reads and only the holds one is guarded by the
// panel's loading/error branches. An unread register defaulted to `[]`, and
// `holdableSheets([])` is `[]`, so the picker announced "Every sheet already
// has an active hold." Live `drawing_holds` is empty, so the holds query wins
// the race on every visit and that false claim was the default first paint.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";

let registerState: { data: DrawingRegisterRow[] | undefined; isLoading: boolean; error: Error | null };
let holdsState: { data: DrawingHoldRow[] | undefined; isLoading: boolean; error: Error | null };

vi.mock("@/hooks/useDrawingRegister", () => ({
  useDrawingRegister: () => registerState,
}));
vi.mock("@/hooks/useDrawingHolds", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useDrawingHolds")>()),
  useDrawingHolds: () => holdsState,
}));
vi.mock("@/services/permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1", email: "pm@x.com" } }) }));

import { HoldsPanel } from "../HoldsPanel";

const HELD_CLAIM = /Every sheet already has an active hold\./;

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HoldsPanel projectId="p1" />
    </QueryClientProvider>,
  );
}

async function openPicker() {
  await userEvent.click(screen.getByRole("button", { name: /^Place hold$/ }));
}

const sheet = (over: Partial<DrawingRegisterRow>): DrawingRegisterRow => ({
  drawing_id: "d1",
  sheet_number: "S-101",
  sheet_title: "Framing plan",
  current_revision_id: "r1",
  current_status: "released",
  active_hold_id: null,
  ...over,
} as DrawingRegisterRow);

beforeEach(() => {
  // Holds answered with zero rows — the live shape today.
  holdsState = { data: [], isLoading: false, error: null };
});

describe("HoldsPanel sheet picker", () => {
  it("does not claim every sheet is held while the register is still loading", async () => {
    registerState = { data: undefined, isLoading: true, error: null };
    renderPanel();
    await openPicker();
    expect(screen.queryByText(HELD_CLAIM)).not.toBeInTheDocument();
    expect(screen.getByText(/Loading sheets…/)).toBeInTheDocument();
  });

  it("does not claim every sheet is held when the register read failed", async () => {
    registerState = { data: undefined, isLoading: false, error: new Error("boom") };
    renderPanel();
    await openPicker();
    expect(screen.queryByText(HELD_CLAIM)).not.toBeInTheDocument();
    expect(screen.getByText(/Couldn't load the sheet list/)).toBeInTheDocument();
  });

  it("still makes the claim when the register really is read and every sheet is held", async () => {
    registerState = { data: [sheet({ active_hold_id: "h1" })], isLoading: false, error: null };
    renderPanel();
    await openPicker();
    expect(screen.getByText(HELD_CLAIM)).toBeInTheDocument();
  });

  it("offers holdable sheets once the register lands", async () => {
    registerState = { data: [sheet({})], isLoading: false, error: null };
    renderPanel();
    await openPicker();
    expect(screen.getByRole("option", { name: /S-101/ })).toBeInTheDocument();
    expect(screen.queryByText(HELD_CLAIM)).not.toBeInTheDocument();
  });
});
