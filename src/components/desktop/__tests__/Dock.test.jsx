// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import Dock from "@/components/desktop/Dock";

describe("Dock", () => {
  it("renders a button per default dock module", () => {
    const { getByLabelText } = render(
      <Dock currentPageName="Dashboard" onNavigate={() => {}} onShowLauncher={() => {}} />,
    );
    expect(getByLabelText("Detailing Control Center")).toBeTruthy();
    expect(getByLabelText("Deliveries")).toBeTruthy();
  });

  it("navigates when a dock button is clicked", () => {
    const onNavigate = vi.fn();
    const { getByLabelText } = render(
      <Dock currentPageName="Dashboard" onNavigate={onNavigate} onShowLauncher={() => {}} />,
    );
    fireEvent.click(getByLabelText("Deliveries"));
    expect(onNavigate).toHaveBeenCalledWith("Deliveries");
  });

  it("calls onShowLauncher from the Show Applications button", () => {
    const onShowLauncher = vi.fn();
    const { getByLabelText } = render(
      <Dock currentPageName="Dashboard" onNavigate={() => {}} onShowLauncher={onShowLauncher} />,
    );
    fireEvent.click(getByLabelText("Show applications"));
    expect(onShowLauncher).toHaveBeenCalled();
  });
});
