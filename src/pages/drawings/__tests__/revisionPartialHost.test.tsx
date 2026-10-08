// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import Drawings from "@/pages/Drawings";

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: { id: "project-a", name: "Project A" } }),
}));
vi.mock("@/services/permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useFeatureFlag", () => ({ useFlag: () => false }));
vi.mock("@/services/cacheRegistry", () => ({ invalidateEntity: vi.fn(async () => undefined) }));
vi.mock("../useDrawingsPageData", () => ({
  useDrawingsPageData: () => ({
    drawings: [] as unknown[], drawingSetMap: new Map(), filtered: [] as unknown[],
    submittals: [] as unknown[], submittalsBySetId: new Map(),
  }),
}));
vi.mock("../DrawingsPageView", () => ({
  default: ({ state, controller }: {
    state: { revisionOpen: boolean; setRevisionOpen: (value: boolean) => void };
    controller: { handleRevisionComplete: (value: { complete: boolean; setId?: string }) => void };
  }) => (
    <div>
      <span data-testid="revision-state">{state.revisionOpen ? "open" : "closed"}</span>
      <button onClick={() => state.setRevisionOpen(true)}>Open revision</button>
      <button onClick={() => controller.handleRevisionComplete({ complete: false, setId: "set-1" })}>Partial save</button>
      <button onClick={() => controller.handleRevisionComplete({ complete: true })}>Complete save</button>
    </div>
  ),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("keeps the revision editor open after a partial write, then closes on complete save", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><Drawings /></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Open revision" }));
  expect(screen.getByTestId("revision-state")).toHaveTextContent("open");

  fireEvent.click(screen.getByRole("button", { name: "Partial save" }));
  expect(screen.getByTestId("revision-state")).toHaveTextContent("open");

  fireEvent.click(screen.getByRole("button", { name: "Complete save" }));
  expect(screen.getByTestId("revision-state")).toHaveTextContent("closed");
});
