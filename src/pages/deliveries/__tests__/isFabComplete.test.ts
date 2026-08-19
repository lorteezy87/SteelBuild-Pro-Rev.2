/**
 * The "mark delivered" gate required `status === "Complete"` exactly, so a work
 * package fabricated to 100% but still carrying an "In Progress" status was
 * reported as "fabrication is not complete" and its load could not be
 * delivered — a real shipment blocked by a stale status field.
 *
 * Finished now means what it means on the Work Packages page:
 * closed status OR percent_complete >= 100.
 */
import { describe, expect, it } from "vitest";
import { isFabComplete } from "../utils";

const delivery = { work_package_id: "wp-1" };

describe("isFabComplete", () => {
  it("allows a load whose package is 100% fabricated but still 'In Progress'", () => {
    const wps = [{ id: "wp-1", phase: "Fabrication", status: "In Progress", percent_complete: 100 }];
    expect(isFabComplete(delivery, wps)).toBe(true);
  });

  it("still blocks a package mid-fabrication", () => {
    const wps = [{ id: "wp-1", phase: "Fabrication", status: "In Progress", percent_complete: 60 }];
    expect(isFabComplete(delivery, wps)).toBe(false);
  });

  it("accepts closed statuses case-insensitively", () => {
    for (const status of ["Complete", "complete", "Completed", "closed"]) {
      const wps = [{ id: "wp-1", phase: "Fabrication", status, percent_complete: 0 }];
      expect(isFabComplete(delivery, wps), status).toBe(true);
    }
  });

  it("allows once the package is past fabrication", () => {
    for (const phase of ["Delivery", "Erection"]) {
      const wps = [{ id: "wp-1", phase, status: "In Progress", percent_complete: 10 }];
      expect(isFabComplete(delivery, wps), phase).toBe(true);
    }
  });

  it("blocks a detailing-phase package regardless of percent", () => {
    const wps = [{ id: "wp-1", phase: "Detailing", status: "In Progress", percent_complete: 100 }];
    expect(isFabComplete(delivery, wps)).toBe(false);
  });

  it("does not block when no package is linked or the package is gone", () => {
    expect(isFabComplete({ work_package_id: null }, [])).toBe(true);
    expect(isFabComplete(delivery, [])).toBe(true);
    expect(isFabComplete(delivery, undefined)).toBe(true);
  });

  it("ignores a non-numeric percent instead of throwing", () => {
    const wps = [{ id: "wp-1", phase: "Fabrication", status: "In Progress", percent_complete: "n/a" }];
    expect(isFabComplete(delivery, wps)).toBe(false);
  });
});

describe("badge and mark-delivered gate agree", () => {
  // Three copies of this rule existed. The badge copy (analytics.js) still
  // required status === "Complete" exactly after the other two were fixed, so
  // the board showed "Fab not complete" on a load it would happily deliver.
  it("the badge does not flag a package the gate accepts", async () => {
    const { buildDeliveryMetrics } = await import("../analytics");
    const wp = { id: "wp-1", phase: "Fabrication", status: "In Progress", percent_complete: 100 };
    const deliveries = [
      { id: "d1", work_package_id: "wp-1", status: "Scheduled", scheduled_date: "2026-08-20" },
    ];
    const metrics = buildDeliveryMetrics(deliveries, [wp], { today: "2026-08-19" });
    const flagged = (metrics.enriched ?? []).some((d: { _signals?: { flags?: { key: string }[] } }) =>
      (d._signals?.flags ?? []).some((f) => f.key === "fab_not_ready"),
    );
    expect(metrics.enriched).toHaveLength(1); // guard: the flag path really ran
    expect(flagged).toBe(false);
    expect(isFabComplete(deliveries[0], [wp])).toBe(true);
  });

  it("still flags a genuinely unfinished package (negative control)", async () => {
    const { buildDeliveryMetrics } = await import("../analytics");
    const wp = { id: "wp-1", phase: "Fabrication", status: "In Progress", percent_complete: 60 };
    const deliveries = [
      { id: "d1", work_package_id: "wp-1", status: "Scheduled", scheduled_date: "2026-08-20" },
    ];
    const metrics = buildDeliveryMetrics(deliveries, [wp], { today: "2026-08-19" });
    const flagged = (metrics.enriched ?? []).some((d: { _signals?: { flags?: { key: string }[] } }) =>
      (d._signals?.flags ?? []).some((f) => f.key === "fab_not_ready"),
    );
    expect(flagged).toBe(true);
    expect(isFabComplete(deliveries[0], [wp])).toBe(false);
  });
});
