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

  it("renders an <img> with the resolved photo src", () => {
    const { container } = render(
      <ModuleTile page="Deliveries" label="Deliveries" photoSrc="/photos/desktop/deliveries.webp" />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain("deliveries.webp");
  });

  it("renders no <img> and shows the gradient when there is no photo", () => {
    const { container, getByLabelText } = render(<ModuleTile page="__none__" label="Nothing" />);
    expect(container.querySelector("img")).toBeNull();
    expect(getByLabelText("Open Nothing").style.background).toContain("linear-gradient");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    const { getByLabelText } = render(<ModuleTile page="Deliveries" label="Deliveries" onClick={onClick} />);
    fireEvent.click(getByLabelText("Open Deliveries"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
