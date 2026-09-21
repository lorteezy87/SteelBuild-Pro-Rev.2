import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIcs } from "../icsExport";

/**
 * Outward-facing documents must not carry a company of their own. The
 * transmittal PDF is covered by generateTransmittal.test.js, which checks the
 * issuer plumbing in detail; this file covers the OTHER producer — the .ics
 * export, which had no test at all — plus one guard across all of them.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the .ics PRODID identifies the product, not a company", () => {
  it("emits exactly one PRODID and it names no customer", () => {
    // It read "-//S&H Steel Co//SteelBuild Pro//EN", so every .ics any tenant
    // exported to Outlook carried one particular company's name.
    const ics = buildIcs({ events: [], calendarName: "Project 1234" });
    const prodids = ics.split("\r\n").filter((l) => l.startsWith("PRODID:"));
    expect(prodids).toHaveLength(1);
    expect(prodids[0]).toBe("PRODID:-//SteelBuild Pro//SteelBuild Pro//EN");
  });

  it("does not put the signed-in org here either", () => {
    // PRODID is the producing SOFTWARE (RFC 5545 s3.7.3), not the sender, so
    // an org name here would swap one wrong value for another. A workspace
    // label belongs on X-WR-CALNAME, which the caller supplies, and an
    // organizer belongs on the events.
    const ics = buildIcs({ events: [], calendarName: "Acme Steel — Project 1234" });
    expect(ics).toContain("X-WR-CALNAME:Acme Steel");
    expect(ics.split("\r\n").find((l) => l.startsWith("PRODID:")))
      .not.toContain("Acme Steel");
  });
});

describe("no generated document hardcodes a company name", () => {
  // Every file here produces something a third party receives. A company
  // literal in any of them is the same defect in a new place: it ships one
  // customer's identity to every other customer.
  const PRODUCERS = [
    "src/lib/generateTransmittal.js",
    "src/lib/icsExport.js",
    "src/lib/exports/markupPDF.js",
  ];

  it("keeps every outward-facing producer free of a company literal", () => {
    const offenders = PRODUCERS.filter((f) => stripComments(read(f)).includes("S&H"));
    expect(offenders, "these ship one customer's name to every other customer")
      .toEqual([]);
  });
});
