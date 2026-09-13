// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PhotoLightbox from "../PhotoLightbox";
import type { PhotoRecord } from "../PhotoGalleryDerive";

const { resolveFileUrl } = vi.hoisted(() => ({
  resolveFileUrl: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({ resolveFileUrl }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const PHOTO: PhotoRecord = {
  category: "Progress",
  created_at: "2026-09-12T12:00:00Z",
  daily_log_id: null,
  deleted_at: null,
  description: "North elevation steel",
  file_name: "north.jpg",
  file_url: "project-files/project-1/photos/north.jpg",
  id: "photo-1",
  inspection_id: null,
  is_deleted: false,
  location: "Grid A",
  metadata: null,
  project_id: "project-1",
  project_name: null,
  punchlist_item_id: null,
  taken_date: "2026-09-12T12:00:00Z",
  title: "North elevation",
  updated_at: null,
};

describe("PhotoLightbox", () => {
  beforeEach(() => {
    resolveFileUrl.mockReset();
    resolveFileUrl.mockResolvedValue("https://signed.example/north.jpg");
  });

  it("resolves the stored file URL and submits the existing edit payload shape", async () => {
    const onSave = vi.fn();
    render(
      <PhotoLightbox
        photo={PHOTO}
        index={0}
        total={1}
        onClose={vi.fn()}
        onPrev={null}
        onNext={null}
        onDelete={vi.fn()}
        onSave={onSave}
        deleting={false}
        saving={false}
      />,
    );

    await waitFor(() => expect(resolveFileUrl).toHaveBeenCalledWith(PHOTO.file_url));
    expect(await screen.findByAltText("North elevation")).toHaveAttribute(
      "src",
      "https://signed.example/north.jpg",
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("North elevation"), {
      target: { value: "North elevation complete" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("photo-1", {
      title: "North elevation complete",
      description: "North elevation steel",
      location: "Grid A",
      category: "Progress",
      taken_date: "2026-09-12",
    });
  });

  it("keeps delete confirmation and navigation controls wired", () => {
    const onDelete = vi.fn();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <PhotoLightbox
        photo={PHOTO}
        index={1}
        total={3}
        onClose={vi.fn()}
        onPrev={onPrevious}
        onNext={onNext}
        onDelete={onDelete}
        onSave={vi.fn()}
        deleting={false}
        saving={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
    expect(window.confirm).toHaveBeenCalledWith(
      'Delete "North elevation"? This cannot be undone.',
    );
    expect(onDelete).toHaveBeenCalledWith("photo-1");
  });
});
