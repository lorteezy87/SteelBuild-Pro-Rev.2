import { describe, expect, it } from "vitest";
import {
  BROWSER_STORAGE_QUOTA_MESSAGE,
  FILE_STORAGE_QUOTA_MESSAGE,
  isBrowserQuotaError,
  isFileStorageQuotaError,
  quotaExceededUserMessage,
  remapQuotaError,
} from "../quotaExceeded";

describe("quotaExceeded", () => {
  it("maps the exact WebKit / Supabase storage string", () => {
    expect(quotaExceededUserMessage(new Error("The quota has been exceeded."))).toBe(
      FILE_STORAGE_QUOTA_MESSAGE,
    );
    expect(isFileStorageQuotaError({ message: "The quota has been exceeded." })).toBe(true);
  });

  it("maps HTTP 413 and StorageError-shaped objects", () => {
    expect(isFileStorageQuotaError({ statusCode: "413", error: "Payload too large" })).toBe(true);
    expect(isFileStorageQuotaError({ status: 413, message: "too large" })).toBe(true);
    expect(quotaExceededUserMessage({ error: "storage quota exceeded" })).toBe(
      FILE_STORAGE_QUOTA_MESSAGE,
    );
  });

  it("maps Safari QuotaExceededError to the browser-storage message", () => {
    const err = { name: "QuotaExceededError", message: "The quota has been exceeded." };
    expect(isBrowserQuotaError(err)).toBe(true);
    expect(isFileStorageQuotaError(err)).toBe(false);
    expect(quotaExceededUserMessage(err)).toBe(BROWSER_STORAGE_QUOTA_MESSAGE);
  });

  it("leaves unrelated errors alone", () => {
    expect(quotaExceededUserMessage(new Error("Row level security violation"))).toBeNull();
    expect(quotaExceededUserMessage("plain string")).toBeNull();
    expect(quotaExceededUserMessage(null)).toBeNull();
  });

  it("remapQuotaError rethrows a friendly Error for quota, else the original", () => {
    expect(() => remapQuotaError(new Error("The quota has been exceeded."))).toThrow(
      FILE_STORAGE_QUOTA_MESSAGE,
    );
    const original = new Error("not a quota");
    try {
      remapQuotaError(original);
      throw new Error("should have thrown");
    } catch (caught) {
      expect(caught).toBe(original);
    }
  });
});
