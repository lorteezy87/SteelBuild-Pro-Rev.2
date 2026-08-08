// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const savePatchConfirmed = vi.fn().mockResolvedValue({ status: "persisted" });
const setTheme = vi.fn();
const setContrast = vi.fn();

vi.mock("@/hooks/useSaveUserPrefs", () => ({ useSaveUserPrefs: () => ({ savePatchConfirmed }) }));
vi.mock("@/components/shared/ThemeContext", () => ({
  useTheme: () => ({
    theme: "dark",
    themePreference: "system",
    contrast: "normal",
    setTheme,
    setContrast,
  }),
}));

import ThemeToggleButton from "../ThemeToggleButton";
import HighContrastToggleButton from "../HighContrastToggleButton";

describe("top-bar personalization toggles", () => {
  beforeEach(() => {
    savePatchConfirmed.mockClear();
    savePatchConfirmed.mockResolvedValue({ status: "persisted" });
    setTheme.mockClear();
    setContrast.mockClear();
  });

  it("applies and persists the selected theme", () => {
    render(<ThemeToggleButton />);
    fireEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));

    expect(setTheme).toHaveBeenCalledWith("light");
    expect(savePatchConfirmed).toHaveBeenCalledWith({ theme: "light" });
  });

  it("applies and persists high contrast", () => {
    render(<HighContrastToggleButton />);
    fireEvent.click(screen.getByRole("button", { name: /toggle high contrast/i }));

    expect(setContrast).toHaveBeenCalledWith("high");
    expect(savePatchConfirmed).toHaveBeenCalledWith({ contrast_mode: "high" });
  });

  it("restores the confirmed theme after rapid failed toggles", async () => {
    savePatchConfirmed.mockResolvedValue({ status: "failed", confirmed: { theme: "system" } });
    render(<ThemeToggleButton />);

    fireEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));
    fireEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));

    await waitFor(() => expect(setTheme).toHaveBeenLastCalledWith("system"));
  });
});
