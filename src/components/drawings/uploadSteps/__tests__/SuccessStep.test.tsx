// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import SuccessStep from "../SuccessStep";
it("committed follow-up failure never invites another create", () => {
  const reconcile = vi.fn();
  render(<SuccessStep createdCount={2} fileResults={[]} processError="Drawings saved. Automatic schedule linking was not performed." commandWarning="Cache refresh failed." onViewLog={() => {}} onUploadAnother={null} onReconcile={reconcile} />);
  expect(screen.getByRole("heading")).toHaveTextContent("Drawing save committed");
  expect(screen.getByRole("alert")).toHaveTextContent("do not create a second copy");
  expect(screen.queryByRole("button", { name: "Upload Another Set" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reconcile committed receipt" }));
  expect(reconcile).toHaveBeenCalledOnce();
  expect(screen.getByRole("link")).toHaveAttribute("href", "/ScheduleHub");
  expect(screen.getByText(/Existing sets remain live/)).toBeInTheDocument();
});
