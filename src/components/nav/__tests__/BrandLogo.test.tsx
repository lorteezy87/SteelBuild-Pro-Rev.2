// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "../BrandLogo";
import { MARK_PATH } from "../../brand/steelBuildMarkGeometry";

describe("BrandLogo", () => {
  it("renders the full wordmark lockup by default", () => {
    render(<BrandLogo />);

    expect(screen.getByRole("img", { name: "SteelBuild Pro" })).toBeInTheDocument();
    expect(screen.getByText("SteelBuild-Pro")).toBeInTheDocument();
    expect(screen.getByText("BUILT FOR THE PEOPLE WHO BUILD")).toBeInTheDocument();
  });

  it("renders the compact mark without the wordmark", () => {
    render(<BrandLogo variant="mark" />);

    expect(screen.queryByText("SteelBuild-Pro")).not.toBeInTheDocument();
    expect(screen.queryByText("BUILT FOR THE PEOPLE WHO BUILD")).not.toBeInTheDocument();
  });

  it("draws the shared hex-S geometry rather than an inline copy of it", () => {
    const { container } = render(<BrandLogo variant="mark" />);

    const path = container.querySelector("path");
    expect(path?.getAttribute("d")).toBe(MARK_PATH);
    // evenodd is what keeps the carved S transparent on any surface.
    expect(path?.getAttribute("fill-rule")).toBe("evenodd");
  });

  it("pins both text lines to a fixed width so the fallback font cannot overflow the viewBox", () => {
    const { container } = render(<BrandLogo />);

    const lengths = Array.from(container.querySelectorAll("text")).map((t) => t.getAttribute("textLength"));
    expect(lengths).toEqual(["168", "168"]);
  });
});
