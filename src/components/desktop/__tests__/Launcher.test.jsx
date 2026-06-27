// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import Launcher from "@/components/desktop/Launcher";

describe("Launcher", () => {
  it("renders the module grid and category rail", () => {
    const { getByText, getByLabelText } = render(<Launcher onNavigate={() => {}} />);
    expect(getByText("ALL")).toBeTruthy();
    expect(getByLabelText("Open Deliveries")).toBeTruthy();
  });

  it("filters by search query", () => {
    const { getByPlaceholderText, queryByLabelText } = render(<Launcher onNavigate={() => {}} />);
    fireEvent.change(getByPlaceholderText(/type to search/i), { target: { value: "deliver" } });
    expect(queryByLabelText("Open Deliveries")).toBeTruthy();
    expect(queryByLabelText("Open Fab Release")).toBeNull();
  });

  it("navigates when a module tile is clicked", () => {
    const onNavigate = vi.fn();
    const { getByLabelText } = render(<Launcher onNavigate={onNavigate} />);
    fireEvent.click(getByLabelText("Open Deliveries"));
    expect(onNavigate).toHaveBeenCalledWith("Deliveries");
  });

  it("filters by category when a rail item is chosen", () => {
    const { getByText, queryByLabelText } = render(<Launcher onNavigate={() => {}} />);
    fireEvent.click(getByText("COST"));
    expect(queryByLabelText("Open Deliveries")).toBeNull();
    expect(queryByLabelText("Open Change Orders")).toBeTruthy();
  });
});
