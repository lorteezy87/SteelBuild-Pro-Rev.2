// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ModuleTile from "@/components/desktop/ModuleTile";

describe("ModuleTile", () => {
  it("renders the label and a white lucide icon (svg)", () => {
    const { getByText, container } = render(<ModuleTile page="Deliveries" label="Deliveries" />);
    expect(getByText("Deliveries")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("uses the photo as a background image when one is provided", () => {
    const { getByLabelText } = render(
      <ModuleTile page="Deliveries" label="Deliveries" photoSrc="/photos/desktop/deliveries.webp" />,
    );
    const btn = getByLabelText("Open Deliveries");
    expect(btn.style.backgroundImage).toContain("deliveries.webp");
  });

  it("falls back to a gradient (no background image) when there is no photo", () => {
    const { getByLabelText } = render(<ModuleTile page="Deliveries" label="Deliveries" />);
    const btn = getByLabelText("Open Deliveries");
    expect(btn.style.backgroundImage).toBe("");
    expect(btn.style.background).toContain("linear-gradient");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    const { getByLabelText } = render(<ModuleTile page="Deliveries" label="Deliveries" onClick={onClick} />);
    fireEvent.click(getByLabelText("Open Deliveries"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
