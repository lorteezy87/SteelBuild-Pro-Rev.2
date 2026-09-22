import { describe, it, expect } from "vitest";
import { BIC_PARTIES, BIC_COLORS } from "../constants";
import { BALL_IN_COURT_PARTIES, isValidBallInCourt } from "@/lib/ballInCourt";
import { rfiOperationalSignals } from "../rfiControlCenter.derive";

/**
 * chk_rfis_ball_in_court is live and validated. DetailPanel writes
 * BIC_PARTIES straight to rfis.ball_in_court, so anything in that list the
 * constraint rejects loses the user's save with a raw Postgres constraint
 * name — the failure ballInCourt.ts's own header warns about.
 *
 * BIC_PARTIES was its own five-value list containing "Engineer", which is not
 * in the vocabulary. These tests fail against that list.
 */

describe("RFI ball-in-court vocabulary", () => {
  it("offers only values the DB constraint accepts", () => {
    for (const party of BIC_PARTIES) {
      expect(isValidBallInCourt(party), `${party} is not a valid party`).toBe(true);
    }
  });

  it("is the shared vocabulary, not a local copy", () => {
    expect([...BIC_PARTIES]).toEqual([...BALL_IN_COURT_PARTIES]);
  });

  it("does not offer the retired Engineer spelling", () => {
    expect(BIC_PARTIES).not.toContain("Engineer");
  });

  it("has a colour for every party it offers", () => {
    // DetailPanel tones via `BIC_COLORS[p] || BIC_COLORS.Contractor`, so a
    // missing entry renders as a second Contractor chip rather than failing.
    for (const party of BALL_IN_COURT_PARTIES) {
      expect(BIC_COLORS[party], `${party} has no colour`).toBeDefined();
      expect(BIC_COLORS[party].bg).toMatch(/^var\(--/);
      expect(BIC_COLORS[party].text).toMatch(/^var\(--/);
    }
  });

  it("carries no colour for a party that cannot be stored", () => {
    expect(BIC_COLORS).not.toHaveProperty("Engineer");
  });
});

describe("unansweredExternal classification", () => {
  const openRfi = (ball_in_court: string) => ({
    id: "r1",
    rfi_number: "RFI #001",
    status: "Open",
    ball_in_court,
    submitted_date: "2026-09-01",
  });

  // EOR and AOR are storable and are outside our shop. They were absent from
  // EXTERNAL_BIC, so an RFI parked on either read as internal and never
  // surfaced as awaiting an outside response.
  it.each(["GC", "EOR", "AOR", "Architect", "Owner"])(
    "treats %s as external",
    (party) => {
      expect(rfiOperationalSignals(openRfi(party)).unansweredExternal).toBe(true);
    },
  );

  it.each(["Contractor", "Subcontractor", "Detailer"])(
    "treats %s as our own side",
    (party) => {
      expect(rfiOperationalSignals(openRfi(party)).unansweredExternal).toBe(false);
    },
  );
});
