// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import AddTaskModal from "../AddTaskModal";
import BulkAddTaskModal from "../BulkAddTaskModal";
import { SCHEDULE_STATUSES } from "@/lib/schedule/taskStatus";
import { durationFromDates } from "@/lib/schedule/duration";

/**
 * Audit §4.1 — "the two add paths are backwards".
 *
 * BulkAddTaskModal, behind the secondary button, was the better editor; the
 * primary "+ New Task" had no duration, no predecessor, an unsearchable list of
 * every task on the project, no Enter to submit, and a status list that did not
 * match the other one. Both now share a field set and a vocabulary.
 *
 * These render the real components rather than reading their source, because
 * the thing that was wrong was behaviour: what a keystroke did, and what the
 * finish date became.
 */

const TASKS = [
  { id: "t1", task_name: "Erect sequence 1", wbs_code: "6.1", phase: "Erection" },
  { id: "t2", task_name: "Punch list", wbs_code: "7.1", phase: "Closeout" },
];

function renderAdd(props: Record<string, unknown> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const utils = render(
    <AddTaskModal
      open
      onClose={onClose}
      onSubmit={onSubmit}
      projectName="Test Job"
      prefilledDate="2026-03-02" /* a Monday */
      existingTasks={TASKS}
      {...props}
    />,
  );
  return { ...utils, onSubmit, onClose };
}

/** The labelled control for a field, by its visible label text. */
function field(label: RegExp): HTMLElement {
  return screen.getByLabelText(label);
}

describe("New Task — the fields the audit asked for", () => {
  it("offers duration and a predecessor, so linking is not a second trip", () => {
    renderAdd();
    expect(screen.getByText(/duration \(days\)/i)).toBeInTheDocument();
    expect(screen.getByText(/^predecessor$/i)).toBeInTheDocument();
    expect(screen.getByText(/^parent task$/i)).toBeInTheDocument();
  });

  it("offers exactly the statuses the database accepts", () => {
    renderAdd();
    const status = screen.getByRole("combobox", { name: /status/i });
    const offered = within(status).getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean);
    expect(offered).toEqual([...SCHEDULE_STATUSES]);
    expect(offered).not.toContain("Cancelled");
  });

  it("computes the finish from an inclusive duration", () => {
    // Mon 2026-03-02 for 5 days is Fri 2026-03-06, not Sat the 7th. Getting
    // this wrong by one is how a 5-day task silently becomes 6 (§2.4).
    renderAdd();
    fireEvent.change(field(/duration \(days\)/i), { target: { value: "5" } });
    expect((field(/end date/i) as HTMLInputElement).value).toBe("2026-03-06");
  });

  it("carries the duration when the start moves", () => {
    renderAdd();
    fireEvent.change(field(/duration \(days\)/i), { target: { value: "5" } });
    fireEvent.change(field(/start date/i), { target: { value: "2026-03-09" } });
    expect((field(/end date/i) as HTMLInputElement).value).toBe("2026-03-13");
  });

  it("mirrors the duration back when the finish is typed directly", () => {
    renderAdd();
    fireEvent.change(field(/end date/i), { target: { value: "2026-03-06" } });
    expect((field(/duration \(days\)/i) as HTMLInputElement).value).toBe("5");
  });
});

describe("New Task — Enter saves and opens the next", () => {
  it("saves on Enter and closes", async () => {
    const { onSubmit, onClose } = renderAdd();
    fireEvent.change(field(/task name/i), { target: { value: "Set embeds" } });
    fireEvent.keyDown(field(/task name/i), { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ task_name: "Set embeds" });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("Shift+Enter saves and keeps the form open for the next task", async () => {
    const { onSubmit, onClose } = renderAdd();
    fireEvent.change(field(/task name/i), { target: { value: "Set embeds" } });
    fireEvent.change(field(/resources/i), { target: { value: "Fab A" } });
    fireEvent.keyDown(field(/task name/i), { key: "Enter", shiftKey: true });

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    // The name clears for the next task; the crew and phase stay put, because
    // entering a sequence means ten tasks on the same crew.
    await vi.waitFor(() =>
      expect((field(/task name/i) as HTMLInputElement).value).toBe(""),
    );
    expect((field(/resources/i) as HTMLInputElement).value).toBe("Fab A");
  });

  it("keeps what was typed when the save fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("nope"));
    const { onClose } = renderAdd({ onSubmit });
    fireEvent.change(field(/task name/i), { target: { value: "Set embeds" } });
    fireEvent.keyDown(field(/task name/i), { key: "Enter" });

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect((field(/task name/i) as HTMLInputElement).value).toBe("Set embeds");
  });

  it("will not save a task with no name", () => {
    const { onSubmit } = renderAdd();
    fireEvent.keyDown(field(/task name/i), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const { onClose } = renderAdd();
    fireEvent.keyDown(field(/task name/i), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends the predecessor as an FS link, not a bare id", () => {
    const { onSubmit } = renderAdd();
    fireEvent.change(field(/task name/i), { target: { value: "Erect sequence 2" } });
    // Choose the predecessor through the searchable picker.
    fireEvent.change(screen.getAllByPlaceholderText(/search tasks/i)[1], {
      target: { value: "sequence 1" },
    });
    fireEvent.click(screen.getByText("Erect sequence 1"));
    fireEvent.keyDown(field(/task name/i), { key: "Enter" });

    const payload = onSubmit.mock.calls[0][0];
    expect(JSON.parse(payload.dependencies)).toEqual([
      { id: "t1", type: "FS", lag_days: 1 },
    ]);
  });
});

describe("Bulk Add — on the same duration convention", () => {
  function renderBulk() {
    const onSubmit = vi.fn();
    const utils = render(
      <BulkAddTaskModal
        open
        onClose={() => {}}
        onSubmit={onSubmit}
        projectName="Test Job"
        isSaving={false}
        existingTasks={TASKS}
      />,
    );
    return { ...utils, onSubmit };
  }

  it("starts a row at one inclusive day, not zero", () => {
    // The old default of 0 also drove the finish column, so every row opened
    // claiming a zero-length task.
    renderBulk();
    const days = screen.getAllByPlaceholderText("1")[0] as HTMLInputElement;
    expect(days.value).toBe("1");
  });

  it("computes the finish inclusively", () => {
    // This grid was left on the old exclusive arithmetic when duration was
    // unified: typing 5 gave a Mon → Sat bar, and because the database trigger
    // then recomputed the column inclusively, the row came back saying 6.
    const { onSubmit } = renderBulk();
    const name = document.querySelector('[data-row="0"][data-col="task_name"]') as HTMLInputElement;
    const days = document.querySelector('[data-row="0"][data-col="duration"]') as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Erect sequence 2" } });
    fireEvent.change(days, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /save 1 task/i }));

    const [row] = onSubmit.mock.calls[0][0];
    // Asserted through the shared convention rather than a literal date, so
    // this stays true whatever "today" is when the suite runs.
    expect(durationFromDates(row.start_date, row.end_date)).toBe(5);
    expect(row.duration).toBe(5);
  });

  it("saves the row that was filled without reddening the untouched ones", () => {
    // The grid opens with three rows. Requiring a name on all of them meant
    // filling one and pressing a button that said "SAVE 1 TASKS" and refused.
    const { onSubmit } = renderBulk();
    const name = document.querySelector('[data-row="0"][data-col="task_name"]') as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Set embeds" } });
    fireEvent.click(screen.getByRole("button", { name: /save 1 task/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toHaveLength(1);
    expect(onSubmit.mock.calls[0][0][0]).toMatchObject({ task_name: "Set embeds" });
  });

  it("still refuses a row that was started but left unnamed", () => {
    // A row with a crew typed into it is an incomplete task, not an empty slot.
    const { onSubmit } = renderBulk();
    const resources = document.querySelector('[data-row="1"][data-col="resources"]') as HTMLInputElement;
    const name = document.querySelector('[data-row="0"][data-col="task_name"]') as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Set embeds" } });
    fireEvent.change(resources, { target: { value: "Fab A" } });
    fireEvent.click(screen.getByRole("button", { name: /save 1 task/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByPlaceholderText("Required").length).toBeGreaterThan(0);
  });

  it("offers no status the database would reject", () => {
    renderBulk();
    const status = screen.getAllByRole("combobox").find((el) =>
      within(el).queryByRole("option", { name: "Not Started" }),
    );
    expect(status).toBeDefined();
    const offered = within(status as HTMLElement).getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(offered).toEqual([...SCHEDULE_STATUSES]);
    expect(offered).not.toContain("Cancelled");
  });
});
