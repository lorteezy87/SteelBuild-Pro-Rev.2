// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ModuleTile from "@/components/desktop/ModuleTile";

describe("ModuleTile", () => {
  it("shows the lucide icon + label fallback when there is no photo", () => {
    const { getByText, container, getByLabelText } = render(<ModuleTile page="__none__" label="Nothing" />);
    expect(getByText("Nothing")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(getByLabelText("Open Nothing")).toBeTruthy();
  });

  it("shows the full image with NO overlaid label/icon when a photo is present", () => {
    const { container, queryByText, getByLabelText } = render(
      <ModuleTile page="Deliveries" label="Deliveries" photoSrc="/photos/desktop/Deliveries.webp" />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("src")).toContain("Deliveries.webp");
    expect(queryByText("Deliveries")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(getByLabelText("Open Deliveries")).toBeTruthy();
  });

  it("calls onSelect with the page when clicked", () => {
    const onSelect = vi.fn();
    const { getByLabelText } = render(<ModuleTile page="__none__" label="Nothing" onSelect={onSelect} />);
    fireEvent.click(getByLabelText("Open Nothing"));
    expect(onSelect).toHaveBeenCalledWith("__none__");
  });
});
