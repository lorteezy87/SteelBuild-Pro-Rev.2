/**
 * Unit tests for actionItemsControlCenter.derive.ts
 *
 * Pattern mirrors the RFI derive tests in this repo.
 * Uses local-date helpers so tests aren't TZ-sensitive.
 */
import { describe, it, expect } from "vitest";
import {
  buildActionItemsSummary,
  isOverdue,
  type ActionItemRecord,
} from "../actionItemsControlCenter.derive";

// Local-date helpers for deterministic YYYY-MM-DD strings.
const daysAgo = (n: number): string => {
  const d = new Date(Date.now() - n * 86400000);
  return d.toLocaleDateString("sv-SE"); // "YYYY-MM-DD" in all locales
};
const daysAhead = (n: number): string => {
  const d = new Date(Date.now() + n * 86400000);
  return d.toLocaleDateString("sv-SE");
};

function makeItem(
  overrides: Partial<ActionItemRecord> = {}
): ActionItemRecord {
  return {
    id: overrides.id ?? "item-1",
    title: overrides.title ?? "Test item",
    description: null,
    status: overrides.status ?? "Open",
    priority: overrides.priority ?? "Medium",
    assigned_to: overrides.assigned_to ?? null,
    due_date: overrides.due_date ?? null,
    category: overrides.category ?? null,
    project_area: null,
    constraint_type: null,
    meeting_reference: null,
    project_id: "proj-1",
    project_name: "Test Project",
    metadata: null,
    ...overrides,
  };
}

// ─── isOverdue ────────────────────────────────────────────────────────────────

describe("isOverdue", () => {
  it("returns false for completed items even when past due", () => {
    const item = makeItem({ status: "Complete", due_date: daysAgo(5) });
    expect(isOverdue(item)).toBe(false);
  });

  it("returns false for items with no due date", () => {
    const item = makeItem({ status: "Open", due_date: null });
    expect(isOverdue(item)).toBe(false);
  });

  it("returns true for open items past their due date", () => {
    const item = makeItem({ status: "Open", due_date: daysAgo(1) });
    expect(isOverdue(item)).toBe(true);
  });

  it("returns false for open items due in the future", () => {
    const item = makeItem({ status: "Open", due_date: daysAhead(3) });
    expect(isOverdue(item)).toBe(false);
  });

  it("returns true for In Progress items past their due date", () => {
    const item = makeItem({ status: "In Progress", due_date: daysAgo(2) });
    expect(isOverdue(item)).toBe(true);
  });

  it("returns false for cancelled items even when past due", () => {
    const item = makeItem({ status: "Cancelled", due_date: daysAgo(3) });
    expect(isOverdue(item)).toBe(false);
  });
});

// ─── buildActionItemsSummary ──────────────────────────────────────────────────

describe("buildActionItemsSummary", () => {
  it("handles empty input gracefully", () => {
    const s = buildActionItemsSummary([]);
    expect(s.total).toBe(0);
    expect(s.open).toBe(0);
    expect(s.overdue).toBe(0);
    expect(s.dueToday).toBe(0);
    expect(s.critical).toBe(0);
    expect(s.completed).toBe(0);
    expect(s.completionPct).toBe(0);
    expect(s.todayQueue).toHaveLength(0);
    expect(s.waitingQueue).toHaveLength(0);
    expect(s.byOwner).toHaveLength(0);
  });

  it("correctly counts open, completed, and cancelled", () => {
    const rows = [
      makeItem({ id: "1", status: "Open" }),
      makeItem({ id: "2", status: "In Progress" }),
      makeItem({ id: "3", status: "Complete" }),
      makeItem({ id: "4", status: "Cancelled" }),
    ];
    const s = buildActionItemsSummary(rows);
    expect(s.total).toBe(4);
    expect(s.open).toBe(1);
    expect(s.active).toBe(2); // Open + In Progress
    expect(s.completed).toBe(1);
  });

  it("counts overdue correctly", () => {
    const rows = [
      makeItem({ id: "1", status: "Open", due_date: daysAgo(3) }),
      makeItem({ id: "2", status: "Open", due_date: daysAhead(2) }),
      makeItem({ id: "3", status: "Complete", due_date: daysAgo(1) }), // complete, not counted
    ];
    const s = buildActionItemsSummary(rows);
    expect(s.overdue).toBe(1);
  });

  it("counts dueToday correctly", () => {
    const rows = [
      makeItem({ id: "1", status: "Open", due_date: daysAhead(0) }),
      makeItem({ id: "2", status: "Open", due_date: daysAhead(1) }),
    ];
    const s = buildActionItemsSummary(rows);
    expect(s.dueToday).toBe(1);
  });

  it("counts critical among active items only", () => {
    const rows = [
      makeItem({ id: "1", status: "Open", priority: "Critical" }),
      makeItem({ id: "2", status: "Complete", priority: "Critical" }), // not active
    ];
    const s = buildActionItemsSummary(rows);
    expect(s.critical).toBe(1);
  });

  it("completionPct rounds correctly", () => {
    const rows = [
      makeItem({ id: "1", status: "Complete" }),
      makeItem({ id: "2", status: "Complete" }),
      makeItem({ id: "3", status: "Open" }),
    ];
    const s = buildActionItemsSummary(rows);
    expect(s.completionPct).toBe(67); // Math.round(2/3 * 100) = 67
  });

  it("excludes SETUP items from KPIs", () => {
    const rows = [
      makeItem({ id: "1", status: "Open", category: "SETUP" }),
      makeItem({ id: "2", status: "Open", category: null }),
    ];
    const s = buildActionItemsSummary(rows);
    expect(s.total).toBe(1);
    expect(s.open).toBe(1);
  });

  it("ranks Critical items first in todayQueue", () => {
    const rows = [
      makeItem({ id: "1", status: "Open", priority: "Medium" }),
      makeItem({ id: "2", status: "Open", priority: "Critical" }),
      makeItem({ id: "3", status: "Open", priority: "High" }),
    ];
    const s = buildActionItemsSummary(rows);
    expect(s.todayQueue[0].id).toBe("2");
    expect(s.todayQueue[1].id).toBe("3");
  });

  it("todayQueue caps at 6 items", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: `item-${i}`, status: "Open" })
    );
    const s = buildActionItemsSummary(rows);
    expect(s.todayQueue.length).toBeLessThanOrEqual(6);
  });

  it("waitingQueue includes overdue items", () => {
    const rows = [
      makeItem({ id: "1", status: "Open", due_date: daysAgo(5), assigned_to: "Alice" }),
      makeItem({ id: "2", status: "Open", due_date: daysAhead(5), assigned_to: "Bob" }),
    ];
    const s = buildActionItemsSummary(rows);
    const ids = s.waitingQueue.map((r) => r.id);
    expect(ids).toContain("1");
    expect(ids).not.toContain("2");
  });

  it("waitingQueue includes items with no assigned_to", () => {
    const rows = [
      makeItem({ id: "1", status: "Open", assigned_to: null }),
      makeItem({ id: "2", status: "Open", assigned_to: "Bob" }),
    ];
    const s = buildActionItemsSummary(rows);
    const ids = s.waitingQueue.map((r) => r.id);
    expect(ids).toContain("1");
  });

  it("byOwner groups correctly and sorts by count descending", () => {
    const rows = [
      makeItem({ id: "1", status: "Open", assigned_to: "Alice" }),
      makeItem({ id: "2", status: "Open", assigned_to: "Alice" }),
      makeItem({ id: "3", status: "Open", assigned_to: "Bob" }),
    ];
    const s = buildActionItemsSummary(rows);
    expect(s.byOwner[0].owner).toBe("Alice");
    expect(s.byOwner[0].count).toBe(2);
    expect(s.byOwner[1].owner).toBe("Bob");
  });

  it("byOwner labels unassigned items as 'Unassigned'", () => {
    const rows = [makeItem({ id: "1", status: "Open", assigned_to: null })];
    const s = buildActionItemsSummary(rows);
    expect(s.byOwner[0].owner).toBe("Unassigned");
  });

  it("byOwner counts overdueCount correctly", () => {
    const rows = [
      makeItem({ id: "1", status: "Open", assigned_to: "Alice", due_date: daysAgo(2) }),
      makeItem({ id: "2", status: "Open", assigned_to: "Alice", due_date: daysAhead(3) }),
    ];
    const s = buildActionItemsSummary(rows);
    const alice = s.byOwner.find((o) => o.owner === "Alice");
    expect(alice?.overdueCount).toBe(1);
  });

  it("null due_date items are NOT overdue", () => {
    const item = makeItem({ status: "Open", due_date: null });
    expect(isOverdue(item)).toBe(false);
    const s = buildActionItemsSummary([item]);
    expect(s.overdue).toBe(0);
  });
});
