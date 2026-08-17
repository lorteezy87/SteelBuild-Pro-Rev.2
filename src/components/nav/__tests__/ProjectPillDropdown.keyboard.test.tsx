// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const setActiveProject = vi.fn();
const setSearchParams = vi.fn();
const savePatch = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] as Array<Record<string, unknown>> }),
}));
vi.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), setSearchParams],
}));
vi.mock("../../shared/ProjectContext", () => ({
  useProjectContext: () => ({
    activeProjects: [
      { id: "a", name: "Alpha", phase: "Fabrication" },
      { id: "b", name: "Beta", phase: "Erection" },
    ],
    activeProject: null as { id: string; name: string; phase: string } | null,
    setActiveProject,
    loading: false,
  }),
}));
vi.mock("@/hooks/useUserPrefs", () => ({
  useUserPrefs: () => ({ favorite_project_ids: [] as string[], show_project_numbers: true }),
}));
vi.mock("@/hooks/useSaveUserPrefs", () => ({
  useSaveUserPrefs: () => ({ savePatch }),
}));

import ProjectPillDropdown from "../ProjectPillDropdown";

beforeEach(() => {
  setActiveProject.mockClear();
  setSearchParams.mockClear();
  savePatch.mockClear();
});

it("opens from the keyboard and selects the highlighted project with arrows and Enter", async () => {
  const user = userEvent.setup();
  render(<ProjectPillDropdown />);
  const trigger = screen.getByRole("button", { name: /project picker/i });
  trigger.focus();
  await user.keyboard("{Enter}");

  const search = screen.getByRole("combobox", { name: /search projects/i });
  fireEvent.keyDown(search, { key: "ArrowDown" });
  fireEvent.keyDown(search, { key: "Enter" });

  expect(setActiveProject).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
});
