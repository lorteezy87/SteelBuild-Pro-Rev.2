import { describe, expect, it } from "vitest";
import { filterAndSortPhotos, groupPhotosByMonth } from "../photoGalleryHelpers";

describe("photoGalleryHelpers", () => {
  const photos = [
    { title: "Alpha", description: "", location: "North", category: "Progress", taken_date: "2026-01-02" },
    { title: "Beta", description: "detail", location: "South", category: "Safety", taken_date: "2026-02-01" },
  ];

  it("filters and sorts", () => {
    expect(filterAndSortPhotos(photos, { searchTerm: "north" }).map((p) => p.title)).toEqual(["Alpha"]);
    expect(filterAndSortPhotos(photos, { sortBy: "title_asc" }).map((p) => p.title)).toEqual(["Alpha", "Beta"]);
    expect(filterAndSortPhotos(photos, { sortBy: "date_desc" }).map((p) => p.title)).toEqual(["Beta", "Alpha"]);
  });

  it("groups by month key", () => {
    const sorted = filterAndSortPhotos(photos, { sortBy: "date_asc" });
    const groups = groupPhotosByMonth(sorted, true, (d) => String(d).slice(0, 7));
    expect(groups.map((g) => g.key)).toEqual(["2026-01", "2026-02"]);
    expect(groupPhotosByMonth(sorted, false, () => "x")).toEqual([{ key: null, items: sorted }]);
  });
});
