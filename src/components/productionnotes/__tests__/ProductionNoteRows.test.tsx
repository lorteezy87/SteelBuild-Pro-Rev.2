// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductionNoteRows } from "../ProductionNoteRows";
import type { ProductionNoteProjectRow } from "@/pages/productionNotes/productionNotesDerive";

const row = (
  overrides: Partial<ProductionNoteProjectRow["bullets"][number]> = {},
): ProductionNoteProjectRow => ({
  projectId: "project-1",
  project: {
    id: "project-1",
    name: "Alpha Project",
    project_number: "100",
  },
  bullets: [
    {
      id: "note-1",
      project_id: "project-1",
      note_date: "2026-09-08",
      date_noted: "2026-09-08",
      date_due: null,
      content: "Original",
      is_high_priority: false,
      ...overrides,
    },
  ],
});

function renderRows(noteOverrides = {}) {
  const callbacks = {
    onUpdateBulletText: vi.fn(),
    onUpdateBulletDates: vi.fn(),
    onToggleHighlight: vi.fn(),
    onDeleteBullet: vi.fn(),
    onAddBullet: vi.fn(),
  };
  render(<ProductionNoteRows rows={[row(noteOverrides)]} {...callbacks} />);
  return callbacks;
}

describe("ProductionNoteRows", () => {
  it("trims trailing whitespace on blur without changing inline editor semantics", () => {
    const callbacks = renderRows();
    const editor = screen.getByRole("textbox");
    fireEvent.change(editor, { target: { value: "Updated note   " } });
    fireEvent.blur(editor);

    expect(callbacks.onUpdateBulletText).toHaveBeenCalledWith(
      expect.objectContaining({ id: "note-1" }),
      "Updated note",
    );
  });

  it("commits the current bullet and creates the next one on Enter", () => {
    const callbacks = renderRows();
    const editor = screen.getByRole("textbox");
    fireEvent.change(editor, { target: { value: "Ready for shop" } });
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(callbacks.onUpdateBulletText).toHaveBeenCalledWith(
      expect.objectContaining({ id: "note-1" }),
      "Ready for shop",
    );
    expect(callbacks.onAddBullet).toHaveBeenCalledWith("project-1", "");
  });

  it("does not persist date edits while an optimistic note lacks a server id", () => {
    const callbacks = renderRows({ id: "tmp-1", _optimistic: true });
    fireEvent.change(screen.getByLabelText("Due"), {
      target: { value: "2026-09-22" },
    });

    expect(callbacks.onUpdateBulletDates).not.toHaveBeenCalled();
  });
});
