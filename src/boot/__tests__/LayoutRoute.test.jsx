// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/Layout", () => ({
  default: ({ children }) => <div data-testid="classic-layout">{children}</div>,
}));
vi.mock("@/components/desktop/DesktopShell", () => ({
  default: ({ children }) => <div data-testid="desktop-shell">{children}</div>,
}));

let flagOn = false;
vi.mock("@/hooks/useFeatureFlag", () => ({ useFlag: () => flagOn }));

import LayoutRoute from "@/boot/LayoutRoute";

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/Drawings"]}>
      <Routes>
        <Route element={<LayoutRoute />}>
          <Route path="Drawings" element={<div>page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("LayoutRoute shell selection", () => {
  beforeEach(() => { flagOn = false; });

  it("renders the classic Layout when desktop_shell is off", () => {
    renderAt();
    expect(screen.getByTestId("classic-layout")).toBeTruthy();
    expect(screen.queryByTestId("desktop-shell")).toBeNull();
  });

  it("renders classic Layout when desktop_shell is on for dashboard chrome pages", () => {
    flagOn = true;
    renderAt();
    expect(screen.getByTestId("classic-layout")).toBeTruthy();
    expect(screen.queryByTestId("desktop-shell")).toBeNull();
  });

  it("renders classic Layout when desktop_shell is on for all pages", () => {
    flagOn = true;
    render(
      <MemoryRouter initialEntries={["/ChangeOrders"]}>
        <Routes>
          <Route element={<LayoutRoute />}>
            <Route path="ChangeOrders" element={<div>page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("classic-layout")).toBeTruthy();
    expect(screen.queryByTestId("desktop-shell")).toBeNull();
  });
});
