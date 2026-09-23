import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", async () => {
  const { productionDeliveryDb } = await import("./helpers/productionDeliveryDb");
  return { supabase: productionDeliveryDb.client };
});

import { productionDeliveryDb as db } from "./helpers/productionDeliveryDb";
import {
  createDeliveryWithItems,
  importedDeliveryTitle,
  loadTotalsFollowUp,
  toDeliveryItemPayload,
} from "../createDeliveryWithItems";

beforeEach(() => db.reset());

describe("toDeliveryItemPayload — create_delivery()'s item contract", () => {
  it("sends qty as the integer the database stores (it casts ::int and floors at 1)", () => {
    expect(toDeliveryItemPayload({ qty: "2.5" }).qty).toBe(2);
    expect(toDeliveryItemPayload({ qty: 0 }).qty).toBe(1);
    expect(toDeliveryItemPayload({ qty: null }).qty).toBe(1);
    expect(toDeliveryItemPayload({ qty: "abc" }).qty).toBe(1);
  });

  it("parses printed weights and keeps unparseable numbers out of numeric columns", () => {
    expect(toDeliveryItemPayload({ weight_lbs: "4,200#" }).weight_lbs).toBe(4200);
    expect(toDeliveryItemPayload({ weight_lbs: "n/a", length_inches: "long" })).toMatchObject({
      weight_lbs: null,
      length_inches: null,
    });
  });

  it("keeps the printed length and finish in notes; it sends no key the RPC ignores", () => {
    const item = toDeliveryItemPayload({ length_text: "7'-8 3/4", finish: "GALV" });
    expect(item.notes).toBe("Length 7'-8 3/4 · Finish GALV");
    expect(Object.keys(item).sort()).toEqual(
      ["assembly_mark", "grade", "length_inches", "notes", "profile", "qty", "sequence", "weight_lbs"],
    );
  });
});

describe("importedDeliveryTitle — the RPC refuses a blank title", () => {
  it("names the load, then falls back, and is never blank", () => {
    expect(importedDeliveryTitle("12")).toBe("Load 12");
    expect(importedDeliveryTitle("  ", null, "Mesa MOB — Load ?")).toBe("Mesa MOB — Load ?");
    expect(importedDeliveryTitle(null, "", undefined).trim()).not.toBe("");
  });
});

describe("loadTotalsFollowUp — absence is not evidence", () => {
  const weightless = [toDeliveryItemPayload({ qty: 2 })];
  const weighed = [toDeliveryItemPayload({ qty: 2, weight_lbs: 900 })];

  it("keeps a printed total", () => {
    expect(loadTotalsFollowUp(3, "5,200#", weightless)).toEqual({ pieces: 3, weight_tons: 2.6 });
  });

  it("records unknown weight as NULL, not the 0 the RPC sums from weightless lines", () => {
    expect(loadTotalsFollowUp(null, null, weightless)).toEqual({ weight_tons: null });
  });

  it("leaves the RPC's derivation alone when the lines carry weights", () => {
    expect(loadTotalsFollowUp(null, null, weighed)).toEqual({});
  });
});

describe("createDeliveryWithItems", () => {
  it("refuses a blank title before calling the RPC", async () => {
    await expect(
      createDeliveryWithItems({ projectId: "p1", delivery: { delivery_title: "  " }, items: [] }),
    ).rejects.toThrow(/title/);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("says which delivery exists when the follow-up write fails", async () => {
    // Moving a Scheduled delivery to Delivered outside receive_delivery() is
    // refused by the guard — a real way for the follow-up UPDATE to fail.
    const attempt = createDeliveryWithItems({
      projectId: "p1",
      delivery: { delivery_title: "Load 3", status: "Scheduled" },
      items: [toDeliveryItemPayload({ qty: 1, assembly_mark: "B1" })],
      followUp: { status: "Delivered" } as never,
    });

    await expect(attempt).rejects.toThrow(/DEL-001 was created with 1 line item\(s\).*RECEIVE_VIA_RPC/);
    expect(db.deliveries.size).toBe(1);
    expect(db.items).toHaveLength(1);
  });
});
