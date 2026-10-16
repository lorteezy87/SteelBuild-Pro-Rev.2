// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import CrossSetSupersedePanel from "../CrossSetSupersedePanel";
import { planCrossSetSupersede } from "@/lib/crossSetSupersede";
const plan = planCrossSetSupersede({
  newSheets: [{ sheetNumber: "S1", sheetTitle: "Framing", revision: "B", selected: true }],
  meta: { setName: "New set", revision: "B" },
  source: { sets: [{ id: "old", set_name: "Existing set", is_locked: false }],
  drawings: [{ id: "old-sheet", drawing_set_id: "old", drawing_set_name: "Existing set", sheet_number: "S1", title: "Framing", revision_number: "A", is_superseded: false, is_deleted: false }] },
});
it("even a permitted user sees read-only matches and no replacement selection", () => {
  const toggle = vi.fn();
  render(<CrossSetSupersedePanel status="ready" plan={plan} canSupersede isChecked={() => true} onToggle={toggle} onRetry={() => {}} />);
  expect(screen.getByText(/Cross-set supersession is unavailable/)).toBeInTheDocument();
  expect(screen.getByRole("table")).toHaveTextContent("Existing set");
  expect(screen.getByRole("table")).toHaveTextContent("Remains live");
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(toggle).not.toHaveBeenCalled();
});
it("failed preview remains held with a read-only retry", () => {
  const retry = vi.fn();
  render(<CrossSetSupersedePanel status="error" plan={plan} onRetry={retry} />);
  expect(screen.getByText(/Existing sets remain live/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
  expect(retry).toHaveBeenCalledOnce();
});
