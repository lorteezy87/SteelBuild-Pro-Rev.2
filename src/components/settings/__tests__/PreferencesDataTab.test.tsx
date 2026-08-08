// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreferencesDataTab } from "../PreferencesDataTab";
import { sanitizeUserPreferences } from "@/lib/userPreferences/schema";

describe("PreferencesDataTab", () => {
  it("reviews and applies a valid settings import", async () => {
    const onSave = vi.fn();
    render(<PreferencesDataTab preferences={sanitizeUserPreferences({})} onSave={onSave} isSaving={false} />);
    const payload = JSON.stringify({ version: 2, preferences: { theme: "light", pinned_modules: ["RFIs"] } });
    const file = new File([payload], "settings.json", { type: "application/json" });

    fireEvent.change(screen.getByLabelText(/import settings file/i), { target: { files: [file] } });
    await screen.findByText(/ready to import/i);
    fireEvent.click(screen.getByRole("button", { name: /apply imported settings/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ theme: "light", pinned_modules: ["RFIs"] }));
  });

  it("does not apply invalid imports", async () => {
    const onSave = vi.fn();
    render(<PreferencesDataTab preferences={sanitizeUserPreferences({})} onSave={onSave} isSaving={false} />);
    const file = new File(["invalid"], "settings.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/import settings file/i), { target: { files: [file] } });
    expect(await screen.findByText(/not valid json/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires the reset phrase before restoring all defaults", async () => {
    const onSave = vi.fn();
    render(<PreferencesDataTab preferences={sanitizeUserPreferences({ theme: "light" })} onSave={onSave} isSaving={false} />);
    const resetButton = screen.getByRole("button", { name: /reset all personal settings/i });
    expect(resetButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/reset confirmation/i), { target: { value: "RESET MY SETTINGS" } });
    await waitFor(() => expect(resetButton).toBeEnabled());
    fireEvent.click(resetButton);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ theme: "system", preferences_version: 2 }));
  });
});
