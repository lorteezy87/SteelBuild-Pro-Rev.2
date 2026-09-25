// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { shareCurrentReport } = vi.hoisted(() => ({
  shareCurrentReport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/native/platform", () => ({ isNativePlatform: () => true }));
vi.mock("@/lib/native/capabilities", () => ({
  shareCurrentReport,
  isNativeActionCancelled: () => false,
}));
vi.mock("@/components/design-system", () => ({
  CommandBar: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <header><h1>{title}</h1>{children}</header>
  ),
}));

import ReportShell from "@/pages/reports/ReportShell";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(shareCurrentReport).toHaveBeenCalledWith({
      title: "Project Status",
      url: window.location.href,
    }));
  });
});
