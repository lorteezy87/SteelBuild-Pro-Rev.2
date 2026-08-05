import { describe, expect, it } from "vitest";
import { nextFilterToggle } from "../nextFilterToggle";

describe("nextFilterToggle", () => {
  it("selects a new value", () => {
    expect(nextFilterToggle("all", "Open")).toBe("Open");
    expect(nextFilterToggle("Open", "Closed")).toBe("Closed");
  });

  it("clears when re-clicking the active value", () => {
    expect(nextFilterToggle("Open", "Open")).toBe("all");
  });

  it("always clears when clicked is all", () => {
    expect(nextFilterToggle("Open", "all")).toBe("all");
    expect(nextFilterToggle("all", "all")).toBe("all");
  });
});
