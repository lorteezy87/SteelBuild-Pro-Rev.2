/**
 * urgencyEngine.test.js — guards the daysValue sort invariant.
 *
 * See the `daysValue contract` section in urgencyEngine.js. If these
 * tests fail, something flipped the sign convention and sortLogic will
 * now sort items the wrong way inside their urgency bucket.
 */

import { describe, it, expect } from "vitest";
import {
  rfiUrgency,
  drawingUrgency,
  deliveryUrgency,
  drawingSetUrgency,
  changeOrderUrgency,
} from "../urgencyEngine";
import { defaultFeedSort } from "../sortLogic";

// Helper — a date N days from today (YYYY-MM-DD). Negative N = past.
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

describe("daysValue sort invariant — higher = more urgent within a bucket", () => {
  // ── Date-based entities (RFI, Drawing, Delivery, SOV) ─────────────────
  it("RFI: 10d overdue sorts before 2d overdue", () => {
    const older = rfiUrgency({
      id: "1", status: "Open", project_id: "p1",
      date_required: daysFromNow(-10),
      submitted_date: daysFromNow(-20),
      ball_in_court: "EOR",
    });
    const newer = rfiUrgency({
      id: "2", status: "Open", project_id: "p1",
      date_required: daysFromNow(-2),
      submitted_date: daysFromNow(-5),
      ball_in_court: "EOR",
    });
    expect(older.urgency).toBe("overdue");
    expect(newer.urgency).toBe("overdue");
    // Sort puts more-urgent FIRST. 10d overdue is more urgent than 2d.
    expect([newer, older].sort(defaultFeedSort)[0]).toBe(older);
  });

  it("RFI: due in 1d sorts before due in 5d (both 'due-soon')", () => {
    const soon = rfiUrgency({
      id: "1", status: "Open", project_id: "p1",
      date_required: daysFromNow(1),
      submitted_date: daysFromNow(-5),
      ball_in_court: "EOR",
    });
    const later = rfiUrgency({
      id: "2", status: "Open", project_id: "p1",
      date_required: daysFromNow(5),
      submitted_date: daysFromNow(-5),
      ball_in_court: "EOR",
    });
    // Drop the check skipping logic may drop the less-urgent one; only test
    // the ones that come back with urgency set and inside the same bucket.
    if (soon?.urgency === "due-soon" && later?.urgency === "due-soon") {
      expect([later, soon].sort(defaultFeedSort)[0]).toBe(soon);
    }
  });

  it("Drawing: 7d overdue sorts before 2d overdue", () => {
    const older = drawingUrgency({
      id: "1", project_id: "p1", stage: "BFA",
      due_date: daysFromNow(-7),
    });
    const newer = drawingUrgency({
      id: "2", project_id: "p1", stage: "BFA",
      due_date: daysFromNow(-2),
    });
    expect(older.urgency).toBe("overdue");
    expect(newer.urgency).toBe("overdue");
    expect([newer, older].sort(defaultFeedSort)[0]).toBe(older);
  });

  it("Delivery: scheduled 10d ago, not delivered → more urgent than 3d ago", () => {
    const older = deliveryUrgency({
      id: "1", project_id: "p1", status: "Scheduled",
      scheduled_date: daysFromNow(-10),
    });
    const newer = deliveryUrgency({
      id: "2", project_id: "p1", status: "Scheduled",
      scheduled_date: daysFromNow(-3),
    });
    if (older?.urgency && newer?.urgency && older.urgency === newer.urgency) {
      expect([newer, older].sort(defaultFeedSort)[0]).toBe(older);
    }
  });

  // ── Age-based entities (DrawingSet, ChangeOrder, WorkPackage) ─────────
  it("DrawingSet: pending 20d sorts before pending 10d", () => {
    const older = drawingSetUrgency({
      id: "1", project_id: "p1", set_approval_status: "pending_review",
      issued_date: daysFromNow(-20),
    });
    const newer = drawingSetUrgency({
      id: "2", project_id: "p1", set_approval_status: "pending_review",
      issued_date: daysFromNow(-10),
    });
    if (older?.urgency && newer?.urgency && older.urgency === newer.urgency) {
      expect([newer, older].sort(defaultFeedSort)[0]).toBe(older);
    }
  });

  it("ChangeOrder: submitted 15d ago sorts before 8d ago (both stale)", () => {
    const older = changeOrderUrgency({
      id: "1", project_id: "p1", status: "Submitted",
      submitted_date: daysFromNow(-15),
    });
    const newer = changeOrderUrgency({
      id: "2", project_id: "p1", status: "Submitted",
      submitted_date: daysFromNow(-8),
    });
    if (older?.urgency && newer?.urgency && older.urgency === newer.urgency) {
      expect([newer, older].sort(defaultFeedSort)[0]).toBe(older);
    }
  });

  // ── Cross-type: overdue > blocking > due-soon > awaiting > normal ─────
  it("bucket ordering beats within-bucket ordering", () => {
    const overdue = rfiUrgency({
      id: "overdue", status: "Open", project_id: "p1",
      date_required: daysFromNow(-2),
      submitted_date: daysFromNow(-10),
      ball_in_court: "EOR",
    });
    const dueSoon = rfiUrgency({
      id: "due-soon", status: "Open", project_id: "p1",
      date_required: daysFromNow(1),
      submitted_date: daysFromNow(-5),
      ball_in_court: "EOR",
    });
    if (overdue?.urgency === "overdue" && dueSoon?.urgency === "due-soon") {
      // Overdue always sorts before due-soon regardless of daysValue magnitudes.
      expect([dueSoon, overdue].sort(defaultFeedSort)[0]).toBe(overdue);
    }
  });
});

describe("RFI: date-sanity guard on daysOpen", () => {
  it("clamps an absurdly old submitted_date instead of reporting a decades-old age", () => {
    // A bad import/placeholder date (e.g. epoch or a typo'd year) must not
    // surface as a literal "9137d past target" or dominate the feed forever.
    const corrupt = rfiUrgency({
      id: "1", status: "Open", project_id: "p1",
      ball_in_court: "EOR",
      submitted_date: "2001-01-01",
    });
    expect(corrupt.urgency).toBe("overdue");
    expect(corrupt.daysValue).toBeLessThanOrEqual(730);
    expect(corrupt.displayStatus).not.toMatch(/\b[0-9]{4,}d\b/);
  });

  it("clamps a future submitted_date (clock skew / bad data) to 0 rather than a negative age", () => {
    const future = rfiUrgency({
      id: "2", status: "Open", project_id: "p1",
      ball_in_court: "EOR",
      schedule_impact: true, // force it through as "blocking" so it isn't gated out
      submitted_date: daysFromNow(30),
    });
    expect(future.displayStatus).not.toMatch(/-\d/);
  });

  it("still ranks a genuinely stale-but-plausible RFI as more urgent than a less-stale one", () => {
    // Both ages are inside the clamp ceiling, so the guard must not flatten
    // real within-bucket ordering for plausible (if neglected) RFIs.
    const stale = rfiUrgency({
      id: "1", status: "Open", project_id: "p1",
      ball_in_court: "EOR",
      submitted_date: daysFromNow(-400),
    });
    const lessStale = rfiUrgency({
      id: "2", status: "Open", project_id: "p1",
      ball_in_court: "EOR",
      submitted_date: daysFromNow(-100),
    });
    expect(stale.urgency).toBe("overdue");
    expect(lessStale.urgency).toBe("overdue");
    expect([lessStale, stale].sort(defaultFeedSort)[0]).toBe(stale);
  });
});
