import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RETRY_DELAYS_MS,
  isTransientNetworkError,
  withTransientRetry,
} from "@/lib/transientRetry";

/** Zero-delay backoff so the suite never actually waits. */
const fast = { delaysMs: [0, 0], sleep: async () => {} };

describe("isTransientNetworkError", () => {
  it("treats supabase-js's no-response wrappers as transient", () => {
    // StorageUnknownError is only produced when the fetch itself rejects, so
    // there is no HTTP response and the server never saw the request. This is
    // the exact error a 385 KB PDF upload failed with.
    expect(isTransientNetworkError({ name: "StorageUnknownError", message: "Failed to fetch" })).toBe(true);
    expect(isTransientNetworkError({ name: "FunctionsFetchError", message: "Failed to send a request" })).toBe(true);
  });

  it("treats a bare fetch rejection as transient", () => {
    expect(isTransientNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientNetworkError({ message: "NetworkError when attempting to fetch resource." })).toBe(true);
    expect(isTransientNetworkError({ message: "Load failed" })).toBe(true); // Safari
    expect(isTransientNetworkError({ message: "net::ERR_HTTP2_PROTOCOL_ERROR" })).toBe(true);
  });

  it("retries statuses that mean 'no answer yet', not 'no'", () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      expect(isTransientNetworkError({ status }), `status ${status}`).toBe(true);
    }
    expect(isTransientNetworkError({ statusCode: "503" })).toBe(true); // string shape
  });

  it("never retries a decision the server already made", () => {
    // Repeating these only delays the message the user needs to read.
    for (const status of [400, 401, 403, 404, 409, 413, 415, 422]) {
      expect(isTransientNetworkError({ status }), `status ${status}`).toBe(false);
    }
  });

  it("a status always wins over the message text", () => {
    // A 413 whose body happens to mention the network must not be retried.
    expect(isTransientNetworkError({ status: 413, message: "failed to fetch" })).toBe(false);
  });

  it("never retries a deliberate cancellation", () => {
    expect(isTransientNetworkError({ name: "AbortError", message: "The user aborted a request." })).toBe(false);
    expect(isTransientNetworkError({ name: "TimeoutError" })).toBe(false);
  });

  it("does not retry an unrecognised error", () => {
    expect(isTransientNetworkError(new Error("column does not exist"))).toBe(false);
    expect(isTransientNetworkError(null)).toBe(false);
    expect(isTransientNetworkError("nope")).toBe(false);
  });
});

describe("withTransientRetry", () => {
  it("does not retry a call that succeeds", async () => {
    const fn = vi.fn(async () => "ok");
    await expect(withTransientRetry(fn, fast)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("recovers when a dropped connection succeeds on retry", async () => {
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce({ name: "StorageUnknownError", message: "Failed to fetch" })
      .mockResolvedValueOnce("uploaded");
    await expect(withTransientRetry(fn, fast)).resolves.toBe("uploaded");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured retries and rethrows the ORIGINAL error", async () => {
    // Error reporting must see the real failure, not a retry wrapper.
    const err = { name: "StorageUnknownError", message: "Failed to fetch" };
    const fn = vi.fn(async () => { throw err; });
    await expect(withTransientRetry(fn, fast)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("fails immediately on a non-transient error", async () => {
    const err = { status: 413, message: "Payload too large" };
    const fn = vi.fn(async () => { throw err; });
    await expect(withTransientRetry(fn, fast)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honours a caller's shouldRetry override", async () => {
    // The upload path uses this to keep quota errors out of the retry loop.
    const err = { name: "StorageUnknownError", message: "quota has been exceeded" };
    const fn = vi.fn(async () => { throw err; });
    await expect(
      withTransientRetry(fn, { ...fast, shouldRetry: () => false }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes a 1-based attempt number so a caller can tell a repeat from a first try", async () => {
    const seen: number[] = [];
    const fn = vi.fn(async (attempt: number) => {
      seen.push(attempt);
      if (attempt < 3) throw { name: "StorageUnknownError" };
      return "done";
    });
    await expect(withTransientRetry(fn, fast)).resolves.toBe("done");
    expect(seen).toEqual([1, 2, 3]);
  });

  it("waits the configured backoff between attempts", async () => {
    const slept: number[] = [];
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce({ name: "StorageUnknownError" })
      .mockRejectedValueOnce({ name: "StorageUnknownError" })
      .mockResolvedValueOnce("ok");
    await withTransientRetry(fn, {
      delaysMs: [10, 50],
      sleep: async (ms) => { slept.push(ms); },
    });
    expect(slept).toEqual([10, 50]);
  });

  it("reports each retry so the UI can say something better than nothing", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce({ name: "StorageUnknownError" })
      .mockResolvedValueOnce("ok");
    await withTransientRetry(fn, { ...fast, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ attempt: 1, of: 3 });
  });

  it("ships a backoff short enough for someone watching a spinner", () => {
    const total = DEFAULT_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
    expect(DEFAULT_RETRY_DELAYS_MS.length).toBe(2);
    expect(total).toBeLessThanOrEqual(2000);
  });
});
