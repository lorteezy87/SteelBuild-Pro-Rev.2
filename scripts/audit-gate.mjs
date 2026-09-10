#!/usr/bin/env node
/**
 * audit-gate.mjs — production dependency audit gate.
 *
 * Fails on any PRODUCTION advisory at or above THRESHOLD ("moderate") that is
 * not explicitly waived in ALLOWLIST below.
 *
 * Why this exists rather than a bare `npm audit --audit-level=<x>`:
 *
 *   `npm audit --omit=dev --audit-level=high` exited 0 while three real
 *   production advisories sat one step below the bar at moderate. The gate was
 *   green precisely because the issues that mattered were the wrong severity.
 *   Lowering the threshold alone is not the fix either — react-router's two
 *   moderates have no patched 6.x release, so a bare moderate gate would pin
 *   this job red until an unrelated major upgrade shipped, and a permanently
 *   red job is a job nobody reads.
 *
 * A threshold hides everything below it, silently and forever. An allowlist
 * names each exception, in the diff, with a reason and a review date — and
 * STALE_WAIVERS below fails the build once a waiver stops matching anything,
 * so the list cannot rot into a second silent gate.
 *
 * Waive sparingly, and prefer removing an entry to extending its review date.
 */
import { execFileSync } from "node:child_process";

export const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];
export const THRESHOLD = "moderate";

/**
 * GHSA id -> why it is waived. Every entry needs a reason a reviewer can check
 * and a reviewBy date. An entry that no longer matches any advisory fails the
 * build (see classifyAudit) so waivers get deleted rather than accumulating.
 */
export const ALLOWLIST = new Map([
  [
    "GHSA-wrjc-x8rr-h8h6",
    {
      package: "react-router",
      reason:
        "Open redirect via backslash in <Link>/useNavigate. No patched 6.x " +
        "exists (vulnerable range 6.0.0 - 7.17.0, first fix 7.18.3), so " +
        "clearing it means a 6 -> 7 breaking major. No exploitation path " +
        "today: the app has no user-controlled navigation target — every " +
        "`next` is built with new URLSearchParams(searchParams), not a " +
        "redirect destination, and there is no ?next=-style post-login hop.",
      reviewBy: "2026-12-31",
    },
  ],
  [
    "GHSA-337j-9hxr-rhxg",
    {
      package: "react-router",
      reason:
        "Arbitrary constructor injection via deserializeErrors() during SSR " +
        "hydration. Rev 2 is a Vite SPA and does not server-render, so the " +
        "code path is not present. Clears with the same 6 -> 7 upgrade.",
      reviewBy: "2026-12-31",
    },
  ],
]);

export function meetsThreshold(severity, threshold = THRESHOLD) {
  const s = SEVERITY_ORDER.indexOf(severity);
  const t = SEVERITY_ORDER.indexOf(threshold);
  return s >= 0 && t >= 0 && s >= t;
}

export function ghsaFromUrl(url) {
  if (typeof url !== "string") return null;
  const m = url.match(/(GHSA-[0-9a-z-]+)/i);
  return m ? m[1] : null;
}

/**
 * Flatten `npm audit --json` into the advisories that matter, then split them
 * into blocking / waived / stale. Pure: takes parsed JSON, returns a report.
 */
export function classifyAudit(auditJson, allowlist = ALLOWLIST, threshold = THRESHOLD) {
  const advisories = new Map();
  for (const [pkg, node] of Object.entries(auditJson?.vulnerabilities ?? {})) {
    for (const via of node?.via ?? []) {
      if (typeof via !== "object") continue;
      const ghsa = ghsaFromUrl(via.url);
      if (!ghsa || advisories.has(ghsa)) continue;
      advisories.set(ghsa, {
        ghsa,
        package: via.name ?? pkg,
        title: via.title ?? "(untitled advisory)",
        severity: via.severity ?? node?.severity ?? "info",
        url: via.url ?? "",
      });
    }
  }

  const relevant = [...advisories.values()].filter((a) => meetsThreshold(a.severity, threshold));
  const blocking = relevant.filter((a) => !allowlist.has(a.ghsa));
  const waived = relevant.filter((a) => allowlist.has(a.ghsa));
  const seen = new Set(relevant.map((a) => a.ghsa));
  const stale = [...allowlist.keys()].filter((ghsa) => !seen.has(ghsa));

  return { blocking, waived, stale, total: advisories.size };
}

export function runAudit() {
  // npm audit exits non-zero when it finds anything; that is expected here —
  // this script decides what counts, not npm's threshold flag.
  try {
    return JSON.parse(
      execFileSync("npm", ["audit", "--omit=dev", "--json"], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      }),
    );
  } catch (err) {
    if (err?.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

function main() {
  const report = classifyAudit(runAudit());

  for (const a of report.waived) {
    const waiver = ALLOWLIST.get(a.ghsa);
    console.log(`waived   ${a.severity.padEnd(8)} ${a.package} — ${a.title}`);
    console.log(`         ${a.ghsa} · review by ${waiver.reviewBy}`);
  }

  for (const a of report.blocking) {
    console.error(`BLOCKING ${a.severity.padEnd(8)} ${a.package} — ${a.title}`);
    console.error(`         ${a.url}`);
  }

  if (report.stale.length) {
    console.error(
      `\nStale waiver(s) in ALLOWLIST — no longer reported, delete them:\n  ${report.stale.join("\n  ")}`,
    );
  }

  if (report.blocking.length || report.stale.length) {
    console.error(
      `\nFAIL — ${report.blocking.length} unwaived advisory(ies) at ${THRESHOLD}+, ` +
        `${report.stale.length} stale waiver(s).`,
    );
    process.exit(1);
  }

  console.log(
    `\nOK — no unwaived production advisories at ${THRESHOLD}+ ` +
      `(${report.waived.length} waived, ${report.total} total in tree).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
