// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import GlobalSearchModal from "@/components/search/GlobalSearchModal";
import ModuleLauncherGrid from "@/components/nav/ModuleLauncherGrid";

const emptyRows = vi.hoisted((): unknown[] => []);
vi.mock("@/api/supabaseClient", () => ({ entities: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: emptyRows, isLoading: false }) }));
vi.mock("@/components/shared/ProjectContext", () => ({ useProjectContext: (): { activeProject: null } => ({ activeProject: null }) }));
vi.mock("@/hooks/useModuleAccess", () => ({ useModuleAccess: () => ({ isPageVisible: () => true }) }));

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("IFC navigation search", () => {
  it.each(["IFC", "3D", "BIM", "model"])("opens the IFC entry with keyboard selection after searching %s", async (query) => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MemoryRouter><LocationProbe /><GlobalSearchModal open onClose={onClose} /></MemoryRouter>);
    await user.type(screen.getByRole("textbox"), query);
    await screen.findByText("IFC 3D Viewer");
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("location")).toHaveTextContent("/IfcModelViewer");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the viewer in quick navigation before a query is entered", () => {
    render(<MemoryRouter><GlobalSearchModal open onClose={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText("IFC 3D Viewer")).toBeInTheDocument();
  });

  it("finds the same entry in All Modules by BIM and opens it", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    render(<ModuleLauncherGrid open onClose={onClose} onNavigate={onNavigate} />);
    await user.type(screen.getByPlaceholderText("Search modules…"), "BIM");
    await user.click(screen.getByText("IFC 3D Viewer"));
    expect(onNavigate).toHaveBeenCalledWith("IfcModelViewer");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
