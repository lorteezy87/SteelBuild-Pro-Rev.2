import { readOnlyTest as test, acceptanceOptions, REGISTER_CONTRACTS, visitRegister } from "./acceptance";

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
for (const register of ["drawings", "submittals", "rfis"] as const) {
  test(`register renders: ${REGISTER_CONTRACTS[register].path}`, async ({ page }) => {
    await visitRegister(page, register, acceptanceOptions(register));
  });
}
