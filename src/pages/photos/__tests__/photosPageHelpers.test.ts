import { describe, expect, it } from "vitest";
import {
  filterLiveRecords,
  filterPhotos,
  computePhotoStats,
} from "../photosPageHelpers";

describe("photosPageHelpers", () => {
  it("filters live/date/category and stats", () => {
    expect(filterLiveRecords([{ id: 1 }, { id: 2, is_deleted: true }])).toHaveLength(1);
    const now = new Date("2026-06-15T12:00:00Z");
    const photos = [
      { taken_date: "2026-06-15", category: "Progress" },
      { taken_date: "2026-05-01", category: "Safety" },
      { taken_date: "2026-06-14", category: "Issue" },
    ];
    expect(filterPhotos(photos, { filterDate: "today", filterCategory: "all", now })).toHaveLength(1);
    expect(filterPhotos(photos, { filterDate: "all", filterCategory: "Safety" })).toHaveLength(1);
    const stats = computePhotoStats(photos);
    expect(stats.total).toBe(3);
    expect(stats.progress).toBe(1);
    expect(stats.safety).toBe(1);
  });
});

import { PHOTO_CATEGORIES, PHOTO_DATE_RANGES } from "../photosPageHelpers";

describe("photo filter tokens", () => {
  it("exposes categories and date ranges", () => {
    expect(PHOTO_CATEGORIES).toContain("Progress");
    expect(PHOTO_DATE_RANGES[0].value).toBe("all");
  });
});
