import { describe, expect, it } from "vitest";

import { assertDbOk } from "../webhookLogic.ts";

// handleEvent throwing is what makes the webhook answer 500 without marking the
// event processed, so Stripe retries it. These writes used to be awaited and
// their errors dropped: the event was marked processed with the org unchanged.
describe("assertDbOk", () => {
  it("throws on a failed write so the delivery is retried, not marked processed", () => {
    expect(() => assertDbOk({ error: { message: "deadlock detected" } }, "checkout org update (org_1)"))
      .toThrow("checkout org update (org_1) failed: deadlock detected");
  });

  it("passes a successful write through", () => {
    expect(() => assertDbOk({ error: null }, "subscription org update (org_1)")).not.toThrow();
  });
});
