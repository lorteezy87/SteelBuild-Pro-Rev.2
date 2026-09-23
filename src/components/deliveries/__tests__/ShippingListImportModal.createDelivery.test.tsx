// @vitest-environment jsdom
//
// Shipping-list import against production's delivery rules.
//
// Each load used to be written as a direct `deliveries` INSERT followed by a
// separate `delivery_items` INSERT, with a hand-rolled hard DELETE as the
// "rollback". Production refuses all of that: enforce_delivery_guards() only
// admits a delivery through create_delivery() and never allows a hard delete.
// So every load failed — while the pieces on it were still marked Shipped and
// their canonical lots advanced, because that step ran over every selected
// load whether or not its delivery was recorded.
//
// `productionDeliveryDb` models the production rules (sources in its header).
// The rest of the import — legacy piece_production and, in pilot/live, the
// ship_piece_lots bridge — must keep working (AGENTS.md → Piece Register).

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ParsedLoad } from "@/lib/importShippingList";

const mocks = vi.hoisted(() => ({
  loads: [] as unknown[],
  commitProductionRows: vi.fn(),
  transitionPieceLots: vi.fn(),
  pieces: [] as unknown[],
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/supabase", async () => {
  const { productionDeliveryDb } = await import("@/lib/deliveries/__tests__/helpers/productionDeliveryDb");
  return { supabase: productionDeliveryDb.client };
});

vi.mock("xlsx", () => ({
  read: () => ({ SheetNames: ["Shipping"], Sheets: { Shipping: {} } }),
  utils: { sheet_to_json: (): unknown[] => [] },
}));

vi.mock("@/lib/importShippingList", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/importShippingList")>();
  return {
    ...actual,
    parseShippingList: () => ({ ok: true, loads: mocks.loads, stats: { loads: mocks.loads.length, pieces: 3 } }),
  };
});

vi.mock("@/lib/production/repository", () => ({
  listPieceProduction: async (): Promise<unknown[]> => [],
  commitProductionRows: (...a: unknown[]) => mocks.commitProductionRows(...a),
}));

vi.mock("@/lib/pieceControl/logisticsRepository", () => ({
  transitionPieceLots: (...a: unknown[]) => mocks.transitionPieceLots(...a),
}));

vi.mock("@/lib/pieceControl/pagedSelect", () => ({
  fetchAllProjectRowsPaged: async (): Promise<unknown[]> => mocks.pieces,
}));

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: (): { current: HTMLElement | null } => ({ current: null }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import { productionDeliveryDb as db } from "@/lib/deliveries/__tests__/helpers/productionDeliveryDb";
import ShippingListImportModal from "../ShippingListImportModal";

// The modal is .jsx with no exported prop type; cast once at the boundary.
const Modal = ShippingListImportModal as unknown as React.FC<Record<string, unknown>>;

const FUTURE = "2099-02-10";
const PAST = "2020-05-04";

const LOAD_7: ParsedLoad = {
  job_number: "25395",
  load_number: "7",
  destination: "North laydown yard",
  trailer: "T-12",
  carrier: "Desert Freight",
  total_qty: 3,
  total_weight_lbs: 5200,
  ship_date: FUTURE,
  ready_date: "2099-02-08",
  tbr: null,
  pieces: [
    { mark: "B1", quantity: 2, sequence: "1", dimensions: "W12x26", length: "20'-4 1/2", grade: "A992", finish: "P" },
    { mark: "C1", quantity: 1, sequence: "1", dimensions: "HSS8x8x1/2", length: "14'-0", grade: "A500-C", finish: "GALV" },
  ],
};

const LOAD_8: ParsedLoad = {
  job_number: "25395",
  load_number: "8",
  destination: "Field trailer",
  trailer: "T-14",
  carrier: null,
  total_qty: 1,
  total_weight_lbs: 900,
  ship_date: PAST,
  ready_date: null,
  tbr: null,
  pieces: [{ mark: "B2", quantity: 1, sequence: "2", dimensions: "W8x18", length: "9'-6", grade: "A992", finish: null }],
};

interface CanonicalLot {
  id: string;
  piece_mark: string;
  lifecycle_status: string;
  on_hold: boolean;
  is_container: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  parent_piece_id: string | null;
}

const lot = (id: string, mark: string): CanonicalLot => ({
  id, piece_mark: mark, lifecycle_status: "fabricated", on_hold: false,
  is_container: false, is_deleted: false, deleted_at: null, parent_piece_id: null,
});

const onImported = vi.fn();

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <Modal open projectId="proj-1" projectName="Mesa MOB" onClose={vi.fn()} onImported={onImported} />
    </QueryClientProvider>,
  );
}

async function importAll(count: number) {
  const { container } = renderModal();
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = { name: "master-shipping-list.xlsx", size: 2048, arrayBuffer: async () => new ArrayBuffer(8) };
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: /review loads/i }));
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`import ${count} load`, "i") }));
  await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
  return onImported.mock.calls[0][0] as Record<string, unknown>;
}

const storedByLoad = (loadNumber: string) =>
  [...db.deliveries.values()].find((d) => d.load_number === loadNumber);

beforeEach(() => {
  db.reset();
  onImported.mockReset();
  mocks.commitProductionRows.mockReset();
  mocks.transitionPieceLots.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.loads = [LOAD_7, LOAD_8];
  mocks.pieces = [lot("lot-b1", "B1"), lot("lot-c1", "C1"), lot("lot-b2", "B2")];
  mocks.commitProductionRows.mockImplementation(async (_p: string, rows: unknown[]) => ({ created: rows.length, updated: 0 }));
  mocks.transitionPieceLots.mockResolvedValue({ ok: true });
});

describe("ShippingListImportModal — deliveries go through create_delivery", () => {
  it("records every load with its pieces and nothing production would refuse", async () => {
    const result = await importAll(2);

    expect(result).toMatchObject({ created: 2, failed: 0, items: 3 });
    expect(db.writes.filter((w) => w.error)).toEqual([]);
    expect(db.writes.filter((w) => w.op === "insert" || w.op === "delete")).toEqual([]);
    expect(db.rpc.mock.calls.map((c) => c[0])).toEqual(["create_delivery", "create_delivery"]);

    const scheduled = storedByLoad("7");
    expect(scheduled).toMatchObject({
      delivery_number: "DEL-001",
      description: "25395 — Load 7",
      status: "Scheduled",
      scheduled_date: FUTURE,
      actual_date: null,
      carrier: "Desert Freight",
      receiving_location: "North laydown yard",
      load_category: "North laydown yard",
      metadata: expect.objectContaining({ source: "shipping_list", job_number: "25395", trailer: "T-12" }),
    });
    expect(String(scheduled?.delivery_title).trim()).not.toBe("");

    const shipped = storedByLoad("8");
    expect(shipped).toMatchObject({ delivery_number: "DEL-002", status: "Delivered", actual_date: PAST, scheduled_date: null });

    const lines = db.items.filter((i) => i.delivery_id === scheduled?.id);
    expect(lines.map((l) => [l.assembly_mark, l.qty, l.profile, l.sequence, l.grade])).toEqual([
      ["B1", 2, "W12x26", "1", "A992"],
      ["C1", 1, "HSS8x8x1/2", "1", "A500-C"],
    ]);
    expect(String(lines[0].notes)).toContain("20'-4 1/2");
    expect(String(lines[1].notes)).toContain("GALV");
  });

  it("keeps the list's load totals instead of a weight derived from weightless pieces", async () => {
    await importAll(2);

    // Piece rows carry no weight, so create_delivery() alone would record 0 tons.
    expect(storedByLoad("7")).toMatchObject({ pieces: 3, weight_tons: 2.6 });
    expect(storedByLoad("8")).toMatchObject({ pieces: 1, weight_tons: 0.45 });
  });

  it("still marks the pieces Shipped and, in pilot, ships the canonical lots", async () => {
    db.projectMode.piece_control_mode = "pilot";
    const result = await importAll(2);

    const productionRows = mocks.commitProductionRows.mock.calls[0][1] as Array<Record<string, unknown>>;
    expect(productionRows.map((r) => [r.piece_mark, r.status])).toEqual([
      ["B1", "Shipped"], ["C1", "Shipped"], ["B2", "Shipped"],
    ]);
    expect(mocks.transitionPieceLots).toHaveBeenCalledTimes(1);
    const [kind, projectId, ids] = mocks.transitionPieceLots.mock.calls[0];
    expect([kind, projectId]).toEqual(["ship", "proj-1"]);
    expect([...(ids as string[])].sort()).toEqual(["lot-b1", "lot-b2", "lot-c1"]);
    expect(result).toMatchObject({ shipped: 3, canonicalShipped: 3 });
  });

  it("does not ship the pieces of a load whose delivery production refused", async () => {
    db.projectMode.piece_control_mode = "live";
    db.failNextCreate({ code: "42501", message: "Not authorized to log deliveries for this project" });
    const result = await importAll(2);

    expect(result).toMatchObject({ created: 1, failed: 1, items: 1 });
    expect(storedByLoad("7")).toBeUndefined();
    expect(storedByLoad("8")).toBeDefined();

    const productionRows = mocks.commitProductionRows.mock.calls[0][1] as Array<Record<string, unknown>>;
    expect(productionRows.map((r) => r.piece_mark)).toEqual(["B2"]);
    expect(mocks.transitionPieceLots.mock.calls[0][2]).toEqual(["lot-b2"]);
  });
});
