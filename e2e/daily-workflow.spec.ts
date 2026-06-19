import { test, expect } from "@playwright/test";

/**
 * Daily-driver workflow smoke: each core register in the moat flow
 * (drawings → submittals → RFIs) loads its own content under the seeded
 * session without an uncaught error. Read-only — never mutates project data.
 *
 * Turns "the unit suite is green" into "the real signed-in pages still render."
 * Fab release is an action surfaced *within* the submittal/drawing flow
 * (ExportFabReleaseModal), not a route — a deeper, mutation-aware spec for it
 * is a follow-up (see e2e/README.md).
 */
const REGISTERS = [
  { path: "/Drawings", term: /drawing/i },
  { path: "/Submittals", term: /submittal/i },
  { path: "/RFIs", term: /rfi/i },
];

for (const reg of REGISTERS) {
  test(`register renders: ${reg.path}`, async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await page.goto(reg.path);
    await expect(page).toHaveURL(
      new RegExp(reg.path.replace(/\//g, "\\/") + "\\/?$"),
    );
    await expect(page.locator("body")).toContainText(reg.term);
    expect(fatal, `uncaught errors on ${reg.path}:\n${fatal.join("\n")}`).toEqual([]);
  });
}
