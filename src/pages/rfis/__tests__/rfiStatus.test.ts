import { describe, expect, it } from "vitest";
import {
  RFI_STATUSES,
  rfiAccentColor,
  rfiStatusColor,
  rfiStatusShortLabel,
  rfiStatusView,
} from "../rfiStatus";
import { RFI_CLOSED_STATUSES } from "@/lib/entityPredicates";

describe("rfiStatusView — one answer per status", () => {
  it("covers every status the database CHECK constraint allows", () => {
    expect([...RFI_STATUSES]).toEqual([
      "Open",
      "Under Review",
      "Incomplete Response",
      "Answered",
      "Closed",
      "Void",
    ]);
  });

  it("agrees with the canonical closed predicate for every status", () => {
    for (const status of RFI_STATUSES) {
      expect(rfiStatusView(status).isClosed).toBe(RFI_CLOSED_STATUSES.has(status));
    }
  });

  it("gives each status a DISTINCT colour — the bug was all of them rendering grey", () => {
    const colors = RFI_STATUSES.map((s) => rfiStatusColor(s));
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("never resolves Void to Open's palette", () => {
    // STATUS_CFG[status] || STATUS_CFG.Open used to paint a voided RFI amber.
    expect(rfiStatusView("Void").color).not.toBe(rfiStatusView("Open").color);
    expect(rfiStatusView("Void").shortLabel).toBe("VOID");
    expect(rfiStatusView("Void").isClosed).toBe(true);
  });

  it("never resolves Void to Answered's success palette either", () => {
    expect(rfiStatusView("Void").color).not.toBe(rfiStatusView("Answered").color);
  });

  it("keeps short labels inside the narrow status column", () => {
    for (const status of RFI_STATUSES) {
      expect(rfiStatusShortLabel(status).length).toBeLessThanOrEqual(10);
    }
  });

  it("fails OPEN for an unrecognised status so it cannot be silently hidden", () => {
    const view = rfiStatusView("Escalated to Legal");
    expect(view.isClosed).toBe(false);
    expect(view.lifecycle).toBe("open");
    expect(view.shortLabel).toBe("UNKNOWN");
  });

  it("treats null / empty status as open", () => {
    expect(rfiStatusView(null).lifecycle).toBe("open");
    expect(rfiStatusView("").lifecycle).toBe("open");
    expect(rfiStatusView(undefined).lifecycle).toBe("open");
  });
});

describe("rfiAccentColor — the register's left edge", () => {
  it("gives closed RFIs no accent at all, whatever their priority or lateness", () => {
    for (const status of ["Answered", "Closed", "Void"]) {
      expect(rfiAccentColor({ status, priority: "Critical" }, true)).toBeNull();
      expect(rfiAccentColor({ status, priority: "Low" }, false)).toBeNull();
    }
  });

  it("ranks overdue above critical above status for open RFIs", () => {
    const overdueCritical = rfiAccentColor({ status: "Open", priority: "Critical" }, true);
    const critical = rfiAccentColor({ status: "Open", priority: "Critical" }, false);
    const plain = rfiAccentColor({ status: "Open", priority: "Low" }, false);

    expect(overdueCritical).toBe("var(--status-error)");
    expect(critical).toBe("var(--status-review)");
    expect(plain).toBe(rfiStatusColor("Open"));
    expect(new Set([overdueCritical, critical, plain]).size).toBe(3);
  });

  it("accents an open RFI by its own status when nothing is urgent", () => {
    expect(rfiAccentColor({ status: "Under Review" }, false)).toBe(rfiStatusColor("Under Review"));
    expect(rfiAccentColor({ status: "Incomplete Response" }, false)).toBe(
      rfiStatusColor("Incomplete Response"),
    );
  });
});
