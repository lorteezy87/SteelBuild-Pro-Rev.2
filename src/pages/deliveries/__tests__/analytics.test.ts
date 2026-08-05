import { describe, expect, it } from "vitest";
import {
  buildDeliveryMetrics,
  deliveryLane,
  getDeliveryDisplayName,
  getDeliverySignals,
} from "../analytics";

describe("delivery analytics", () => {
  it("flags a late delivery and preserves the linked work package display fallback", () => {
    const delivery = {
      id: "del-1",
      status: "Scheduled",
      scheduled_date: "2026-05-10",
      vendor: "S&H Steel",
      work_package_id: "wp-1",
    };
    const workPackage = { id: "wp-1", wp_number: "WP-100", phase: "Delivery" };

    const signals = getDeliverySignals(delivery, { today: "2026-05-13", workPackage });

    expect(signals.overdue).toBe(true);
    expect(signals.risk).toBe("high");
    expect(signals.flags.map((flag) => flag.key)).toContain("overdue");
    expect(getDeliveryDisplayName({ ...delivery, description: "" }, workPackage)).toBe("WP-100");
  });

  it("blocks delivered readiness when the linked fabrication package is not complete", () => {
    const delivery = {
      id: "del-2",
      status: "In Transit",
      scheduled_date: "2026-05-14",
      vendor: "Galvanizer",
      carrier: "Mesa Freight",
      work_package_id: "wp-2",
    };
    const workPackage = { id: "wp-2", phase: "Fabrication", status: "In Progress" };

    const signals = getDeliverySignals(delivery, { today: "2026-05-13", workPackage });

    expect(signals.fabReady).toBe(false);
    expect(signals.risk).toBe("high");
    expect(signals.flags.map((flag) => flag.key)).toContain("fab_not_ready");
  });

  it("rolls up lookahead, exceptions, tons, and dispatch lanes", () => {
    const metrics = buildDeliveryMetrics(
      [
        {
          id: "late",
          status: "Scheduled",
          scheduled_date: "2026-05-12",
          required_date: "2026-05-12",
          vendor: "Embed Supplier",
          pieces: 4,
          weight_tons: 3.5,
        },
        {
          id: "today",
          status: "In Transit",
          scheduled_date: "2026-05-13",
          vendor: "Main Steel",
          carrier: "Rig 12",
          receiving_location: "North gate",
          pieces: 20,
          weight_tons: 18,
        },
        {
          id: "done",
          status: "Delivered",
          scheduled_date: "2026-05-08",
          actual_date: "2026-05-09",
          vendor: "Deck Supplier",
          weight_tons: 7,
        },
      ],
      [],
      { today: "2026-05-13" }
    );

    expect(metrics.totalCount).toBe(3);
    expect(metrics.openCount).toBe(2);
    expect(metrics.totalOpenTons).toBe(21.5);
    expect(metrics.dueToday.map((delivery) => delivery.id)).toEqual(["today"]);
    expect(metrics.overdue.map((delivery) => delivery.id)).toEqual(["late"]);
    expect(metrics.deliveredLast7.map((delivery) => delivery.id)).toEqual(["done"]);
    expect(deliveryLane(metrics.enriched.find((delivery) => delivery.id === "late"))).toBe("Exceptions");
    expect(deliveryLane(metrics.enriched.find((delivery) => delivery.id === "today"))).toBe("In Transit");
  });
});
