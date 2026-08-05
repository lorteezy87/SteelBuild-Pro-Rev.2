import { describe, it, expect } from "vitest";
import {
  isOutboundStage,
  resolveWorkdayLead,
  decideWorkdayDue,
  DEFAULT_WORKDAY_LEADS,
} from "../submittalWorkdayDue";

describe("isOutboundStage", () => {
  it("is true only for OFA and OFS", () => {
    expect(isOutboundStage("OFA")).toBe(true);
    expect(isOutboundStage("OFS")).toBe(true);
  });
  it("is false for every other stage / empty", () => {
    for (const s of ["IFA", "BFA", "IFC", "Released", "", null, undefined]) {
      expect(isOutboundStage(s as string)).toBe(false);
    }
  });
});

describe("resolveWorkdayLead", () => {
  it("falls back to the defaults with no config", () => {
    expect(resolveWorkdayLead("OFA", null)).toBe(DEFAULT_WORKDAY_LEADS.OFA); // 10
    expect(resolveWorkdayLead("OFS", null)).toBe(DEFAULT_WORKDAY_LEADS.OFS); // 10
  });
  it("reads the project's approval lead for OFA and scrub lead for OFS", () => {
    const projectMeta = { detailing_lead_days: { approval: 7, scrub: 4 } };
    expect(resolveWorkdayLead("OFA", projectMeta)).toBe(7);
    expect(resolveWorkdayLead("OFS", projectMeta)).toBe(4);
  });
  it("lets a per-package override win over the project value", () => {
    const projectMeta = { detailing_lead_days: { approval: 10, scrub: 10 } };
    const packageMeta = { detailing_lead_days: { approval: 3 } };
    expect(resolveWorkdayLead("OFA", projectMeta, packageMeta)).toBe(3);
    // scrub not overridden at package level → project value.
    expect(resolveWorkdayLead("OFS", projectMeta, packageMeta)).toBe(10);
  });
  it("ignores non-numeric / negative config and uses the fallback", () => {
    const bad = { detailing_lead_days: { approval: "soon", scrub: -3 } };
    expect(resolveWorkdayLead("OFA", bad)).toBe(DEFAULT_WORKDAY_LEADS.OFA);
    expect(resolveWorkdayLead("OFS", bad)).toBe(DEFAULT_WORKDAY_LEADS.OFS);
  });
  it("accepts a zero lead (same-day) as a valid override", () => {
    const projectMeta = { detailing_lead_days: { approval: 0 } };
    expect(resolveWorkdayLead("OFA", projectMeta)).toBe(0);
  });
});

describe("decideWorkdayDue", () => {
  const today = "2026-07-06"; // Monday

  it("does nothing when the flag is off (calendar-day behavior unchanged)", () => {
    const d = decideWorkdayDue({
      stage: "OFA",
      currentRequiredDate: null,
      today,
      flagEnabled: false,
    });
    expect(d.requiredDate).toBeNull();
    expect(d.skipReason).toBe("flag-off");
  });

  it("does nothing on a non-outbound stage even with the flag on", () => {
    const d = decideWorkdayDue({
      stage: "BFA",
      currentRequiredDate: null,
      today,
      flagEnabled: true,
    });
    expect(d.requiredDate).toBeNull();
    expect(d.skipReason).toBe("not-outbound");
  });

  it("does not overwrite an already-set due date", () => {
    const d = decideWorkdayDue({
      stage: "OFA",
      currentRequiredDate: "2026-08-01",
      today,
      flagEnabled: true,
    });
    expect(d.requiredDate).toBeNull();
    expect(d.skipReason).toBe("already-set");
  });

  it("stamps OFA at today + approval working days (default 10)", () => {
    const d = decideWorkdayDue({
      stage: "OFA",
      currentRequiredDate: null,
      today, // Mon Jul 6
      flagEnabled: true,
    });
    // 10 working days from Mon Jul 6 = Mon Jul 20 (two weekends skipped).
    expect(d.requiredDate).toBe("2026-07-20");
    expect(d.leadDays).toBe(10);
  });

  it("stamps OFS at today + scrub working days from project config", () => {
    const d = decideWorkdayDue({
      stage: "OFS",
      currentRequiredDate: "",
      today, // Mon Jul 6
      flagEnabled: true,
      projectMeta: { detailing_lead_days: { scrub: 5 } },
    });
    // 5 working days from Mon Jul 6 = Mon Jul 13.
    expect(d.requiredDate).toBe("2026-07-13");
    expect(d.leadDays).toBe(5);
  });

  it("honors a per-package override for the OFA lead", () => {
    const d = decideWorkdayDue({
      stage: "OFA",
      currentRequiredDate: null,
      today, // Mon Jul 6
      flagEnabled: true,
      projectMeta: { detailing_lead_days: { approval: 10 } },
      packageMeta: { detailing_lead_days: { approval: 2 } },
    });
    // 2 working days from Mon Jul 6 = Wed Jul 8.
    expect(d.requiredDate).toBe("2026-07-08");
    expect(d.leadDays).toBe(2);
  });

  it("does nothing without a usable today", () => {
    const d = decideWorkdayDue({
      stage: "OFA",
      currentRequiredDate: null,
      today: "",
      flagEnabled: true,
    });
    expect(d.requiredDate).toBeNull();
    expect(d.skipReason).toBe("no-today");
  });
});
