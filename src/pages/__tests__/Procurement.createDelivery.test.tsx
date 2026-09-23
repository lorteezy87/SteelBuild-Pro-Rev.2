// @vitest-environment jsdom
//
// Procurement "Add item" vs create_delivery()'s contract.
//
// A procurement item is a `deliveries` row, and deliveries are created only
// through create_delivery(), which refuses a blank delivery_title (23514,
// "delivery_title is required"). The Add Procurement Item form collects an
// Item Description but no title, and the page sent none — so every Add failed.
//
// The page and its real form run against productionDeliveryDb, which enforces
// that contract (sources in its header). Only the control-center chrome is
// stubbed, down to the button that opens the form.

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/supabase", async () => {
  const { productionDeliveryDb } = await import("@/lib/deliveries/__tests__/helpers/productionDeliveryDb");
  return { supabase: productionDeliveryDb.client };
});
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: (): string => "proj-1" }));
vi.mock("@/hooks/useAutoOpenCreate", () => ({ useAutoOpenCreate: (): void => undefined }));
vi.mock("../procurement/ProcurementControlCenter", () => ({
  default: ({ onCreate }: { onCreate: () => void }) => (
    <button type="button" onClick={onCreate}>stub-open-add-item</button>
  ),
}));

import { productionDeliveryDb as db } from "@/lib/deliveries/__tests__/helpers/productionDeliveryDb";
import Procurement from "../Procurement";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Procurement />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function addItem(description: string) {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "stub-open-add-item" }));
  fireEvent.change(screen.getByPlaceholderText(/W-Shape Mill Order/i), { target: { value: description } });
  fireEvent.click(screen.getByRole("button", { name: /add item/i }));
  await waitFor(() =>
    expect(mocks.toast.success.mock.calls.length + mocks.toast.error.mock.calls.length).toBeGreaterThan(0),
  );
}

beforeEach(() => {
  db.reset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
});

describe("Procurement — Add item goes through create_delivery", () => {
  it("creates the item, titled from its description", async () => {
    await addItem("  W-Shape Mill Order — Seq 1  ");

    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalledWith("Item added");
    expect(db.writes.filter((w) => w.error)).toEqual([]);

    const rows = [...db.deliveries.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      project_id: "proj-1",
      delivery_title: "W-Shape Mill Order — Seq 1",
      description: "W-Shape Mill Order — Seq 1",
      delivery_type: "PROCUREMENT",
      status: "Identified",
    });
  });
});
