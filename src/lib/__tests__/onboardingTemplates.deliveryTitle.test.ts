/**
 * Generic delivery imports vs create_delivery()'s contract.
 *
 * Deliveries are created only through create_delivery(), which begins
 *   if coalesce(btrim(p_payload ->> 'delivery_title'), '') = '' then
 *     raise exception 'delivery_title is required' using errcode = '23514';
 * The Data Exchange / onboarding CSV import (IMPORT_TARGETS.deliveries) and the
 * onboarding seed deliveries never set delivery_title, so every row was refused
 * — and bulkCreateWithFallback skips refused rows with a console warning, so the
 * import reported success over nothing.
 *
 * Runs the real staging + commit helpers against productionDeliveryDb, which
 * enforces that contract (sources in its header).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", async () => {
  const { productionDeliveryDb } = await import("@/lib/deliveries/__tests__/helpers/productionDeliveryDb");
  return { supabase: productionDeliveryDb.client };
});

import { productionDeliveryDb as db } from "@/lib/deliveries/__tests__/helpers/productionDeliveryDb";
import { entities } from "@/api/supabaseClient";
import { buildSeedPayloads, stageImportText } from "@/lib/onboardingTemplates";
import {
  bulkCreateWithFallback,
  createSeedRecords,
  type EntityClient,
} from "@/pages/onboarding/onboardingMutationHelpers";
import { IMPORT_EXAMPLES, prepareImportRecords } from "@/pages/dataExchange/dataExchangeLogic";

const PROJECT = { id: "proj-1", name: "Mesa MOB", start_date: "2026-07-01" };
const deliveryClient = entities.Delivery as unknown as EntityClient;

const stored = () => [...db.deliveries.values()];

beforeEach(() => {
  db.reset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

async function importCsv(text: string) {
  const staged = stageImportText({ targetKey: "deliveries", text, project: PROJECT });
  expect(staged.invalidRows).toEqual([]);
  const { recordsToCreate } = prepareImportRecords({
    targetKey: "deliveries",
    existingRecords: [],
    validRecords: staged.validRecords,
    importSourceName: "deliveries.csv",
  });
  return bulkCreateWithFallback(deliveryClient, recordsToCreate);
}

describe("Data Exchange / onboarding CSV import of deliveries", () => {
  it("imports the page's own sample row, titled from its description", async () => {
    const created = await importCsv(IMPORT_EXAMPLES.deliveries);

    expect(created).toHaveLength(1);
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({
      delivery_title: "Sequence 1 steel",
      description: "Sequence 1 steel",
      po_number: "PO-1001",
      status: "Scheduled",
    });
  });

  it("uses a Title column when the file has one", async () => {
    const created = await importCsv(
      "Title,PO Number,Description,Status\nLoad 3 — HSS columns,PO-2002,HSS 8x8 columns grid C,Scheduled",
    );

    expect(created).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ delivery_title: "Load 3 — HSS columns", description: "HSS 8x8 columns grid C" });
  });

  it("never stages a delivery with a blank title", () => {
    const staged = stageImportText({
      targetKey: "deliveries",
      text: "Title,Description\n   ,Anchor bolt cages\n,Loose hardware",
      project: PROJECT,
    });
    expect(staged.validRecords.map((r: Record<string, unknown>) => r.delivery_title)).toEqual([
      "Anchor bolt cages",
      "Loose hardware",
    ]);
  });
});

describe("onboarding seed deliveries", () => {
  it.each(["fabrication_erection", "field_execution", "structural_demo"])(
    "the %s template's deliveries are all created, each titled",
    async (templateKey) => {
      const payloads = buildSeedPayloads(PROJECT, templateKey) as { deliveries: Record<string, unknown>[] };
      expect(payloads.deliveries.length).toBeGreaterThan(0);

      const created = await createSeedRecords({ deliveries: payloads.deliveries }, { Delivery: deliveryClient }, ["deliveries"]);

      expect(created.deliveries).toHaveLength(payloads.deliveries.length);
      expect(stored()).toHaveLength(payloads.deliveries.length);
      for (const row of stored()) {
        expect(String(row.delivery_title).trim()).not.toBe("");
        expect(row.delivery_title).toBe(row.description);
      }
    },
  );
});
