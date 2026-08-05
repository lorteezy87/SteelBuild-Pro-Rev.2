import { describe, expect, it } from "vitest";
import * as chrome from "../rfiFormModalChrome";

describe("rfiFormModalChrome", () => {
  it("exports presentational primitives", () => {
    expect(typeof chrome.SectionLabel).toBe("function");
    expect(typeof chrome.Field).toBe("function");
    expect(typeof chrome.PreflightScorecard).toBe("function");
    expect(typeof chrome.DuplicateWarning).toBe("function");
    expect(typeof chrome.DarkSelect).toBe("function");
    expect(typeof chrome.AttachmentRow).toBe("function");
  });
});
