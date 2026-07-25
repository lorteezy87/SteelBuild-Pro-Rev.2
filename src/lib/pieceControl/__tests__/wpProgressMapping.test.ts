import { describe, expect, it } from "vitest";
import {
  derivedLabelToPersistedStatus,
  isPieceDrivenWorkPackageProgress,
  persistedStatusFromLeafLifecycles,
} from "../wpProgressMapping";

describe("derivedLabelToPersistedStatus", () => {
  it("maps fabrication/logistics to In Progress", () => {
    expect(derivedLabelToPersistedStatus("In Fabrication")).toBe("In Progress");
    expect(derivedLabelToPersistedStatus("Shipping")).toBe("In Progress");
    expect(derivedLabelToPersistedStatus("Erection")).toBe("In Progress");
  });

  it("maps Complete and holds", () => {
    expect(derivedLabelToPersistedStatus("Complete")).toBe("Complete");
    expect(derivedLabelToPersistedStatus("Released", true)).toBe("On Hold");
  });

  it("maps pre-fab to Not Started", () => {
    expect(derivedLabelToPersistedStatus("Ready for Release")).toBe("Not Started");
    expect(derivedLabelToPersistedStatus("Released")).toBe("Not Started");
  });
});

describe("persistedStatusFromLeafLifecycles", () => {
  it("returns Not Started for empty or pre-fab", () => {
    expect(persistedStatusFromLeafLifecycles([])).toBe("Not Started");
    expect(persistedStatusFromLeafLifecycles(["not_started", "released"])).toBe(
      "Not Started",
    );
  });

  it("returns Complete when all erected", () => {
    expect(persistedStatusFromLeafLifecycles(["erected", "erected"])).toBe(
      "Complete",
    );
  });

  it("returns In Progress for mid-fab", () => {
    expect(
      persistedStatusFromLeafLifecycles(["fabricated", "not_started"]),
    ).toBe("In Progress");
  });

  it("returns On Hold when every leaf is on hold", () => {
    expect(
      persistedStatusFromLeafLifecycles(["released", "released"], [true, true]),
    ).toBe("On Hold");
  });
});

describe("isPieceDrivenWorkPackageProgress", () => {
  it("requires pilot/live and at least one leaf", () => {
    expect(isPieceDrivenWorkPackageProgress("pilot", 2)).toBe(true);
    expect(isPieceDrivenWorkPackageProgress("live", 1)).toBe(true);
    expect(isPieceDrivenWorkPackageProgress("shadow", 2)).toBe(false);
    expect(isPieceDrivenWorkPackageProgress("pilot", 0)).toBe(false);
    expect(isPieceDrivenWorkPackageProgress("off", 5)).toBe(false);
  });
});
