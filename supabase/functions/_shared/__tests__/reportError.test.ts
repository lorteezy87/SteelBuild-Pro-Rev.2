import { beforeEach, describe, expect, it, vi } from "vitest";

const envStore = new Map<string, string>();

vi.stubGlobal("Deno", {
  env: {
    get: (key: string) => envStore.get(key),
  },
});

describe("reportError", () => {
  beforeEach(() => {
    envStore.clear();
    vi.resetModules();
  });

  it("logs without throwing when EDGE_SENTRY_DSN is unset", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { reportError } = await import("../reportError.ts");
    await expect(
      reportError(new Error("boom"), "stripe-billing", { path: "/webhook" }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("swallows Sentry load failures when DSN is set", async () => {
    envStore.set("EDGE_SENTRY_DSN", "https://example.ingest.sentry.io/1");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { reportError } = await import("../reportError.ts");
    // In Vitest the npm:@sentry/deno dynamic import fails — must not throw.
    await expect(reportError(new Error("webhook failed"), "email-ingest")).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
