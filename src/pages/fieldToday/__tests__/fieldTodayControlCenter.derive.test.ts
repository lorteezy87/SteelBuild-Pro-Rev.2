import { describe, it, expect } from "vitest";
import {
  buildFieldTodaySummary,
  deriveFieldTaskPhase,
  filterFieldTaskRows,
  formatFieldDay,
  isoDatePlusDays,
  ScheduleTaskRecord,
  PhotoRecord,
  PunchlistItemRecord,
} from "../fieldTodayControlCenter.derive";

const TODAY = "2026-09-08";
const isoOffset = (days: number): string => isoDatePlusDays(TODAY, days);

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
    it("counts only due-today and active-window work as today's tasks", () => {
      expect(s.kpis.todaysTasks).toBe(2);
      expect(s.planQueue.map((t) => t.id)).toEqual(["t2", "t3"]);
      expect(s.tableRows.map((r) => r.id)).toEqual(["t2", "t3"]);
    });

    it("exposes overdue work through a separate recovery queue", () => {
      expect(s.kpis.recoveryTasks).toBe(1);
      expect(s.recoveryQueue.map((t) => t.id)).toEqual(["t1"]);
    });

    it("keeps every recovery row visible when the backlog exceeds six", () => {
      const recovery = Array.from({ length: 7 }, (_, index) => ({
        id: `recovery-${index}`,
        task_name: `Recovery ${index}`,
        start_date: isoOffset(-10),
        end_date: isoOffset(-1),
        percent_complete: 0,
      }));
      const backlog = buildFieldTodaySummary(recovery, [], [], TODAY, 0);
      expect(backlog.kpis.recoveryTasks).toBe(7);
      expect(backlog.recoveryQueue).toHaveLength(7);
    });

    it("does not fabricate completed-today evidence", () => {
      expect(s.kpis.completedToday).toBeNull();
    });

    it("openPunchItems excludes Closed/Resolved punches", () => {
      // pu1 (Open) + pu2 (In Progress) = 2 open; pu3 (Closed) + pu4 (Resolved) excluded
      expect(s.kpis.openPunchItems).toBe(2);
    });

    it("openPunchItems uses the canonical punchlist closed set (Done/Completed/Complete are closed too)", () => {
      const terminal = ["Closed", "Complete", "Completed", "Done", "Resolved"].map((status, i) => ({
        id: `term-${i}`, status, priority: "Low", title: `Punch ${i}`,
      }));
      const live = [
        { id: "open", status: "Open", priority: "Low", title: "Open punch" },
        { id: "held", status: "On Hold", priority: "Low", title: "Held punch" },
        { id: "deferred", status: "Deferred", priority: "Low", title: "Deferred punch" },
      ];
      const r = buildFieldTodaySummary([], [], [...terminal, ...live], TODAY, 0);
      expect(r.kpis.openPunchItems).toBe(3);
      expect(r.openPunchRows.map((row) => row.status)).toEqual(["Open", "On Hold", "Deferred"]);
    });

    it("photosToday counts only photos taken on todayIso", () => {
      // p1 + p2 are TODAY; p3 is yesterday
      expect(s.kpis.photosToday).toBe(2);
    });
  });

  describe("todayProgressPct", () => {
    it("is between 0 and 100", () => {
      expect(s.todayProgressPct).toBeGreaterThanOrEqual(0);
      expect(s.todayProgressPct).toBeLessThanOrEqual(100);
    });
    it("reports average progress for today's plan", () => {
      expect(s.todayProgressPct).toBe(38);
    });
    it("counts near upcoming work without including the far future", () => {
      const withLookahead = buildFieldTodaySummary(
        [...tasks, { id: "t7", task_name: "Near future", start_date: isoOffset(5), end_date: isoOffset(7) }],
        photos,
        punches,
        TODAY,
        0,
      );
      expect(withLookahead.upcomingCount).toBe(1);
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
      expect(s.planRows.map((row) => row.id)).toEqual(s.planQueue.map((task) => task.id));
    });
    it("keeps recovery work out of the plan queue", () => {
      expect(s.planQueue.some((task) => task.id === "t1")).toBe(false);
      expect(s.recoveryRows.map((row) => row.id)).toEqual(["t1"]);
    });
  });

  describe("tableRows", () => {
    it("has a row per task in todaysWork", () => {
      expect(s.tableRows.length).toBe(s.kpis.todaysTasks);
    });
    it("row.status maps percent correctly", () => {
      const t2row = s.tableRows.find((r) => r.id === "t2");
      expect(t2row?.status).toBe("In Progress"); // 50%
    });
    it("keeps recovery rows out of today's table", () => {
      expect(s.tableRows.some((r) => r.id === "t1")).toBe(false);
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
      expect(empty.kpis.recoveryTasks).toBe(0);
      expect(empty.kpis.openPunchItems).toBe(0);
      expect(empty.kpis.photosToday).toBe(0);
      expect(empty.todayProgressPct).toBe(0);
      expect(empty.tableRows).toHaveLength(0);
      expect(empty.openPunchRows).toHaveLength(0);
      expect(empty.photoThumbnails).toHaveLength(0);
    });
  });

  describe("typed view models", () => {
    it("preserves stored phases and marks inferred phases honestly", () => {
      expect(deriveFieldTaskPhase({ task_name: "Set columns", phase: "Installation" }))
        .toEqual({ phase: "Erection", phaseSource: "stored" });
      expect(deriveFieldTaskPhase({ task_name: "Detail connection plates" }))
        .toEqual({ phase: "Detailing", phaseSource: "derived" });
    });

    it("filters rows across status and searchable field text", () => {
      expect(filterFieldTaskRows(s.tableRows, "crew", "all")).toEqual([]);
      expect(filterFieldTaskRows(s.tableRows, "column", "due-today").map((row) => row.id))
        .toEqual(["t2"]);
      expect(filterFieldTaskRows(s.tableRows, "", "active").map((row) => row.id))
        .toEqual(["t3"]);
    });

    it("uses deterministic fallback ids for records without database ids", () => {
      const first = buildFieldTodaySummary(
        [{ task_name: "Unnamed id task", start_date: TODAY, end_date: TODAY }],
        [{ taken_date: TODAY }],
        [{ status: "Open" }],
        TODAY,
        0,
      );
      const second = buildFieldTodaySummary(
        [{ task_name: "Unnamed id task", start_date: TODAY, end_date: TODAY }],
        [{ taken_date: TODAY }],
        [{ status: "Open" }],
        TODAY,
        0,
      );
      expect(first.tableRows[0].id).toBe("task-0");
      expect(first.photoThumbnails[0].id).toBe("photo-0");
      expect(first.openPunchRows[0].id).toBe("punch-0");
      expect(second).toEqual(first);
    });
  });
});

describe("Field Today local-day semantics", () => {
  const TOKYO_OFFSET_MINUTES = -540;

  function oldLocalRoundTrip(iso: string, days: number, offsetMinutes: number): string {
    const [year, month, date] = iso.split("-").map(Number);
    return new Date(
      Date.UTC(year, month - 1, date + days) + offsetMinutes * 60_000,
    ).toISOString().slice(0, 10);
  }

  it("keeps a local day token stable where local-midnight UTC serialization shifted it", () => {
    expect(oldLocalRoundTrip("2026-09-08", 7, TOKYO_OFFSET_MINUTES)).toBe("2026-09-14");
    expect(isoDatePlusDays("2026-09-08", 7)).toBe("2026-09-15");
  });

  it("formats the entered calendar day independently of the runner timezone", () => {
    expect(formatFieldDay("2026-09-08T00:00:00Z")).toBe("Sep 8");
    expect(formatFieldDay("2026-02-31")).toBe("TBD");
  });
});
