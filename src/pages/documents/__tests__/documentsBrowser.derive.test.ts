import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ancestorIds, childFolders, descendantIds, directDocCounts, formatCreatedOn, indexFolderChildren,
  isNeedsReview, quickViewDocs, restorePatch, searchFolders, sortDocuments, sortFolders,
} from "../documentsBrowser.derive";
import type { DocumentRecord, FolderRecord } from "../documentsControlCenter.derive";

const folders: Array<FolderRecord & { created_at?: string }> = [
  { id: "a", name: "10 Shop Drawings", parent_folder_id: null, created_at: "2026-03-10T16:25:00Z" },
  { id: "b", name: "2 Bid Packages", parent_folder_id: null, created_at: "2026-03-14T12:03:00Z" },
  { id: "c", name: "Approved", parent_folder_id: "a" },
  { id: "d", name: "Rev 1", parent_folder_id: "c" },
  { id: "orphan", name: "Lost child", parent_folder_id: "deleted-parent" },
  { id: "self", name: "Loop", parent_folder_id: "self" },
];

afterEach(() => vi.useRealTimers());

describe("folder tree index", () => {
  it("lists children in natural name order and keeps orphans and self-parents at the root", () => {
    const index = indexFolderChildren(folders);
    expect(childFolders(index, null).map((f) => f.id)).toEqual(["b", "a", "self", "orphan"]);
    expect(childFolders(index, "a").map((f) => f.id)).toEqual(["c"]);
    expect(childFolders(index, "d")).toEqual([]);
  });

  it("walks ancestors root-first and collects descendants", () => {
    expect(ancestorIds(folders, "d")).toEqual(["a", "c"]);
    expect(ancestorIds(folders, null)).toEqual([]);
    expect([...descendantIds(indexFolderChildren(folders), "a")].sort()).toEqual(["a", "c", "d"]);
  });

  it("counts documents directly in each folder, with root as ''", () => {
    const counts = directDocCounts([{ folder_id: "a" }, { folder_id: "a" }, { folder_id: null }, {}]);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("")).toBe(2);
  });

  it("matches folder names case-insensitively for search", () => {
    expect(searchFolders(folders, "rev").map((f) => f.id)).toEqual(["d"]);
    expect(searchFolders(folders, "  ")).toEqual([]);
  });
});

describe("sorting", () => {
  const docs: DocumentRecord[] = [
    { id: "1", displayName: "S-10.pdf", status: "Draft", fileSizeKb: 50, uploadedDate: "2026-03-01T00:00:00Z" },
    { id: "2", displayName: "S-2.pdf", status: "Approved", fileSizeKb: 500, uploadedDate: "2026-03-05T00:00:00Z" },
    { id: "3", displayName: "a-note.txt", status: null, fileSizeKb: null, created_at: null },
  ];

  it("sorts names naturally (S-2 before S-10) and reverses", () => {
    expect(sortDocuments(docs, "name", "asc").map((d) => d.id)).toEqual(["3", "2", "1"]);
    expect(sortDocuments(docs, "name", "desc").map((d) => d.id)).toEqual(["1", "2", "3"]);
  });

  it("sorts by created date with unknown dates oldest, and by size and status", () => {
    expect(sortDocuments(docs, "created", "desc").map((d) => d.id)).toEqual(["2", "1", "3"]);
    expect(sortDocuments(docs, "size", "desc").map((d) => d.id)).toEqual(["2", "1", "3"]);
    expect(sortDocuments(docs, "status", "asc").map((d) => d.id)).toEqual(["3", "2", "1"]);
  });

  it("does not mutate its input", () => {
    const copy = [...docs];
    sortDocuments(docs, "size", "asc");
    expect(docs).toEqual(copy);
  });

  it("keeps folders by name for status/size sorts and honours name/date sorts", () => {
    const top = folders.slice(0, 2);
    expect(sortFolders(top, "status", "desc").map((f) => f.id)).toEqual(["b", "a"]);
    expect(sortFolders(top, "name", "desc").map((f) => f.id)).toEqual(["a", "b"]);
    expect(sortFolders(top, "created", "desc").map((f) => f.id)).toEqual(["b", "a"]);
  });
});

describe("quick views", () => {
  it("finds this week's uploads and documents needing review across folders", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00"));
    const docs = [
      { id: "new", uploadedDate: "2026-10-17T09:00:00", folder_id: "a" },
      { id: "old", uploadedDate: "2026-09-01T09:00:00", status: " under review " },
      { id: "rr", status: "Revise & Resubmit" },
      { id: "none" },
    ];
    expect(quickViewDocs(docs, "recent").map((d) => d.id)).toEqual(["new"]);
    expect(quickViewDocs(docs, "review").map((d) => d.id)).toEqual(["old", "rr"]);
    expect(isNeedsReview({ status: "Approved" })).toBe(false);
  });
});

describe("formatCreatedOn", () => {
  it("formats as MM/DD/YYYY at hh:mm AM and never invents a date", () => {
    expect(formatCreatedOn("2026-03-14T05:03:00")).toBe("03/14/2026 at 05:03 AM");
    expect(formatCreatedOn(null)).toBe("—");
    expect(formatCreatedOn("not a date")).toBe("—");
  });
});

describe("restorePatch", () => {
  it("restores in place when the folder is live, and to the root when it is not", () => {
    expect(restorePatch({ folder_id: "a" }, folders)).toEqual({ patch: { is_deleted: false, deleted_at: null }, folderGone: false });
    expect(restorePatch({ folder_id: "gone" }, folders)).toEqual({ patch: { is_deleted: false, deleted_at: null, folder_id: null }, folderGone: true });
    expect(restorePatch({ folder_id: null }, folders).folderGone).toBe(false);
  });
});
