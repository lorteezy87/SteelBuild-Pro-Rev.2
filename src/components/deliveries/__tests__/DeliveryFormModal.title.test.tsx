// @vitest-environment jsdom

/**
 * Regression guard for "Create failed: [deliveries.create] delivery_title is
 * required" raised while the Delivery Title box was visibly filled in.
 *
 * The box labelled "Delivery Title *" was bound to `formData.description`, and
 * `delivery_title` was not a field on the form at all. Deliveries are created
 * through the create_delivery RPC, which begins:
 *
 *   if coalesce(btrim(p_payload ->> 'delivery_title'), '') = '' then
 *     raise exception 'delivery_title is required' using errcode = '23514';
 *
 * so every create failed, no matter what was typed. The same key was also bound
 * to the Material > Description textarea, so the two inputs overwrote one
 * another.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

type AnyArgs = unknown[];

const create = vi.fn();
const update = vi.fn();

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Delivery: { create: (...a: AnyArgs) => create(...a), update: (...a: AnyArgs) => update(...a) },
    Project: { filter: vi.fn().mockResolvedValue([]), list: vi.fn().mockResolvedValue([]) },
    WorkPackage: { filter: vi.fn().mockResolvedValue([]) },
    Drawing: { filter: vi.fn().mockResolvedValue([]) },
    RFI: { filter: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/hooks/useFormValidation", () => ({
  useFormValidation: () => ({
    fieldErrors: {},
    runValidation: () => true,
    clearField: vi.fn(),
  }),
}));

vi.mock("@/hooks/useFocusTrap", () => ({ useFocusTrap: () => ({ current: null }) }));

vi.mock("@/components/shared/AutoLinkSuggestions", () => ({ default: () => null }));

import DeliveryFormModal from "../DeliveryFormModal";

// The modal is .jsx with no exported prop type; cast once at the boundary.
const Modal = DeliveryFormModal as unknown as React.FC<Record<string, unknown>>;

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <Modal projectId="p1" onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("DeliveryFormModal delivery_title", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ id: "d1" });
  });

  it("sends the typed title as delivery_title, which the RPC requires", async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/Delivery Title/i), {
      target: { value: "Anchor Bolts — Phase 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create|save/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    const payload = create.mock.calls[0][0];
    expect(payload.delivery_title).toBe("Anchor Bolts — Phase 1");
  });

  it("trims the title, since a whitespace-only one is rejected by the RPC", async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/Delivery Title/i), {
      target: { value: "   HSS Columns Load 3   " },
    });
    fireEvent.click(screen.getByRole("button", { name: /create|save/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0].delivery_title).toBe("HSS Columns Load 3");
  });

  // The two inputs shared one state key, so filling in the material
  // description silently wiped the title the user had already typed.
  it("keeps the title and the material description independent", async () => {
    renderModal();

    const title = screen.getByLabelText(/Delivery Title/i);
    const description = screen.getByLabelText(/^Description$/i);

    fireEvent.change(title, { target: { value: "Load 3" } });
    fireEvent.change(description, { target: { value: "W12x40, A992, galvanized" } });

    expect(title).toHaveValue("Load 3");
    expect(description).toHaveValue("W12x40, A992, galvanized");

    fireEvent.click(screen.getByRole("button", { name: /create|save/i }));
    await waitFor(() => expect(create).toHaveBeenCalled());

    const payload = create.mock.calls[0][0];
    expect(payload.delivery_title).toBe("Load 3");
    expect(payload.description).toBe("W12x40, A992, galvanized");
  });
});
