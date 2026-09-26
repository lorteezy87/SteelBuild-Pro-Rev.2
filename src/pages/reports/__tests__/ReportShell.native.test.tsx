// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { setActiveProject, shareCurrentReport, useProjectContext } = vi.hoisted(() => ({
  setActiveProject: vi.fn(),
  shareCurrentReport: vi.fn().mockResolvedValue(undefined),
  useProjectContext: vi.fn(),
}));

vi.mock("@/lib/native/platform", () => ({ isNativePlatform: () => true }));
vi.mock("@/lib/native/capabilities", () => ({
  shareCurrentReport,
  isNativeActionCancelled: () => false,
}));
vi.mock("@/components/shared/ProjectContext", () => ({ useProjectContext }));
vi.mock("@/components/design-system", () => ({
  CommandBar: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <header><h1>{title}</h1>{children}</header>
  ),
}));

import ReportShell from "@/pages/reports/ReportShell";

beforeEach(() => {
  useProjectContext.mockReturnValue({
    activeProject: { id: "project-42", name: "Tower A" },
    loading: false,
    projects: [{ id: "project-42", name: "Tower A" }],
    setActiveProject,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("ReportShell native actions", () => {
  it("offers the iOS share sheet for a report", async () => {
    window.history.pushState({}, "", "/Reports/project-status");
    render(
      <MemoryRouter>
        <ReportShell
          title="Project Status"
          count={undefined}
          unit={undefined}
          subtitle={undefined}
          filters={undefined}
          onExportCSV={undefined}
          onPrint={() => {}}
          headerActions={undefined}
        >
          Report body
        </ReportShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Share link" }));

    const sharedUrl = new URL(window.location.href);
    sharedUrl.searchParams.set("projectId", "project-42");

    await waitFor(() => expect(shareCurrentReport).toHaveBeenCalledWith({
      title: "Project Status",
      url: sharedUrl.toString(),
    }));
  });

  it("selects an accessible project encoded in a shared report link", async () => {
    const sharedProject = { id: "project-99", name: "Warehouse" };
    useProjectContext.mockReturnValue({
      activeProject: null,
      loading: false,
      projects: [sharedProject],
      setActiveProject,
    });
    window.history.pushState({}, "", "/Reports/project-status?projectId=project-99");

    render(
      <MemoryRouter>
        <ReportShell
          title="Project Status"
          count={undefined}
          unit={undefined}
          subtitle={undefined}
          filters={undefined}
          onExportCSV={undefined}
          onPrint={() => {}}
          headerActions={undefined}
        >
          Report body
        </ReportShell>
      </MemoryRouter>,
    );

    await waitFor(() => expect(setActiveProject).toHaveBeenCalledWith(sharedProject));
  });

  it("fails closed when a shared project is inaccessible", async () => {
    useProjectContext.mockReturnValue({
      activeProject: { id: "project-42", name: "Tower A" },
      loading: false,
      projects: [{ id: "project-42", name: "Tower A" }],
      setActiveProject,
    });
    window.history.pushState({}, "", "/Reports/project-status?projectId=project-99");

    render(
      <MemoryRouter>
        <ReportShell
          title="Project Status"
          count={undefined}
          unit={undefined}
          subtitle={undefined}
          filters={undefined}
          onExportCSV={undefined}
          onPrint={() => {}}
          headerActions={undefined}
        >
          Private report body
        </ReportShell>
      </MemoryRouter>,
    );

    await waitFor(() => expect(setActiveProject).toHaveBeenCalledWith(null));
    expect(screen.getByRole("alert")).toHaveTextContent("shared project is unavailable");
    expect(screen.queryByText("Private report body")).not.toBeInTheDocument();
  });
});
