import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ items: vi.fn(), headers: vi.fn() }));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    DrawingTransmittalItem: { filterAll: reads.items },
    DrawingTransmittal: { filter: reads.headers },
  },
}));

import { fetchLastSheetTransmittal } from "../sheetTransmittalEvidence";

const item = (index: number, overrides: Record<string, unknown> = {}) => ({
  id: `item-${index}`,
  project_id: "project-1",
  drawing_id: "shop-sheet-1",
  gc_drawing_id: null as string | null,
  drawing_revision_id: "revision-current",
  transmittal_id: `transmittal-${index}`,
  ...overrides,
});
const header = (index: number, overrides: Record<string, unknown> = {}) => ({
  id: `transmittal-${index}`,
  project_id: "project-1",
  transmittal_number: `T-${index}`,
  direction: "outgoing",
  status: "sent",
  date_sent: "2026-09-01",
  date_received: null as string | null,
  created_at: "2026-09-01T10:00:00Z",
  is_deleted: false,
  deleted_at: null as string | null,
  ...overrides,
});

beforeEach(() => {
  reads.items.mockReset();
  reads.headers.mockReset();
  reads.items.mockResolvedValue([]);
  reads.headers.mockResolvedValue([]);
});

describe("selected shop sheet transmittal evidence", () => {
  it("queries exact project and shop drawing ID with the paged item read, even beyond 1,000 items", async () => {
    const items = Array.from({ length: 1_205 }, (_, index) => item(index));
    reads.items.mockResolvedValue(items);
    reads.headers.mockImplementation(async (conditions: { id: string[] }) =>
      conditions.id.map((id) => header(Number(id.replace("transmittal-", "")), {
        date_sent: id === "transmittal-1204" ? "2026-10-07" : "2026-09-01",
      })));

    const result = await fetchLastSheetTransmittal("project-1", "shop-sheet-1", "revision-current");

    expect(reads.items).toHaveBeenCalledWith({ project_id: "project-1", drawing_id: "shop-sheet-1" }, "id");
    expect(reads.headers.mock.calls.length).toBeGreaterThan(10);
    expect(reads.headers.mock.calls.every(([conditions]) => conditions.project_id === "project-1" && conditions.id.length <= 100)).toBe(true);
    expect(result).toMatchObject({ kind: "found", id: "transmittal-1204", number: "T-1204", revision: "current" });
  });

  it("ignores void and deleted headers while retaining a visible draft as a draft", async () => {
    reads.items.mockResolvedValue([item(1), item(2), item(3), item(4)]);
    reads.headers.mockImplementation(async (conditions: { id: string[] }) => conditions.id.map((id) => {
      const n = Number(id.replace("transmittal-", ""));
      return header(n, n === 4 ? { status: "void", date_sent: "2026-12-01" }
        : n === 3 ? { is_deleted: true, date_sent: "2026-11-01" }
          : n === 2 ? { deleted_at: "2026-10-01T00:00:00Z", date_sent: "2026-10-01" }
            : { status: "draft", date_sent: null });
    }));

    expect(await fetchLastSheetTransmittal("project-1", "shop-sheet-1", "revision-current"))
      .toMatchObject({ kind: "found", id: "transmittal-1", lifecycle: "Draft · not issued", date: null });
  });

  it("fails closed when an attachment's header is missing or belongs to another project", async () => {
    reads.items.mockResolvedValue([item(1), item(2)]);
    reads.headers.mockResolvedValue([header(1)]);
    await expect(fetchLastSheetTransmittal("project-1", "shop-sheet-1", "revision-current"))
      .rejects.toThrow(/header.*missing/i);

    reads.headers.mockResolvedValue([header(1), header(2, { project_id: "other-project" })]);
    await expect(fetchLastSheetTransmittal("project-1", "shop-sheet-1", "revision-current"))
      .rejects.toThrow(/project/i);
  });

  it("distinguishes a different carried revision from an attachment with no revision", async () => {
    reads.items.mockResolvedValue([item(1, { drawing_revision_id: "revision-prior" })]);
    reads.headers.mockResolvedValue([header(1)]);
    expect(await fetchLastSheetTransmittal("project-1", "shop-sheet-1", "revision-current"))
      .toMatchObject({ kind: "found", revision: "different" });

    reads.items.mockResolvedValue([item(1, { drawing_revision_id: null })]);
    expect(await fetchLastSheetTransmittal("project-1", "shop-sheet-1", "revision-current"))
      .toMatchObject({ kind: "found", revision: "unknown" });
  });

  it("does not turn a GC attachment or a revision-only legacy label into a shop-sheet match", async () => {
    reads.items.mockResolvedValue([]);
    expect(await fetchLastSheetTransmittal("project-1", "shop-sheet-1", "revision-current"))
      .toEqual({ kind: "none" });
    expect(reads.headers).not.toHaveBeenCalled();
  });
});
