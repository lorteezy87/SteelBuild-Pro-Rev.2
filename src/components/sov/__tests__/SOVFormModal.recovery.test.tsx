// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import SOVFormModal from "../SOVFormModal";

afterEach(cleanup);
const project = { id: "a", name: "Steel erection" };
const line = { id: "line-a", project_id: "a", description: "Original line", scheduled_value: 1000, previous_percent_complete: 0, current_percent_complete: 0, retainage_percent: 10, application_number: 1, status: "Draft" };

it("keeps edited inputs when the same record receives a newer query snapshot", () => {
  const props = { open: true, onClose: vi.fn(), onSave: vi.fn(), sov: line, activeProject: project, projects: [project] };
  const view = render(<SOVFormModal {...props} />);
  fireEvent.change(screen.getByDisplayValue("Original line"), { target: { value: "Reviewed description" } });
  view.rerender(<SOVFormModal {...props} sov={{ ...line, description: "Changed by coworker", scheduled_value: 1400 }} />);
  expect(screen.getByDisplayValue("Reviewed description")).toBeTruthy();
  expect(screen.getByDisplayValue("1000")).toBeTruthy();
  expect(screen.queryByDisplayValue("1400")).toBeNull();
});

it("recovers an uncertain save without validating or resubmitting edited fields", async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((_resolve, fail) => { reject = fail; });
  const onRecover = vi.fn(() => pending); const onSave = vi.fn();
  const view = render(<SOVFormModal open onClose={vi.fn()} onSave={onSave} requiresRecovery
    onRecover={onRecover} activeProject={project} initialValues={{ description: "Attempted line", scheduled_value: 0 }} />);
  expect(view.container.querySelector("fieldset")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Recover saved line" }));
  expect(onRecover).toHaveBeenCalledTimes(1); expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await act(async () => { reject(new Error("Reply remains unavailable")); });
  expect(screen.getByRole("alert").textContent).toContain("Reply remains unavailable");
  expect(screen.getByDisplayValue("Attempted line")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Recover saved line" })).not.toBeDisabled();
});

it("awaits a normal failed save and retains the editable draft", async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((_resolve, fail) => { reject = fail; });
  const onSave = vi.fn(() => pending);
  render(<SOVFormModal open onClose={vi.fn()} onSave={onSave} sov={line} activeProject={project} projects={[project]} />);
  fireEvent.click(screen.getByRole("button", { name: "Update" }));
  expect(onSave).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await act(async () => { reject(new Error("SOV changed; review current value")); });
  expect(screen.getByRole("alert").textContent).toContain("review current value");
  expect(screen.getByDisplayValue("1000")).toBeTruthy();
});
