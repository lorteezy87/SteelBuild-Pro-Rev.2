import { afterEach, describe, expect, it, vi } from "vitest";
import { isLikelyOfflineError } from "../offlineQueue";

afterEach(() => vi.unstubAllGlobals());
describe("offline fallback must not hide rejected or broken writes", () => {
  it("does not classify programming TypeErrors as connection failures", () => {
    expect(isLikelyOfflineError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
  });
  it.each([
    { code: "42501", message: "permission denied" },
    { code: "23514", message: "check constraint violated" },
    { status: 403, message: "Forbidden" },
    { name: "PostgrestError", message: "row-level security policy" },
  ])("preserves a server rejection if connectivity drops afterwards: %j", error => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isLikelyOfflineError(error)).toBe(false);
  });
});
