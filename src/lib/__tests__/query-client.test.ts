import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
const toastError = vi.fn();
const toastQuiet = vi.fn();

vi.mock("@sentry/react", () => ({
  captureException,
}));

vi.mock("sonner", () => ({
  toast: Object.assign(toastQuiet, { error: toastError }),
}));

describe("queryClientInstance global error handlers", () => {
  beforeEach(() => {
    captureException.mockClear();
    toastError.mockClear();
    toastQuiet.mockClear();
    vi.resetModules();
  });

  it("reports query failures to Sentry and toasts when there is no cached data", async () => {
    const { queryClientInstance } = await import("../query-client");
    const err = new Error("load failed");
    // Drive the QueryCache onError path via a failing query with no data.
    await expect(
      queryClientInstance.fetchQuery({
        queryKey: ["query-client-test", "empty"],
        queryFn: async () => {
          throw err;
        },
        retry: false,
      }),
    ).rejects.toThrow("load failed");

    expect(captureException).toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Could not load data. Please try again.");
  });

  it("reports mutation failures to Sentry and toasts only when onError is absent", async () => {
    const { queryClientInstance } = await import("../query-client");
    const err = new Error("save failed");

    await expect(
      queryClientInstance
        .getMutationCache()
        .build(queryClientInstance, {
          mutationKey: ["query-client-test", "mutation"],
          mutationFn: async () => {
            throw err;
          },
        })
        .execute({}),
    ).rejects.toThrow("save failed");

    expect(captureException).toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });

  it("does not double-toast mutations that already define onError", async () => {
    const { queryClientInstance } = await import("../query-client");
    const localOnError = vi.fn();

    await expect(
      queryClientInstance
        .getMutationCache()
        .build(queryClientInstance, {
          mutationKey: ["query-client-test", "handled"],
          mutationFn: async () => {
            throw new Error("handled");
          },
          onError: localOnError,
        })
        .execute({}),
    ).rejects.toThrow("handled");

    expect(localOnError).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
