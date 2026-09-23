/**
 * commitShippingTicket against production's delivery rules.
 *
 * Production only lets a delivery in through create_delivery(): the
 * enforce_delivery_guards() trigger refuses a direct INSERT with
 * "Deliveries are created through create_delivery(); numbers are minted there"
 * and refuses every hard DELETE. The importer used to insert the delivery and
 * its delivery_items as two separate writes and "roll back" a failed item
 * insert with a hard delete — so against production it could not import a
 * single ticket, and its rollback could never have run.
 *
 * `productionDeliveryDb` models those rules (see its header for the sources),
 * so these tests assert what production would actually hold afterwards.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", async () => {
  const { productionDeliveryDb } = await import("@/lib/deliveries/__tests__/helpers/productionDeliveryDb");
  return { supabase: productionDeliveryDb.client };
});

import { productionDeliveryDb as db } from "@/lib/deliveries/__tests__/helpers/productionDeliveryDb";
import { commitShippingTicket, type ShippingTicketHeader, type ShippingTicketItem } from "@/lib/importShippingTicket";

const FUTURE = "2099-01-15";
const PAST = "2020-03-02";

const header = (overrides: Partial<ShippingTicketHeader> = {}): ShippingTicketHeader => ({
  job_number: "25395",
  job_name: "Mesa Medical Office",
  load_number: "14",
  load_category: "Columns",
  trailer: "T-48 flatbed",
  carrier: "Desert Freight",
  capacity_lbs: "48,000#",
  weight_loaded_lbs: "12,600#",
  assembly_quantity: 5,
  date_shipped: FUTURE,
  ...overrides,
});

const LINES: ShippingTicketItem[] = [
  { qty: 3, assembly_mark: "C1", sequence: "1", profile: "HSS 8 x 8 x 1/2", length_text: "14'-2 1/4", length_inches: 170.25, grade: "A500-C", finish: "GALV", weight_lbs: 8400 },
  { qty: "2", assembly_mark: " C2 ", sequence: "1", profile: "W12x26", length_text: "10'-0", length_inches: 120, grade: "A992", finish: "P", weight_lbs: "4,200#" },
];

const TICKET_FILE = {
  file_url: "https://storage.example/tickets/load-14.pdf",
  storage_path: "tickets/load-14.pdf",
  file_name: "load-14.pdf",
};

const refusedWrites = () => db.writes.filter((w) => w.error);
const directWrites = () => db.writes.filter((w) => w.op === "insert" || w.op === "delete");

beforeEach(() => db.reset());

describe("commitShippingTicket — production delivery rules", () => {
  it("lands the delivery and every line in one create_delivery call", async () => {
    await commitShippingTicket({ header: header(), items: LINES, projectId: "proj-1", projectName: "Mesa MOB", ...TICKET_FILE });

    expect(refusedWrites()).toEqual([]);
    expect(directWrites()).toEqual([]);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc.mock.calls[0][0]).toBe("create_delivery");

    expect(db.deliveries.size).toBe(1);
    const [stored] = [...db.deliveries.values()];
    expect(stored).toMatchObject({
      project_id: "proj-1",
      delivery_number: "DEL-001",
      load_number: "14",
      load_category: "Columns",
      carrier: "T-48 flatbed",
      description: "Mesa Medical Office — Load 14",
      status: "Scheduled",
      scheduled_date: FUTURE,
      actual_date: null,
    });
    expect(String(stored.delivery_title).trim()).not.toBe("");

    const lines = db.items.filter((i) => i.delivery_id === stored.id);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ line_no: 1, qty: 3, assembly_mark: "C1", sequence: "1", profile: "HSS 8 x 8 x 1/2", length_inches: 170.25, grade: "A500-C", weight_lbs: 8400 });
    expect(lines[1]).toMatchObject({ line_no: 2, qty: 2, assembly_mark: "C2", profile: "W12x26", weight_lbs: 4200 });
  });

  it("keeps the ticket link, trailer capacity and the ticket's printed totals", async () => {
    await commitShippingTicket({ header: header(), items: LINES, projectId: "proj-1", ...TICKET_FILE });

    const [stored] = [...db.deliveries.values()];
    // The Deliveries page shows the ticket name and derives load utilisation
    // from capacity_lbs; create_delivery() writes neither.
    expect(stored).toMatchObject({
      shipping_ticket_url: TICKET_FILE.file_url,
      shipping_ticket_path: TICKET_FILE.storage_path,
      shipping_ticket_name: TICKET_FILE.file_name,
      capacity_lbs: 48000,
      pieces: 5,
      weight_tons: 6.3,
    });
  });

  it("does not lose the printed length or finish, which create_delivery() does not store as columns", async () => {
    await commitShippingTicket({ header: header(), items: LINES, projectId: "proj-1", ...TICKET_FILE });

    const [first, second] = db.items;
    expect(first.notes).toContain("14'-2 1/4");
    expect(first.notes).toContain("GALV");
    expect(second.notes).toContain("10'-0");
  });

  it("stores a ticket that already shipped as Delivered on its ship date", async () => {
    await commitShippingTicket({ header: header({ date_shipped: PAST }), items: LINES, projectId: "proj-1", ...TICKET_FILE });

    expect(refusedWrites()).toEqual([]);
    const [stored] = [...db.deliveries.values()];
    expect(stored).toMatchObject({ status: "Delivered", actual_date: PAST, scheduled_date: null });
    expect(db.items).toHaveLength(2);
  });

  it("names the load even when the ticket has no load number", async () => {
    await commitShippingTicket({
      header: header({ load_number: null, job_name: null }),
      items: LINES,
      projectId: "proj-1",
      ...TICKET_FILE,
    });

    const [stored] = [...db.deliveries.values()];
    expect(String(stored.delivery_title).trim()).not.toBe("");
  });

  it("leaves nothing behind, and never hard-deletes, when production refuses the create", async () => {
    db.failNextCreate({ code: "42501", message: "Not authorized to log deliveries for this project" });

    await expect(
      commitShippingTicket({ header: header(), items: LINES, projectId: "proj-1", ...TICKET_FILE }),
    ).rejects.toThrow(/Not authorized/);
    expect(db.deliveries.size).toBe(0);
    expect(db.items).toEqual([]);
    expect(directWrites()).toEqual([]);
  });

  it("still requires a project", async () => {
    await expect(
      commitShippingTicket({ header: header(), items: LINES, projectId: null, ...TICKET_FILE }),
    ).rejects.toThrow(/project/i);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
