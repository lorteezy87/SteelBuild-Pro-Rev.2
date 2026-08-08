// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import DashboardTab from "../DashboardTab";
import { sanitizeUserPreferences } from "@/lib/userPreferences/schema";

vi.mock("@/api/supabaseClient", () => ({
  entities: { Project: { list: vi.fn().mockResolvedValue([]) } },
}));

describe("DashboardTab", () => {
  it("persists only the preference the user changed", () => {
    const onSave = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DashboardTab preferences={sanitizeUserPreferences({ workspace_preset: "project_manager" })} onSave={onSave} isSaving={false} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText("5 min"));

    expect(onSave).toHaveBeenCalledWith({ auto_refresh_secs: 300 });
  });
});
