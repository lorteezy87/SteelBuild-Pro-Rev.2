import { describe, expect, it } from "vitest";
import { SUPPORTED_PHASES } from "../constants";
import { PHASES } from "@/utils/phases";

describe("SUPPORTED_PHASES", () => {
  it("mirrors utils/phases PHASES", () => {
    expect(SUPPORTED_PHASES.size).toBe(PHASES.length);
    for (const p of PHASES) {
      expect(SUPPORTED_PHASES.has(p)).toBe(true);
    }
  });
});
