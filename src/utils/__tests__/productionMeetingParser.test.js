import { describe, it, expect } from "vitest";
import { parseProductionMeetingNotes } from "../productionMeetingParser";

// A fixed "now" so the relative-date logic is deterministic. Expected dates are
// derived with the SAME Date construction + toISOString the parser uses, so the
// assertions agree regardless of the machine's timezone (the parser's slice of
// toISOString is itself TZ-sensitive — mirroring it is the only stable check).
const NOW = new Date(2026, 0, 15); // Jan 15 2026, local

const isoFrom = (addDays) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + addDays);
  return d.toISOString().slice(0, 10);
};
const isoYMD = (y, m, d) => new Date(y, m - 1, d).toISOString().slice(0, 10);

const parse = (notes, opts = {}) => parseProductionMeetingNotes(notes, { now: NOW, ...opts });

describe("parseProductionMeetingNotes — input handling", () => {
  it("returns an empty array for empty / null / whitespace-only notes", () => {
    expect(parse("")).toEqual([]);
    expect(parse(null)).toEqual([]);
    expect(parse("   \n  \n\t")).toEqual([]);
  });

  it("keeps only actionable lines (drops chatter and inert statements)", () => {
    const items = parse("Welcome to the production meeting\nShop drawing rev C is current\nNeed to ship the load list");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Need to ship the load list");
  });

  it("strips list markers, quotes, and bullets before parsing", () => {
    expect(parse("1. Need to confirm crane access")[0].title).toBe("Need to confirm crane access");
    expect(parse("> - 2) Verify in field dims")[0].title).toBe("Verify in field dims");
  });

  it("indexes items as parsed-N in order", () => {
    const items = parse("Need to ship steel\nNeed to confirm crane access");
    expect(items.map((i) => i.id)).toEqual(["parsed-0", "parsed-1"]);
  });
});

describe("type classification (inferRule)", () => {
  const typeOf = (line) => parse(line)[0]?.metadata.task_type;
  const priorityOf = (line) => parse(line)[0]?.priority;

  it("classifies the core domains", () => {
    expect(typeOf("Need to ship the load list")).toBe("Delivery");
    expect(typeOf("Need to verify in field before fab")).toBe("VIF");
    expect(typeOf("Need a current revision of the shop drawing")).toBe("Shop Drawing");
    expect(typeOf("Need an RFI answer from the EOR")).toBe("RFI");
    expect(typeOf("Need to submit the change order for cost exposure")).toBe("Change Order");
    expect(typeOf("Need the crane and foreman on site")).toBe("Field");
    expect(typeOf("Need to release fab material")).toBe("Production");
  });

  it("falls back to a generic Task when no keyword matches", () => {
    const item = parse("Need to follow up on the thing")[0];
    expect(item.metadata.task_type).toBe("Task");
    expect(item.metadata.impact_area).toBe("Project");
    expect(item.priority).toBe("Normal");
  });

  it("uses first-match precedence (Delivery wins over Production)", () => {
    // 'ship' (Delivery, earlier rule) beats 'fabricate' (Production).
    expect(typeOf("Need to ship and fabricate the columns")).toBe("Delivery");
  });

  it("carries the rule's priority and impact area", () => {
    expect(priorityOf("Need to ship the load list")).toBe("Critical");
    expect(parse("Need to ship the load list")[0].metadata.impact_area).toBe("Shipping");
    expect(parse("Need to ship the load list")[0].metadata.estimated_duration_minutes).toBe(30);
    expect(parse("Need to submit the change order")[0].metadata.estimated_duration_minutes).toBe(45);
  });
});

describe("owner extraction (inferOwner)", () => {
  it("pulls initials after an owner cue and upper-cases them", () => {
    expect(parse("Need to confirm — owner: jd")[0].assigned_to).toBe("JD");
    expect(parse("Need to ship, assigned to AB")[0].assigned_to).toBe("AB");
  });

  it("defaults to empty string when no owner is named", () => {
    expect(parse("Need to confirm crane access")[0].assigned_to).toBe("");
  });

  it("does not mistake a date after 'by' for an owner", () => {
    expect(parse("Need to ship by 6/20")[0].assigned_to).toBe("");
  });
});

describe("due-date inference (inferDueDate)", () => {
  it("parses an explicit numeric date with a full year", () => {
    expect(parse("Confirm delivery 06/20/2026 to site")[0].due_date).toBe(isoYMD(2026, 6, 20));
  });

  it("expands a 2-digit year to 20xx", () => {
    expect(parse("Need to ship 7/4/26")[0].due_date).toBe(isoYMD(2026, 7, 4));
  });

  it("uses the current year when the date omits one", () => {
    // NOW is 2026 → "due 3/2" resolves to 2026-03-02.
    expect(parse("Need to release shop drawings due 3/2")[0].due_date).toBe(isoYMD(2026, 3, 2));
  });

  it("handles fuzzy relative phrases", () => {
    expect(parse("Need to confirm tomorrow")[0].due_date).toBe(isoFrom(1));
    expect(parse("Need to submit ASAP")[0].due_date).toBe(isoFrom(0));
    expect(parse("Need to verify next week")[0].due_date).toBe(isoFrom(7));
    expect(parse("Need to call in the next 48 hours")[0].due_date).toBe(isoFrom(2));
  });

  it("defaults to 3 days out when no date cue is present", () => {
    expect(parse("Need to coordinate manpower")[0].due_date).toBe(isoFrom(3));
  });
});

describe("title shaping", () => {
  it("collapses runs of whitespace", () => {
    expect(parse("Need   to    ship   steel")[0].title).toBe("Need to ship steel");
  });

  it("truncates a very long line to 96 chars with an ellipsis", () => {
    const long = "Need to " + "x".repeat(120);
    const title = parse(long)[0].title;
    expect(title.length).toBe(96);
    expect(title.endsWith("...")).toBe(true);
  });
});

describe("output shape + options", () => {
  it("emits a complete, review-flagged action item", () => {
    const item = parse("Need to ship the load list")[0];
    expect(item.status).toBe("Open");
    expect(item.meeting_reference).toBe("Production meeting parser");
    expect(item.metadata.created_from).toBe("production_meeting_parser");
    expect(item.metadata.source_line).toBe("Need to ship the load list");
    expect(item.description).toContain("Task Type: Delivery");
    expect(item.description).toContain("Review owner, due date, and linked records");
  });

  it("threads a custom source label into the reference + description", () => {
    const item = parse("Need to ship steel", { source: "Tue standup" })[0];
    expect(item.meeting_reference).toBe("Tue standup");
    expect(item.description).toContain("Generated from Tue standup");
  });
});
