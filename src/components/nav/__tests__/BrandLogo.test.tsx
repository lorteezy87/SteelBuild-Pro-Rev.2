// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "../BrandLogo";

describe("BrandLogo", () => {
  it("uses the approved steel diamond badge for the full lockup", () => {
    render(<BrandLogo height={64} />);

    const badge = screen.getByRole("img", { name: "SteelBuild Pro" });
    expect(badge).toHaveAttribute("src", "/marketing/steelbuild-pro-logo.jpg");
    expect(badge).toHaveAttribute("width", "96");
    expect(badge).toHaveAttribute("height", "64");
    expect(badge).toHaveStyle({ objectFit: "contain" });
  });

  it("uses the same uncropped badge in compact navigation", () => {
    render(<BrandLogo variant="mark" height={40} title="SteelBuild Pro home" />);

    const badge = screen.getByRole("img", { name: "SteelBuild Pro home" });
    expect(badge).toHaveAttribute("src", "/marketing/steelbuild-pro-logo.jpg");
    expect(badge).toHaveAttribute("width", "60");
    expect(badge).toHaveAttribute("height", "40");
  });
});
