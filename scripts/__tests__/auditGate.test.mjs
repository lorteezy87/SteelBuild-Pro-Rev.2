import { describe, expect, it } from "vitest";
import {
  ALLOWLIST,
  SEVERITY_ORDER,
  THRESHOLD,
  classifyAudit,
  ghsaFromUrl,
  meetsThreshold,
} from "../audit-gate.mjs";

const advisory = (ghsa, severity, name = "pkg") => ({
  source: 1,
  name,
  title: `${name} advisory`,
  severity,
  url: `https://github.com/advisories/${ghsa}`,
});

const auditWith = (...vias) => ({
  vulnerabilities: Object.fromEntries(
    vias.map((v) => [v.name, { severity: v.severity, via: [v] }]),
  ),
});

describe("audit gate thresholds", () => {
  it("treats moderate and above as actionable", () => {
    expect(meetsThreshold("moderate")).toBe(true);
    expect(meetsThreshold("high")).toBe(true);
    expect(meetsThreshold("critical")).toBe(true);
  });

  it("ignores everything below the threshold", () => {
    expect(meetsThreshold("low")).toBe(false);
    expect(meetsThreshold("info")).toBe(false);
  });

  it("orders severities low to high", () => {
    expect(SEVERITY_ORDER.indexOf("critical")).toBeGreaterThan(
      SEVERITY_ORDER.indexOf(THRESHOLD),
    );
  });

  it("extracts the GHSA id from an advisory url", () => {
    expect(ghsaFromUrl("https://github.com/advisories/GHSA-wrjc-x8rr-h8h6")).toBe(
      "GHSA-wrjc-x8rr-h8h6",
    );
    expect(ghsaFromUrl(undefined)).toBeNull();
  });
});

describe("audit gate classification", () => {
  it("blocks an expired waiver even when its advisory is still reported", () => {
    const waivers = new Map([["GHSA-known-0001", { package: "pkg", reason: "r", reviewBy: "2026-09-10" }]]);
    const report = classifyAudit(auditWith(advisory("GHSA-known-0001", "moderate")), waivers, THRESHOLD, "2026-09-11");
    expect(report.blocking).toHaveLength(1);
    expect(report.waived).toHaveLength(0);
  });

  it("rejects audit service errors and missing vulnerability data", () => {
    expect(() => classifyAudit({ error: { message: "registry unavailable" } }, new Map())).toThrow();
    expect(() => classifyAudit({}, new Map())).toThrow();
  });

  it("BLOCKS a new unwaived moderate — the gate must actually fail", () => {
    const report = classifyAudit(auditWith(advisory("GHSA-new-0000-0001", "moderate", "left-pad")), new Map());
    expect(report.blocking).toHaveLength(1);
    expect(report.blocking[0].package).toBe("left-pad");
  });

  it("blocks a new critical too", () => {
    const report = classifyAudit(auditWith(advisory("GHSA-new-0000-0002", "critical")), new Map());
    expect(report.blocking).toHaveLength(1);
  });

  it("waives an allowlisted advisory instead of blocking", () => {
    const waivers = new Map([["GHSA-known-0001", { package: "p", reason: "r", reviewBy: "2026-12-31" }]]);
    const report = classifyAudit(auditWith(advisory("GHSA-known-0001", "moderate")), waivers);
    expect(report.blocking).toHaveLength(0);
    expect(report.waived).toHaveLength(1);
  });

  it("does not let a waiver hide an unrelated advisory", () => {
    const waivers = new Map([["GHSA-known-0001", { package: "p", reason: "r", reviewBy: "2026-12-31" }]]);
    const report = classifyAudit(
      auditWith(advisory("GHSA-known-0001", "moderate", "waived-pkg"), advisory("GHSA-new-0003", "high", "other-pkg")),
      waivers,
    );
    expect(report.waived).toHaveLength(1);
    expect(report.blocking.map((a) => a.package)).toEqual(["other-pkg"]);
  });

  it("flags a stale waiver so the allowlist cannot rot", () => {
    const waivers = new Map([["GHSA-gone-0001", { package: "p", reason: "r", reviewBy: "2026-12-31" }]]);
    const report = classifyAudit({ vulnerabilities: {} }, waivers);
    expect(report.stale).toEqual(["GHSA-gone-0001"]);
  });

  it("ignores sub-threshold advisories", () => {
    const report = classifyAudit(auditWith(advisory("GHSA-low-0001", "low")), new Map());
    expect(report.blocking).toHaveLength(0);
    expect(report.waived).toHaveLength(0);
  });
});

describe("the shipped allowlist", () => {
  it("has no active waivers after the React Router security upgrade", () => {
    expect(ALLOWLIST.size).toBe(0);
  });

  it("gives every waiver a reason and a review date", () => {
    for (const [ghsa, waiver] of ALLOWLIST) {
      expect(ghsa, `${ghsa} must be a GHSA id`).toMatch(/^GHSA-/);
      expect(waiver.reason?.length ?? 0, `${ghsa} needs a reason`).toBeGreaterThan(40);
      expect(waiver.reviewBy, `${ghsa} needs a reviewBy`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(waiver.package, `${ghsa} needs a package`).toBeTruthy();
    }
  });
});
