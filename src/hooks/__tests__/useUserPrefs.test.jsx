// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthContext } from "@/lib/AuthContext";
import { useUserPrefs } from "@/hooks/useUserPrefs";

function Probe() {
  const prefs = useUserPrefs();
  return <output>{JSON.stringify(prefs)}</output>;
}

function renderWithUser(user) {
  render(
    <AuthContext.Provider value={{ user }}>
      <Probe />
    </AuthContext.Provider>,
  );
  return JSON.parse(screen.getByRole("status").textContent || "{}");
}

describe("useUserPrefs", () => {
  it("returns the complete validated preference contract", () => {
    const prefs = renderWithUser({
      id: "user-1",
      theme: "invalid",
      pinned_modules: ["RFIs", 4, "RFIs"],
      favorite_project_ids: ["project-1"],
    });

    expect(prefs.preferences_version).toBe(2);
    expect(prefs.theme).toBe("system");
    expect(prefs.pinned_modules).toEqual(["RFIs"]);
    expect(prefs.favorite_project_ids).toEqual(["project-1"]);
    expect(prefs.show_tooltips).toBe(true);
  });
});
