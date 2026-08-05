/**
 * Unit tests for deliveryControlCenter.derive.ts
 * Pure functions only — no React, no network.
 */
import { describe, it, expect } from "vitest";
import { deliveryStatusTone, buildDeliveryPanels } from "../deliveryControlCenter.derive";
import type { DeliveryMetrics, DeliveryRecord } from "../types";

// ---------------------------------------------------------------------------
// deliveryStatusTone
// ---------------------------------------------------------------------------

describe("deliveryStatusTone", () => {
  it("maps Delivered → good", () => {
    expect(deliveryStatusTone("Delivered")).toBe("good");
  });

  it("maps In Transit → info", () => {
    expect(deliveryStatusTone("In Transit")).toBe("info");
  });

  it("maps Loading → info", () => {
    expect(deliveryStatusTone("Loading")).toBe("info");
  });

  it("maps Delayed → danger", () => {
    expect(deliveryStatusTone("Delayed")).toBe("danger");
  });

  it("maps Rejected → danger", () => {
    expect(deliveryStatusTone("Rejected")).toBe("danger");
  });

  it("maps Partial → warn", () => {
    expect(deliveryStatusTone("Partial")).toBe("warn");
  });

  it("maps Scheduled → neutral", () => {
    expect(deliveryStatusTone("Scheduled")).toBe("neutral");
  });

  it("maps null → neutral", () => {
    expect(deliveryStatusTone(null)).toBe("neutral");
  });

  it("maps undefined → neutral", () => {
    expect(deliveryStatusTone(undefined)).toBe("neutral");
  });

  it("maps unknown status → neutral", () => {
    expect(deliveryStatusTone("SomeUnknown")).toBe("neutral");
  });
});

// ---------------------------------------------------------------------------
// buildDeliveryPanels
// ---------------------------------------------------------------------------

function makeDelivery(id: string, overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return { id, vendor: `Vendor-${id}`, ...overrides };
}

function makeMetrics(overrides: Partial<DeliveryMetrics> = {}): DeliveryMetrics {
  const today = new Date("2026-06-27T00:00:00");
  return {
    today,
    enriched: [],
    totalCount: 0,
    openCount: 0,
    deliveredCount: 0,
    totalOpenTons: 0,
    totalOpenPieces: 0,
    statusRollup: [],
    overdue: [],
    dueToday: [],
    dueNext7: [],
    unscheduled: [],
    longLeadOpen: [],
    exceptions: [],
    readyToReceive: [],
    deliveredLast7: [],
    nextLoads: [],
    calendarDays: [],
    ...overrides,
  };
}

describe("buildDeliveryPanels", () => {
  it("returns empty panels when metrics are empty", () => {
    const panels = buildDeliveryPanels(makeMetrics());
    expect(panels.workQueue).toHaveLength(0);
    expect(panels.receivingQueue).toHaveLength(0);
    expect(panels.exceptionQueue).toHaveLength(0);
  });

  it("workQueue is nextLoads sliced to 8", () => {
    const loads = Array.from({ length: 12 }, (_, i) => makeDelivery(`d${i}`));
    const panels = buildDeliveryPanels(makeMetrics({ nextLoads: loads }));
    expect(panels.workQueue).toHaveLength(8);
    expect(panels.workQueue[0].id).toBe("d0");
    expect(panels.workQueue[7].id).toBe("d7");
  });

  it("receivingQueue is readyToReceive sliced to 8", () => {
    const ready = Array.from({ length: 10 }, (_, i) => makeDelivery(`r${i}`));
    const panels = buildDeliveryPanels(makeMetrics({ readyToReceive: ready }));
    expect(panels.receivingQueue).toHaveLength(8);
    expect(panels.receivingQueue[0].id).toBe("r0");
  });

  it("exceptionQueue is exceptions sliced to 8", () => {
    const exceptions = Array.from({ length: 9 }, (_, i) => makeDelivery(`e${i}`));
    const panels = buildDeliveryPanels(makeMetrics({ exceptions }));
    expect(panels.exceptionQueue).toHaveLength(8);
    expect(panels.exceptionQueue[0].id).toBe("e0");
  });

  it("does not mutate the source arrays", () => {
    const nextLoads = [makeDelivery("x1"), makeDelivery("x2")];
    const readyToReceive = [makeDelivery("y1")];
    const exceptions = [makeDelivery("z1")];
    buildDeliveryPanels(makeMetrics({ nextLoads, readyToReceive, exceptions }));
    expect(nextLoads).toHaveLength(2);
    expect(readyToReceive).toHaveLength(1);
    expect(exceptions).toHaveLength(1);
  });

  it("preserves original items when fewer than 8 exist", () => {
    const loads = [makeDelivery("a1"), makeDelivery("a2")];
    const panels = buildDeliveryPanels(makeMetrics({ nextLoads: loads }));
    expect(panels.workQueue).toHaveLength(2);
  });
});
