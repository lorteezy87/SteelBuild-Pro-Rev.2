// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const external = vi.hoisted(() => ({ error: vi.fn(), upload: vi.fn() }));
vi.mock("@/api/supabaseClient", () => ({ integrations: { Core: { UploadFile: external.upload } } }));
vi.mock("sonner", () => ({ toast: { error: external.error } }));
import SheetFormModal from "../SheetFormModal";

it("keeps existing source controls read-only while allowing metadata edits", () => {
  const save = vi.fn();
  const { container } = render(<SheetFormModal initial={{ id: "drawing-a", sheet_number: "S1", title: "Original title", revision_number: "A", pdf_page: 2, file_url: "old.pdf", drawing_set_name: "Set A" }} onSave={save} onClose={() => {}} saving={false} />);
  for (const value of ["S1", "A", "Set A"]) expect(screen.getByDisplayValue(value)).toBeDisabled();
  expect(screen.getByRole("spinbutton")).toBeDisabled();
  expect(container.querySelector('input[type="file"]')).toBeDisabled();
  fireEvent.change(screen.getByDisplayValue("Original title"), { target: { value: "Corrected title" } });
  fireEvent.click(screen.getByRole("button", { name: "SAVE SHEET" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: "Corrected title", file_url: "old.pdf", pdf_page: 2, revision_number: "A" }));
  expect(external.upload).not.toHaveBeenCalled();
});

it("does not invent page one for an unresolved new sheet", () => {
  const save = vi.fn();
  render(<SheetFormModal initial={{ sheet_number: "S2", title: "New sheet", pdf_page: null }} onSave={save} onClose={() => {}} saving={false} />);
  fireEvent.click(screen.getByRole("button", { name: "SAVE SHEET" }));
  expect(save).not.toHaveBeenCalled();
  expect(external.error).toHaveBeenCalledWith(expect.stringMatching(/confirm.*PDF page/i));
});
