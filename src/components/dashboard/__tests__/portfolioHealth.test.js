import { describe, it, expect } from "vitest";
import { psrHealthProvenance, PSR_STALE_DAYS } from "../portfolioHealth";

// Fixed "now" so the age math is deterministic (the helper takes `now` injected).
const NOW = new Date("2026-06-19T12:00:00.000Z");
const daysBefore = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

// Mirrors the REAL shape: proposed_health_status nests under metadata.psr.latest,
// the import timestamp at metadata.psr.last_imported_at.
const psrProject = ({ healthStatus = "At Risk", proposed = "At Risk", importedAt = daysBefore(24) } = {}) => ({
  health_status: healthStatus,
  metadata: { psr: { last_imported_at: importedAt, latest: { proposed_health_status: proposed, imported_at: importedAt } } },
});

describe("psrHealthProvenance", () => {
  it("returns fromSnapshot=false when there is no PSR snapshot verdict", () => {
    expect(psrHealthProvenance({}, NOW)).toMatchObject({ fromSnapshot: false, driftRisk: false });
    expect(psrHealthProvenance({ metadata: {} }, NOW).fromSnapshot).toBe(false);
    // psr present but no proposed_health_status anywhere → not a health snapshot
    expect(psrHealthProvenance({ metadata: { psr: { last_imported_at: daysBefore(1) } } }, NOW).fromSnapshot).toBe(false);
  });

  it("reads proposed_health_status from psr.latest (the real shape)", () => {
    const r = psrHealthProvenance(psrProject(), NOW);
    expect(r.fromSnapshot).toBe(true);
    expect(r.snapshotHealth).toBe("At Risk");
    expect(r.ageDays).toBe(24);
    expect(r.stale).toBe(true);
  });

  it("driftRisk=true when a stale snapshot still matches the live column (the ASM Garage case)", () => {
    // health_status column "At Risk" == snapshot "At Risk", 24d old → flag it.
    expect(psrHealthProvenance(psrProject({ healthStatus: "At Risk", proposed: "At Risk" }), NOW).driftRisk).toBe(true);
  });

  it("driftRisk=false when health_status has diverged from the snapshot (ALA Buckeye / Skyport)", () => {
    // Column refreshed to "On Track"; the stale "At Risk" snapshot isn't what's shown → no flag.
    const r = psrHealthProvenance(psrProject({ healthStatus: "On Track", proposed: "At Risk" }), NOW);
    expect(r.stale).toBe(true);
    expect(r.driftRisk).toBe(false);
  });

  it("driftRisk=false for a fresh snapshot even if it matches", () => {
    const r = psrHealthProvenance(psrProject({ importedAt: daysBefore(3) }), NOW);
    expect(r.ageDays).toBe(3);
    expect(r.stale).toBe(false);
    expect(r.driftRisk).toBe(false);
  });

  it("treats the threshold as exclusive — stale only PAST PSR_STALE_DAYS", () => {
    expect(psrHealthProvenance(psrProject({ importedAt: daysBefore(PSR_STALE_DAYS) }), NOW).stale).toBe(false);
    expect(psrHealthProvenance(psrProject({ importedAt: daysBefore(PSR_STALE_DAYS + 1) }), NOW).stale).toBe(true);
  });

  it("tolerates the legacy root-level proposed_health_status + an unparseable date", () => {
    const legacy = { health_status: "At Risk", metadata: { psr: { proposed_health_status: "At Risk", last_imported_at: daysBefore(40) } } };
    expect(psrHealthProvenance(legacy, NOW)).toMatchObject({ fromSnapshot: true, snapshotHealth: "At Risk", driftRisk: true });
    const bad = psrProject({ importedAt: "not-a-date" });
    expect(psrHealthProvenance(bad, NOW)).toMatchObject({ fromSnapshot: true, ageDays: null, stale: false, driftRisk: false });
  });
});
