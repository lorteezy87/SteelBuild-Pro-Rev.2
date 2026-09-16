// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QCFormModal from "../QCFormModal";
import type { ComponentType } from "react";

// The legacy JS component's record=null default infers a null-only prop.
// Describe the edit payload actually consumed by the form at this boundary.
const EditQCFormModal = QCFormModal as unknown as ComponentType<{
  projectId: string;
  record: {
    id: string; project_id: string; test_date: string; material_or_component: string;
    result: string; quantity_tested: number; quantity_passed: number;
  };
  onClose: () => void;
  onSave: (record: Record<string, unknown>) => void;
}>;

vi.mock("@/api/supabaseClient", () => ({
  entities: { Project: { list: vi.fn().mockResolvedValue([]) } },
}));
vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: (): { current: HTMLElement | null } => ({ current: null }),
}));

afterEach(cleanup);

function renderRecord() {
  const onSave = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["projects"], [{ id: "project-1", name: "Test project" }]);
  render(
    <QueryClientProvider client={client}>
      <EditQCFormModal
        projectId="project-1"
        record={{
          id: "qc-1", project_id: "project-1", test_date: "2026-09-13",
          material_or_component: "Weld specimens", result: "Fail",
          quantity_tested: 3, quantity_passed: 0,
        }}
        onClose={() => {}}
        onSave={onSave}
      />
    </QueryClientProvider>,
  );
  return onSave;
}

describe("QCFormModal quantity submission", () => {
  it("preserves zero passing specimens when saving a failed test", () => {
    const onSave = renderRecord();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      result: "Fail", quantity_tested: 3, quantity_passed: 0,
    }));
  });

  it.each([
    { field: 0, value: "0", description: "zero specimens tested" },
    { field: 1, value: "-1", description: "negative specimens passed" },
  ])("keeps browser validation for $description", ({ field, value }) => {
    const onSave = renderRecord();
    const input = screen.getAllByRole("spinbutton")[field] as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
    expect(input.validity.rangeUnderflow).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
