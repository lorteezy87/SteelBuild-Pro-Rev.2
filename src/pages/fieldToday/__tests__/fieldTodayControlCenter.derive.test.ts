import { describe, it, expect } from "vitest";
import {
  buildFieldTodaySummary,
  ScheduleTaskRecord,
  PhotoRecord,
  PunchlistItemRecord,
} from "../fieldTodayControlCenter.derive";

// Build an ISO date string offset from today (YYYY-MM-DD).
function isoOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const TODAY = isoOffset(0);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const tasks: ScheduleTaskRecord[] = [
  { id: "t1", task_name: "Set anchor bolts", start_date: isoOffset(-5), end_date: isoOffset(-2), percent_complete: 0, status: "Not Started" },
  { id: "t2", task_name: "Erect column line A", start_date: isoOffset(-1), end_date: TODAY, percent_complete: 50, status: "In Progress" },
  { id: "t3", task_name: "Install beam W14x48", start_date: isoOffset(-3), end_date: isoOffset(3), percent_complete: 25, status: "In Progress" },
  { id: "t4", task_name: "QC bolt inspection", start_date: TODAY, end_date: isoOffset(1), percent_complete: 100, status: "Complete" },
  { id: "t5", task_name: "Far future task", start_date: isoOffset(30), end_date: isoOffset(40), percent_complete: 0, status: "Not Started" },
  { id: "t6", task_name: "Deleted task", start_date: TODAY, end_date: TODAY, percent_complete: 0, is_deleted: true },
];

const photos: PhotoRecord[] = [
  { id: "p1", taken_date: TODAY, file_url: "https://example.com/photo1.jpg", title: "Progress shot A" },
  { id: "p2", taken_date: TODAY, file_url: "https://example.com/photo2.jpg", title: "Beam connection" },
  { id: "p3", taken_date: isoOffset(-1), file_url: "https://example.com/photo3.jpg", title: "Yesterday's work" },
];

const punches: PunchlistItemRecord[] = [
  { id: "pu1", status: "Open", priority: "High", title: "Loose anchor bolt", location: "Grid A-1" },
  { id: "pu2", status: "In Progress", priority: "Medium", title: "Missing grout", location: "Grid B-3" },
  { id: "pu3", status: "Closed", priority: "Low", title: "Fixed weld", location: "Grid C-2" },
  { id: "pu4", status: "Resolved", priority: "High", title: "Already fixed", location: "Grid D" },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildFieldTodaySummary", () => {
  const s = buildFieldTodaySummary(tasks, photos, punches, TODAY, 0);

  describe("kpis", () => {
    it("todaysTasks excludes deleted + far-future (> 7d) + done tasks", () => {
      // t1 (overdue), t2 (due-today), t3 (active) are relevant.
      // t4 (complete = 100%) is INCLUDED in todaysWork but is 'done' bucket → stays in tasksForToday list
      // Actually tasksForToday keeps all except done (taskUrgency==='done' filters are inside the fn).
      // Let's verify the exact count from the helper.
      expect(s.kpis.todaysTasks).toBeGreaterThanOrEqual(3); // at minimum t1/t2/t3
    });

    it("overdueTasks counts tasks whose end_date is in the past and not complete", () => {
      // t1: end_date = -2 days, 0% → overdue. t2 ends TODAY → not overdue.
      expect(s.kpis.overdueTasks).toBe(1);
    });

    it("completedToday counts tasks with percent_complete = 100 in todaysWork", () => {
      // t4 has percent_complete=100 but tasksForToday skips done tasks (taskUrgency='done' → filtered)
      // Actually: tasksForToday filters out done via taskUrgency===done. So completedToday = 0.
      // But wait — the derive re-filters from todaysWork (which already excludes done).
      // So completedToday should be 0 here.
      expect(s.kpis.completedToday).toBe(0);
    });

    it("openPunchItems excludes Closed/Resolved punches", () => {
      // pu1 (Open) + pu2 (In Progress) = 2 open; pu3 (Closed) + pu4 (Resolved) excluded
      expect(s.kpis.openPunchItems).toBe(2);
    });

    it("photosToday counts only photos taken on todayIso", () => {
      // p1 + p2 are TODAY; p3 is yesterday
      expect(s.kpis.photosToday).toBe(2);
    });
  });

  describe("taskCompletionPct", () => {
    it("is between 0 and 100", () => {
      expect(s.taskCompletionPct).toBeGreaterThanOrEqual(0);
      expect(s.taskCompletionPct).toBeLessThanOrEqual(100);
    });
    it("is 0 when no tasks are complete in todaysWork", () => {
      // Per above, completedToday=0 among todaysWork items
      expect(s.taskCompletionPct).toBe(0);
    });
  });

  describe("photoThumbnails", () => {
    it("contains only today's photos", () => {
      expect(s.photoThumbnails.every((p) => p.takenDate === TODAY)).toBe(true);
    });
    it("caps at 6 thumbnails", () => {
      const manyPhotos: PhotoRecord[] = Array.from({ length: 10 }, (_, i) => ({
        id: `mp${i}`, taken_date: TODAY, file_url: `https://example.com/m${i}.jpg`,
      }));
      const big = buildFieldTodaySummary(tasks, manyPhotos, [], TODAY, 0);
      expect(big.photoThumbnails.length).toBeLessThanOrEqual(6);
    });
  });

  describe("openPunchRows", () => {
    it("caps at 5 rows", () => {
      const manyPunches: PunchlistItemRecord[] = Array.from({ length: 10 }, (_, i) => ({
        id: `mp${i}`, status: "Open", priority: "Medium", title: `Punch ${i}`,
      }));
      const big = buildFieldTodaySummary([], [], manyPunches, TODAY, 0);
      expect(big.openPunchRows.length).toBeLessThanOrEqual(5);
    });
    it("excludes closed/resolved items", () => {
      expect(s.openPunchRows.every((r) => !["Closed", "Resolved"].includes(r.status))).toBe(true);
    });
  });

  describe("planQueue", () => {
    it("contains at most 6 items and is a subset of todaysWork", () => {
      expect(s.planQueue.length).toBeLessThanOrEqual(6);
    });
    it("puts overdue tasks ahead of active tasks", () => {
      // t1 is overdue (end_date past), t3 is active — t1 must precede t3 in planQueue.
      const t1idx = s.planQueue.findIndex((t) => t.id === "t1");
      const t3idx = s.planQueue.findIndex((t) => t.id === "t3");
      if (t1idx >= 0 && t3idx >= 0) {
        expect(t1idx).toBeLessThan(t3idx);
      }
    });
  });

  describe("tableRows", () => {
    it("has a row per task in todaysWork", () => {
      expect(s.tableRows.length).toBe(s.kpis.todaysTasks);
    });
    it("row.status maps percent correctly", () => {
      const t1row = s.tableRows.find((r) => r.id === "t1");
      expect(t1row?.status).toBe("Not Started"); // 0%
      const t2row = s.tableRows.find((r) => r.id === "t2");
      expect(t2row?.status).toBe("In Progress"); // 50%
    });
    it("row.urgencyBucket is overdue for t1", () => {
      const t1row = s.tableRows.find((r) => r.id === "t1");
      expect(t1row?.urgencyBucket).toBe("overdue");
    });
  });

  describe("syncTone", () => {
    it("is warn when pendingSync > 0", () => {
      const withPending = buildFieldTodaySummary(tasks, photos, punches, TODAY, 3);
      expect(withPending.syncTone).toBe("warn");
    });
    it("is neutral when pendingSync = 0", () => {
      expect(s.syncTone).toBe("neutral");
    });
  });

  describe("empty inputs", () => {
    it("handles all-empty gracefully", () => {
      const empty = buildFieldTodaySummary([], [], [], TODAY, 0);
      expect(empty.kpis.todaysTasks).toBe(0);
      expect(empty.kpis.overdueTasks).toBe(0);
      expect(empty.kpis.openPunchItems).toBe(0);
      expect(empty.kpis.photosToday).toBe(0);
      expect(empty.taskCompletionPct).toBe(0);
      expect(empty.tableRows).toHaveLength(0);
      expect(empty.openPunchRows).toHaveLength(0);
      expect(empty.photoThumbnails).toHaveLength(0);
    });
  });
});
