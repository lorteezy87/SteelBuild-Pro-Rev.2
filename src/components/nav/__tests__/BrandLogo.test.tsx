// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "../BrandLogo";

describe("BrandLogo", () => {
  it("renders the full wordmark by default", () => {
    render(<BrandLogo />);

    expect(screen.getByRole("img", { name: "SteelBuild Pro" })).toBeInTheDocument();
    expect(screen.getByText("STEELBUILD-PRO")).toBeInTheDocument();
  });

  it("renders a compact SB mark without the wordmark", () => {
    render(<BrandLogo variant="mark" />);

    expect(screen.getByText("SB")).toBeInTheDocument();
    expect(screen.queryByText("STEELBUILD-PRO")).not.toBeInTheDocument();
  });
});
