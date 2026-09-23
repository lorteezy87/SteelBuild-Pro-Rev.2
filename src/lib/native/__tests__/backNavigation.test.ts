import { describe, expect, it } from "vitest";
import { androidBackAction } from "@/lib/native/backNavigation";

describe("Android system Back", () => {
  it("dismisses an open overlay before changing route history", () => {
    expect(androidBackAction({ hasOpenOverlay: true, canGoBack: true })).toBe("dismiss-overlay");
  });

  it("goes back when the app has route history", () => {
    expect(androidBackAction({ hasOpenOverlay: false, canGoBack: true })).toBe("history-back");
  });

  it("exits only when the user is at the app root", () => {
    expect(androidBackAction({ hasOpenOverlay: false, canGoBack: false })).toBe("exit-app");
  });
});
