import { describe, expect, it } from "vitest";
import {
  formatWorkPackageTitle,
  getWorkPackageDescription,
} from "../formatWorkPackageTitle";

describe("formatWorkPackageTitle", () => {
  it("joins WP number and description with ' - '", () => {
    expect(
      formatWorkPackageTitle({ wp_number: "WP-004", name: "ladder" }),
    ).toBe("WP-004 - ladder");
  });

  it("falls back to number-only or description-only", () => {
    expect(formatWorkPackageTitle({ wp_number: "WP-004" })).toBe("WP-004");
    expect(formatWorkPackageTitle({ name: "ladder" })).toBe("ladder");
  });

  it("uses description / title aliases when name is empty", () => {
    expect(
      formatWorkPackageTitle({
        wp_number: "WP-010",
        description: "stair stringers",
      }),
    ).toBe("WP-010 - stair stringers");
    expect(
      formatWorkPackageTitle({ wp_number: "WP-011", title: "bracing" }),
    ).toBe("WP-011 - bracing");
  });

  it("does not duplicate when name equals the WP number", () => {
    expect(
      formatWorkPackageTitle({ wp_number: "WP-004", name: "WP-004" }),
    ).toBe("WP-004");
  });

  it("returns the fallback for empty records", () => {
    expect(formatWorkPackageTitle(null)).toBe("Unnamed package");
    expect(formatWorkPackageTitle({})).toBe("Unnamed package");
    expect(formatWorkPackageTitle({}, "No package")).toBe("No package");
  });
});

describe("getWorkPackageDescription", () => {
  it("prefers name over description/title", () => {
    expect(
      getWorkPackageDescription({
        name: "ladder",
        description: "other",
        title: "other",
      }),
    ).toBe("ladder");
  });
});
