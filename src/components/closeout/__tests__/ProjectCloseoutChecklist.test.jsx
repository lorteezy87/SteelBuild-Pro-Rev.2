// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectCloseoutChecklist from "../ProjectCloseoutChecklist";

const closeout = {
  id: "closeout-1",
  project_id: "p-1",
  closeout_status: "In Progress",
  final_inspection_completed: false,
  punch_list_cleared: true,
  all_invoices_processed: false,
  warranties_registered: false,
  as_built_docs_completed: false,
  permits_closed: false,
};

describe("ProjectCloseoutChecklist", () => {
  it("emits only the changed checklist field", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ProjectCloseoutChecklist closeout={closeout} onUpdate={onUpdate} />);

    await user.click(screen.getByRole("button", { name: /final inspection/i }));

    expect(onUpdate).toHaveBeenCalledWith({ final_inspection_completed: true });
  });

  it("disables checklist actions while an update is pending", () => {
    render(<ProjectCloseoutChecklist closeout={closeout} onUpdate={() => {}} isUpdating />);
    expect(screen.getByRole("button", { name: /final inspection/i })).toBeDisabled();
  });
});
