import { functions } from "@/api/client/functions";
import { describe, expect, it } from "vitest";

describe("functions.invoke", () => {
  it("rejects unsupported backend functions instead of returning a null result", async () => {
    await expect(functions.invoke("not-a-supported-function")).rejects.toThrow(
      "Unsupported backend function: not-a-supported-function",
    );
  });

  it("fails closed for generateAlerts instead of returning empty success", async () => {
    await expect(functions.invoke("generateAlerts")).rejects.toThrow(/generate-alerts/i);
  });
});
