import { describe, expect, it } from "vitest";
import {
  CRANE_LIBRARY_KEY,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  configurationSummary,
  craneDisplayName,
  exportLibrary,
  importLibrary,
  loadLibrary,
  removeCrane,
  saveLibrary,
  upsertCrane,
  validateCrane,
  type CraneRecord,
} from "../craneLibrary";

/** Minimal in-memory Storage. `failWrites` simulates quota / private mode. */
function fakeStorage(initial: Record<string, string> = {}, failWrites = false): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => { data.delete(k); },
    setItem: (k: string, v: string) => {
      if (failWrites) throw new Error("QuotaExceededError");
      data.set(k, v);
    },
  };
}

/** Synthetic crane — not a real machine's chart. */
function crane(id = "c1", unit = "Crane 14"): CraneRecord {
  return {
    id,
    unit,
    makeModel: "Test Hydraulic 100T",
    serial: "SN-TEST",
    updatedAt: "2026-01-01T00:00:00.000Z",
    configurations: [{
      id: `${id}-cfg`,
      label: "Main boom · full OR",
      boomType: "telescopic",
      counterweight: "40,000 lb",
      outriggers: "full",
      areaOfOperation: "360",
      chartSource: "Synthetic test chart",
      chart: { boomLengths: [60, 80], radii: [20, 30], capacities: [[50000, 35000], [42000, 30000]] },
    }],
  };
}

describe("validateCrane", () => {
  it("accepts a well-formed crane", () => {
    expect(validateCrane(crane())).toEqual([]);
  });

  it("names the crane and the configuration in each problem", () => {
    const bad = crane();
    bad.configurations[0].chart = { boomLengths: [80, 60], radii: [20, 30], capacities: [[1, 1], [1, 1]] };
    expect(validateCrane(bad)[0]).toMatch(/^Crane "Crane 14" — "Main boom · full OR": Boom lengths must be listed shortest to longest/);
  });

  it("rejects an unknown outrigger setup or boom type", () => {
    const bad = crane();
    (bad.configurations[0] as unknown as Record<string, unknown>).outriggers = "sideways";
    (bad.configurations[0] as unknown as Record<string, unknown>).boomType = "rope";
    const problems = validateCrane(bad).join(" ");
    expect(problems).toMatch(/unknown outrigger setup/);
    expect(problems).toMatch(/telescopic or lattice/);
  });

  it("rejects duplicate configuration ids", () => {
    const bad = crane();
    bad.configurations.push({ ...bad.configurations[0] });
    expect(validateCrane(bad).join(" ")).toMatch(/two configurations with the same id/);
  });

  it("rejects non-objects", () => {
    expect(validateCrane(null)).toEqual(["Crane is not an object."]);
  });
});

describe("loadLibrary / saveLibrary", () => {
  it("round-trips a fleet", () => {
    const s = fakeStorage();
    expect(saveLibrary([crane()], s)).toBe(true);
    expect(loadLibrary(s)).toEqual([crane()]);
  });

  it("returns an empty fleet for nothing stored, corrupt JSON, or a non-array", () => {
    expect(loadLibrary(fakeStorage())).toEqual([]);
    expect(loadLibrary(fakeStorage({ [CRANE_LIBRARY_KEY]: "{not json" }))).toEqual([]);
    expect(loadLibrary(fakeStorage({ [CRANE_LIBRARY_KEY]: '{"a":1}' }))).toEqual([]);
  });

  it("DROPS a stored crane whose chart no longer validates, keeping the rest", () => {
    const bad = crane("c2", "Crane 9");
    bad.configurations[0].chart.capacities = [[0, 0], [0, 0]];
    const s = fakeStorage({ [CRANE_LIBRARY_KEY]: JSON.stringify([crane(), bad]) });
    expect(loadLibrary(s).map((c) => c.unit)).toEqual(["Crane 14"]);
  });

  it("reports a refused write instead of throwing", () => {
    expect(saveLibrary([crane()], fakeStorage({}, true))).toBe(false);
  });

  it("is a no-op with no storage at all", () => {
    expect(loadLibrary(null)).toEqual([]);
    expect(saveLibrary([crane()], null)).toBe(false);
  });
});

describe("upsertCrane / removeCrane", () => {
  it("adds a new id and replaces an existing one, stamping updatedAt", () => {
    const one = upsertCrane([], crane());
    expect(one).toHaveLength(1);
    const renamed = upsertCrane(one, { ...crane(), unit: "Crane 14A" });
    expect(renamed).toHaveLength(1);
    expect(renamed[0].unit).toBe("Crane 14A");
    expect(renamed[0].updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
  });

  it("removes by id", () => {
    expect(removeCrane([crane("a"), crane("b")], "a").map((c) => c.id)).toEqual(["b"]);
  });
});

describe("export / import", () => {
  it("round-trips through export and import", () => {
    const res = importLibrary(exportLibrary([crane()]), []);
    expect(res.fatal).toBeNull();
    expect(res.added).toBe(1);
    expect(res.cranes[0].configurations[0].chart).toEqual(crane().configurations[0].chart);
  });

  it("REPLACES a crane with the same id, so re-importing the master file updates it", () => {
    const office = { ...crane(), unit: "Crane 14 (re-certified)" };
    const res = importLibrary(exportLibrary([office]), [crane()]);
    expect(res.updated).toBe(1);
    expect(res.added).toBe(0);
    expect(res.cranes).toHaveLength(1);
    expect(res.cranes[0].unit).toBe("Crane 14 (re-certified)");
  });

  it("imports the valid cranes and NAMES the rejected one — never skips it silently", () => {
    const bad = crane("c2", "Crane 9");
    bad.configurations[0].chart.radii = [30, 20];
    const res = importLibrary(exportLibrary([crane(), bad]), []);
    expect(res.added).toBe(1);
    expect(res.rejected).toHaveLength(1);
    expect(res.rejected[0]).toMatch(/Crane "Crane 9"/);
  });

  it.each([
    ["not JSON", "{oops", /not valid JSON/],
    ["another app's JSON", JSON.stringify({ cranes: [] }), /not a SteelBuild crane library/],
    ["a future version", JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION + 1, cranes: [] }), /version 2 is not supported/],
    ["no crane list", JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION }), /no crane list/],
  ])("refuses %s and leaves the fleet unchanged", (_label, text, msg) => {
    const res = importLibrary(text, [crane()]);
    expect(res.fatal).toMatch(msg);
    expect(res.cranes).toEqual([crane()]);
  });
});

describe("display helpers", () => {
  it("names a crane by unit and model", () => {
    expect(craneDisplayName(crane())).toBe("Crane 14 — Test Hydraulic 100T");
    expect(craneDisplayName({ ...crane(), makeModel: " " })).toBe("Crane 14");
  });

  it("summarises what makes a chart that chart", () => {
    expect(configurationSummary(crane().configurations[0])).toBe(
      "Outriggers fully extended · 360° · 40,000 lb CWT · telescopic boom",
    );
  });
});
