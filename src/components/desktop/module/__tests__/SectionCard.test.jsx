// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import SectionCard from "@/components/desktop/module/SectionCard";

describe("SectionCard", () => {
  it("renders title, header action, and children", () => {
    const { getByText } = render(
      <SectionCard title="Steel execution" headerAction={<a href="#">View all</a>}>
        <p>body</p>
      </SectionCard>,
    );
    expect(getByText("Steel execution")).toBeTruthy();
    expect(getByText("View all")).toBeTruthy();
    expect(getByText("body")).toBeTruthy();
  });
  it("omits the header when no title or action", () => {
    const { container, getByText } = render(<SectionCard><p>only</p></SectionCard>);
    expect(container.querySelector(".desk-section-card__head")).toBeNull();
    expect(getByText("only")).toBeTruthy();
  });
});
