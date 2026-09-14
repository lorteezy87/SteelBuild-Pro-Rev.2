// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceTab } from "../WorkspaceTab";
import { sanitizeUserPreferences, type UserPreferences } from "@/lib/userPreferences/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const projects = [
  { id: "p-1", name: "Mesa Medical", project_number: "24-101" },
  { id: "p-2", name: "Sky Harbor", project_number: "24-205" },
];

function renderWorkspace(onSave: (patch: Partial<UserPreferences> | UserPreferences) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceTab preferences={sanitizeUserPreferences({})} projects={projects} onSave={onSave} isSaving={false} />
    </QueryClientProvider>,
  );
}

describe("WorkspaceTab", () => {
  it("previews and confirms a workflow preset before saving it", () => {
    const onSave = vi.fn<(patch: Partial<UserPreferences> | UserPreferences) => void>();
    renderWorkspace(onSave);

    fireEvent.click(screen.getByRole("button", { name: /field preset/i }));
    expect(screen.getByText(/changes before applying/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /apply field preset/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      workspace_preset: "field",
      default_landing: "FieldToday",
    }));
  });

  it("saves favorite projects as personal preferences", () => {
    const onSave = vi.fn<(patch: Partial<UserPreferences> | UserPreferences) => void>();
    renderWorkspace(onSave);

    fireEvent.click(screen.getByRole("button", { name: /favorite mesa medical/i }));
    expect(onSave).toHaveBeenCalledWith({ favorite_project_ids: ["p-1"] });
  });
});
