// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ModuleHeader from "@/components/desktop/module/ModuleHeader";

describe("ModuleHeader", () => {
  it("renders title, subtitle, and stat cluster", () => {
    const { getByText, getByRole } = render(
      <ModuleHeader page="RFIs" title="RFIs" subtitle="Requests for information"
        stats={[{ label: "Open", value: 14, tone: "gold" }, { label: "Overdue", value: 3, tone: "danger" }]} />,
    );
    expect(getByRole("heading", { name: "RFIs" })).toBeTruthy();
    expect(getByText("Requests for information")).toBeTruthy();
    expect(getByText("Open")).toBeTruthy();
    expect(getByText("14")).toBeTruthy();
  });
  it("renders the photo as a background img when one is provided", () => {
    const { container } = render(
      <ModuleHeader page="RFIs" title="RFIs" photoSrc="/photos/desktop/RFIs.webp" />,
    );
    const img = container.querySelector("img.desk-module-header__photo");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain("RFIs.webp");
  });
  it("renders actions and a tabs slot via children", () => {
    const { getByText } = render(
      <ModuleHeader page="RFIs" title="RFIs" actions={<button>New RFI</button>}>
        <div>TABS</div>
      </ModuleHeader>,
    );
    expect(getByText("New RFI")).toBeTruthy();
    expect(getByText("TABS")).toBeTruthy();
  });
});
