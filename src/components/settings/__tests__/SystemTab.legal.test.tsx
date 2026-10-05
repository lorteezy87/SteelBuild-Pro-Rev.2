// @vitest-environment jsdom
/**
 * Settings → System → "Support & Legal".
 *
 * The privacy policy has to be reachable inside the iOS app (App Store
 * guideline 5.1.1), and the native shell drops target="_blank" navigations,
 * so these must be in-app router links rather than plain text or new-window
 * anchors.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/OrgContext", () => ({
  useOrg: () => ({ currentOrg: { id: "org-1", name: "Acme Steel" } }),
}));
vi.mock("@/lib/workspaceExport", () => ({
  exportWorkspace: vi.fn(),
  downloadWorkspaceExport: vi.fn(),
  fetchWorkspaceProjects: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SystemTab from "@/components/settings/SystemTab";

describe("SystemTab support & legal links", () => {
  it("links the privacy policy, terms and support inside the app", () => {
    render(
      <MemoryRouter>
        <SystemTab user={{ email: "pm@example.com" }} />
      </MemoryRouter>,
    );

    const privacy = screen.getByRole("link", { name: "Privacy Policy" });
    const terms = screen.getByRole("link", { name: "Terms of Service" });
    const support = screen.getByRole("link", { name: "support@steelbuild-pro.com" });

    expect(privacy).toHaveAttribute("href", "/privacy");
    expect(terms).toHaveAttribute("href", "/terms");
    expect(support).toHaveAttribute("href", "mailto:support@steelbuild-pro.com");
    for (const link of [privacy, terms, support]) {
      expect(link).not.toHaveAttribute("target");
    }
  });
});
