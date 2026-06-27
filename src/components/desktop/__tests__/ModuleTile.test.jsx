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

  it("renders a lazy <img> with the resolved photo src", () => {
    const { container } = render(
      <ModuleTile page="Deliveries" label="Deliveries" photoSrc="/photos/desktop/deliveries.webp" />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain("deliveries.webp");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("renders no <img> and shows the gradient when there is no photo", () => {
    const { container, getByLabelText } = render(<ModuleTile page="__none__" label="Nothing" />);
    expect(container.querySelector("img")).toBeNull();
    expect(getByLabelText("Open Nothing").style.background).toContain("linear-gradient");
  });

  it("calls onSelect with the page when clicked", () => {
    const onSelect = vi.fn();
    const { getByLabelText } = render(<ModuleTile page="Deliveries" label="Deliveries" onSelect={onSelect} />);
    fireEvent.click(getByLabelText("Open Deliveries"));
    expect(onSelect).toHaveBeenCalledWith("Deliveries");
  });
});
