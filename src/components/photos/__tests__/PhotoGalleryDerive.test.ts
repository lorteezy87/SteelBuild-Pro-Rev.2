import { describe, expect, it } from "vitest";
import {
  createPhotoEditPatch,
  derivePhotoSelection,
  deriveVisiblePhotos,
  formatPhotoGroupKey,
  getPhotoCategoryColor,
  groupPhotosByMonth,
  type PhotoRecord,
} from "../PhotoGalleryDerive";

function photo(overrides: Partial<PhotoRecord>): PhotoRecord {
  return {
    category: "Progress",
    created_at: "2026-09-01T12:00:00Z",
    daily_log_id: null,
    deleted_at: null,
    description: null,
    file_name: "photo.jpg",
    file_url: "project-files/project-1/photos/photo.jpg",
    id: "photo-1",
    inspection_id: null,
    is_deleted: false,
    location: null,
    metadata: null,
    project_id: "project-1",
    project_name: null,
    punchlist_item_id: null,
    taken_date: "2026-09-01T12:00:00Z",
    title: null,
    updated_at: null,
    ...overrides,
  };
}

describe("PhotoGallery derivations", () => {
  const photos = [
    photo({
      id: "older",
      title: "West elevation",
      description: "Bolting complete",
      category: "Progress",
      taken_date: "2026-08-10T10:00:00Z",
    }),
    photo({
      id: "newer",
      title: "Deck delivery",
      location: "Laydown Yard",
      category: "Delivery",
      taken_date: "2026-09-11T10:00:00Z",
    }),
    photo({
      id: "unknown-date",
      title: null,
      category: null,
      taken_date: null,
    }),
  ];

  it("filters all searchable metadata case-insensitively without mutating input", () => {
    const originalOrder = photos.map(({ id }) => id);

    expect(deriveVisiblePhotos(photos, "BOLTING", "date_desc").map(({ id }) => id)).toEqual([
      "older",
    ]);
    expect(deriveVisiblePhotos(photos, "laydown", "date_desc").map(({ id }) => id)).toEqual([
      "newer",
    ]);
    expect(photos.map(({ id }) => id)).toEqual(originalOrder);
  });

  it("preserves the four gallery sort modes and epoch fallback for missing dates", () => {
    expect(deriveVisiblePhotos(photos, "", "date_desc").map(({ id }) => id)).toEqual([
      "newer",
      "older",
      "unknown-date",
    ]);
    expect(deriveVisiblePhotos(photos, "", "date_asc").map(({ id }) => id)).toEqual([
      "unknown-date",
      "older",
      "newer",
    ]);
    expect(deriveVisiblePhotos(photos, "", "title_asc").map(({ id }) => id)).toEqual([
      "unknown-date",
      "newer",
      "older",
    ]);
    expect(deriveVisiblePhotos(photos, "", "category").map(({ id }) => id)).toEqual([
      "unknown-date",
      "newer",
      "older",
    ]);
  });

  it("groups in first-seen order and keeps missing or invalid dates under Unknown", () => {
    const invalid = photo({ id: "invalid", taken_date: "not-a-date" });
    const grouped = groupPhotosByMonth([...photos, invalid], true);

    expect(grouped.map(({ key }) => key)).toEqual([
      formatPhotoGroupKey(photos[0].taken_date),
      formatPhotoGroupKey(photos[1].taken_date),
      "Unknown",
    ]);
    expect(grouped[2].items.map(({ id }) => id)).toEqual(["unknown-date", "invalid"]);
    expect(groupPhotosByMonth(photos, false)).toEqual([{ key: null, items: photos }]);
  });

  it("derives bounded lightbox navigation metadata", () => {
    expect(derivePhotoSelection(photos, null)).toEqual({
      currentPhoto: null,
      canGoPrevious: false,
      canGoNext: false,
    });
    expect(derivePhotoSelection(photos, 0)).toEqual({
      currentPhoto: photos[0],
      canGoPrevious: false,
      canGoNext: true,
    });
    expect(derivePhotoSelection(photos, 2)).toEqual({
      currentPhoto: photos[2],
      canGoPrevious: true,
      canGoNext: false,
    });
    expect(derivePhotoSelection(photos, 99).currentPhoto).toBeNull();
  });

  it("creates the same editable metadata payload and category fallback", () => {
    expect(
      createPhotoEditPatch(
        photo({
          title: null,
          description: null,
          location: null,
          category: null,
          taken_date: "2026-09-11T17:30:00Z",
        }),
      ),
    ).toEqual({
      title: "",
      description: "",
      location: "",
      category: "Other",
      taken_date: "2026-09-11",
    });
    expect(getPhotoCategoryColor("Safety")).toBe("var(--status-error)");
    expect(getPhotoCategoryColor("Unrecognized")).toBe("var(--text-muted)");
  });
});
