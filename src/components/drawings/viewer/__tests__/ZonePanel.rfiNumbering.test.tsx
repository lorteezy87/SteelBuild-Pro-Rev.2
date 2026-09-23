// @vitest-environment jsdom
//
// "Create RFI from zone" must take its official number from the atomic
// get_next_sequence_number RPC (via getNextFormattedNumber) and nowhere else.
//
// ZonePanel used to catch an allocator failure and fall back to
// `RFI #${String(Date.now()).slice(-6)}`, then create the RFI anyway. An outage
// therefore minted an official RFI number the sequence never issued — and
// would later issue to somebody else. Every other RFI create path fails closed
// (RFIFormModal, useRfiPageMutations, EscalateModal, rfiFromDelta); so must
// this one: no number, no RFI, and the user is told.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  rfiCreate: vi.fn(),
  allocate: vi.fn(),
  createLink: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: { RFI: { create: (...a: unknown[]) => mocks.rfiCreate(...a) } },
}));

vi.mock("@/components/shared/numberSequencing", () => ({
  getNextFormattedNumber: (...a: unknown[]) => mocks.allocate(...a),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/drawingHub", () => ({
  listLinksForZones: async () => new Map(),
  hydrateLinks: async () => new Map(),
  createLink: (...a: unknown[]) => mocks.createLink(...a),
  removeLink: vi.fn(),
  LINKABLE_TYPE_LABELS: { rfi: "RFIs" },
  ALL_STATUSES: ["neutral"],
  computeZoneStatus: () => ({ status: "neutral", reason: null }),
  computeZoneReadiness: () => ({}),
  recomputeAndPersistZoneStatus: async () => undefined,
  listZoneDependencies: async () => ({ rows: [], total: 0 }),
  computeDependencyImpact: () => ({ drag: 0, contributors: [] }),
  _buildDependencyIndex: () => new Map(),
}));

// The panel's tabs and pickers are irrelevant here; the RFI form is replaced by
// a stub whose button hands the panel a filled-in form, exactly as the real
// modal's Save does.
vi.mock("../zonePanel/OverviewTab", () => ({ OverviewTab: (): null => null }));
vi.mock("../zonePanel/ActivityTab", () => ({ ActivityTab: (): null => null }));
vi.mock("../zonePanel/LinkedList", () => ({ LinkedList: (): null => null }));
vi.mock("../zonePanel/LinkerPicker", () => ({ LinkerPicker: (): null => null }));
vi.mock("../zonePanel/AiSuggestModal", () => ({ AiSuggestModal: (): null => null }));
vi.mock("../zonePanel/DependenciesTab", () => ({ DependenciesTab: (): null => null }));
vi.mock("@/components/rfis/RFIFormModal", () => ({
  default: ({ onSave }: { onSave: (form: Record<string, unknown>) => Promise<void> }) => (
    <button type="button" onClick={() => void onSave({ title: "Beam clash at C-5", question: "Which governs?" })}>
      stub-save-rfi
    </button>
  ),
}));

import ZonePanel from "../ZonePanel";

// ZonePanel is .jsx with no exported prop type; cast once at the boundary.
const Panel = ZonePanel as unknown as React.FC<Record<string, unknown>>;

const ZONE = {
  id: "zone-1",
  project_id: "proj-1",
  zone_key: "Z-003",
  label: "Level 2 east bay",
  status: "neutral",
};

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <Panel zone={ZONE} sheet={{ sheet_number: "S-402" }} open onClose={vi.fn()} userId="user-1" />
    </QueryClientProvider>,
  );
}

async function saveRfiFromZone() {
  fireEvent.click(screen.getByRole("button", { name: /new rfi/i }));
  fireEvent.click(await screen.findByRole("button", { name: "stub-save-rfi" }));
}

/** Wait until the save handler has reported an outcome, either way. */
const settled = () =>
  waitFor(() =>
    expect(mocks.toast.error.mock.calls.length + mocks.toast.success.mock.calls.length).toBeGreaterThan(0),
  );

beforeEach(() => {
  mocks.rfiCreate.mockReset();
  mocks.allocate.mockReset();
  mocks.createLink.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.rfiCreate.mockImplementation(async (row: Record<string, unknown>) => ({ id: "rfi-new", ...row }));
  mocks.createLink.mockResolvedValue({ id: "link-1" });
});

describe("ZonePanel — create RFI from zone: numbering fails closed", () => {
  it("creates no RFI and reports an error when the sequence RPC fails", async () => {
    mocks.allocate.mockRejectedValue(
      new Error("Failed to allocate sequence number for RFI after 3 retries: connection refused"),
    );
    renderPanel();
    await saveRfiFromZone();
    await settled();

    expect(mocks.rfiCreate).not.toHaveBeenCalled();
    expect(mocks.createLink).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    expect(String(mocks.toast.error.mock.calls[0][0])).toMatch(/RFI/);
  });

  it("creates no RFI when the allocator hands back no number", async () => {
    mocks.allocate.mockResolvedValue("");
    renderPanel();
    await saveRfiFromZone();
    await settled();

    expect(mocks.rfiCreate).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
  });

  it("uses exactly the number the sequence allocated, then links the RFI to the zone", async () => {
    mocks.allocate.mockResolvedValue("RFI #042");
    renderPanel();
    await saveRfiFromZone();

    await waitFor(() => expect(mocks.rfiCreate).toHaveBeenCalledTimes(1));
    expect(mocks.allocate).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1", recordType: "RFI", fieldName: "rfi_number" }),
    );
    expect(mocks.rfiCreate.mock.calls[0][0]).toMatchObject({
      project_id: "proj-1",
      rfi_number: "RFI #042",
      title: "Beam clash at C-5",
    });
    await waitFor(() => expect(mocks.createLink).toHaveBeenCalled());
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });
});
