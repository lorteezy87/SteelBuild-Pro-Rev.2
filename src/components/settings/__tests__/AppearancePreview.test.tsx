// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppearancePreview } from "../AppearancePreview";

describe("AppearancePreview", () => {
  it("shows representative steel workflow data for immediate visual feedback", () => {
    render(<AppearancePreview dateLabel="08/08/2026" currencyLabel="$125,400.00" measurementLabel="12,500 lb" />);

    expect(screen.getByText("A501")).toBeInTheDocument();
    expect(screen.getByText("B-102")).toBeInTheDocument();
    expect(screen.getByText("08/08/2026")).toBeInTheDocument();
    expect(screen.getByText("$125,400.00")).toBeInTheDocument();
    expect(screen.getByText("12,500 lb")).toBeInTheDocument();
  });
});
