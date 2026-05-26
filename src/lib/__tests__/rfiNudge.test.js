import { describe, expect, it } from "vitest";
import { buildRfiNudge, parseEmails } from "../rfiNudge";

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const daysAhead = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("parseEmails", () => {
  it("extracts and de-dupes emails from a free-text distribution list", () => {
    expect(parseEmails("EOR <eor@firm.com>, gc@build.com; eor@firm.com")).toEqual([
      "eor@firm.com",
      "gc@build.com",
    ]);
  });
  it("returns [] when there is no email", () => {
    expect(parseEmails("EOR, GC, Architect")).toEqual([]);
    expect(parseEmails(null)).toEqual([]);
  });
});

describe("buildRfiNudge", () => {
  it("includes the RFI ref, title, and ball-in-court", () => {
    const { subject, body } = buildRfiNudge({
      rfi_number: "814", title: "Landing support", ball_in_court: "EOR", status: "Open",
      submitted_date: daysAgo(10),
    });
    expect(subject).toBe("Follow-up: RFI 814 — Landing support");
    expect(body).toContain("RFI 814");
    expect(body).toContain("Landing support");
    expect(body).toContain("Ball in court: EOR");
  });

  it("states days overdue when past the required date", () => {
    const { body } = buildRfiNudge({ rfi_number: "1", title: "X", date_required: daysAgo(5) });
    expect(body).toMatch(/due 5 day\(s\) ago/);
  });

  it("states the requested-by date when not yet due", () => {
    const due = daysAhead(3);
    const { body } = buildRfiNudge({ rfi_number: "1", title: "X", date_required: due });
    expect(body).toContain(`requested by ${due}`);
  });

  it("falls back to days-open when there is no required date", () => {
    const { body } = buildRfiNudge({ rfi_number: "1", title: "X", submitted_date: daysAgo(9) });
    expect(body).toMatch(/open 9 day\(s\)/);
  });

  it("suggests recipients parsed from the distribution list", () => {
    const { suggestedTo } = buildRfiNudge({ rfi_number: "1", title: "X", distribution_list: "eor@firm.com, gc@x.com" });
    expect(suggestedTo).toEqual(["eor@firm.com", "gc@x.com"]);
  });

  it("uses a provided from-name signature", () => {
    const { body } = buildRfiNudge({ rfi_number: "1", title: "X" }, { fromName: "Nick L." });
    expect(body.trimEnd().endsWith("Nick L.")).toBe(true);
  });

  it("returns empty strings for a null RFI", () => {
    expect(buildRfiNudge(null)).toEqual({ subject: "", body: "", suggestedTo: [] });
  });
});
