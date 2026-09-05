import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fake web-ifc surface: a line table + a type index. Enough to prove the
 * roster comes out of ONE pass over IfcRelDefinesByProperties (no per-element
 * inverse scans), and that borrowed models are used and left open.
 */
type Line = Record<string, any>;

const T = { IFCBEAM: 1, IFCCOLUMN: 2, IFCPLATE: 3, IFCMEMBER: 4, IFCRELDEFINESBYPROPERTIES: 5 };

const ref = (value: number) => ({ type: 5, value });
const str = (value: string | null) => ({ type: 1, value });

function prop(name: string, value: string | null): Line {
  return { Name: str(name), NominalValue: value == null ? null : str(value) };
}

function fixture() {
  const lines: Record<number, Line> = {
    // parts
    10: { GlobalId: str("G-BEAM"), Name: str("BEAM/1B1") },
    11: { GlobalId: str("G-COL"), Name: str("COLUMN/C1") },
    12: { GlobalId: str("G-BEAM"), Name: str("PLATE dup guid") }, // duplicate GlobalId
    13: { GlobalId: str("G-MEMBER"), Name: str("MEMBER no marks") },
    14: { GlobalId: str(null), Name: str("BEAM no guid") },
    // property sets + properties
    100: { Name: str("Part Properties"), HasProperties: [ref(200), ref(201), ref(202)] },
    101: { Name: str("Tekla Common"), HasProperties: [ref(203)] },
    102: { Name: str("Part Properties"), HasProperties: [ref(204), ref(205)] },
    200: prop("Assembly Mark", "1B1"),
    201: prop("Part Mark", "p1"),
    202: prop("Sequence (Phase)", "3"),
    203: prop("Assembly Mark", "SHOULD-NOT-COUNT"),
    204: prop("Part Mark", "c1"),
    205: prop("Assembly Mark", ""), // blank → ignored
    // relationships
    300: { RelatedObjects: [ref(10)], RelatingPropertyDefinition: ref(100) },
    301: { RelatedObjects: [ref(11)], RelatingPropertyDefinition: ref(101) },
    302: { RelatedObjects: [ref(11), ref(999)], RelatingPropertyDefinition: ref(102) },
    303: { RelatedObjects: ref(12), RelatingPropertyDefinition: ref(100) }, // shared pset, scalar RelatedObjects
    304: { RelatedObjects: [ref(999)], RelatingPropertyDefinition: ref(100) }, // no part → not followed
    305: { RelatedObjects: [ref(14)], RelatingPropertyDefinition: ref(100) },
  };
  const typeIndex: Record<number, number[]> = {
    [T.IFCBEAM]: [10, 14],
    [T.IFCCOLUMN]: [11],
    [T.IFCPLATE]: [12],
    [T.IFCMEMBER]: [13],
    [T.IFCRELDEFINESBYPROPERTIES]: [300, 301, 302, 303, 304, 305],
  };
  const vec = (ids: number[]) => ({ size: () => ids.length, get: (i: number) => ids[i] });
  const state = { open: true };
  const api = {
    IsModelOpen: vi.fn(() => state.open),
    GetModelSchema: vi.fn(() => "IFC4"),
    GetLineIDsWithType: vi.fn((_m: number, type: number) => vec(typeIndex[type] || [])),
    GetLine: vi.fn((_m: number, id: number) => {
      const line = lines[id];
      if (!line) throw new Error(`no line ${id}`);
      return line;
    }),
    OpenModel: vi.fn(() => 7),
    CloseModel: vi.fn(),
    properties: { getPropertySets: vi.fn(async () => { throw new Error("must not be used"); }) },
  };
  return { api, WebIFC: T, state };
}

const engine = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/ifc/ifcEngine", () => ({ getEngine: async () => engine.current }));

import { MODEL_CLOSED_MESSAGE, extractIfcRoster, extractRosterFromModel } from "../extractIfcRoster";

describe("extractRosterFromModel", () => {
  let fx: ReturnType<typeof fixture>;
  beforeEach(() => { fx = fixture(); });

  it("builds part rows from one pass over IfcRelDefinesByProperties", async () => {
    const out = await extractRosterFromModel({ api: fx.api, WebIFC: fx.WebIFC, modelID: 0 });
    expect(out.schema).toBe("IFC4");
    expect(out.rows).toEqual([
      {
        element_guid: "G-BEAM", piece_mark: "1B1", assembly_mark: "1B1", part_mark: "p1",
        sequence_number: "3", name: "BEAM/1B1", ifc_type: "beam", quantity: 1,
      },
      {
        element_guid: "G-COL", piece_mark: "c1", assembly_mark: null, part_mark: "c1",
        sequence_number: null, name: "COLUMN/C1", ifc_type: "column", quantity: 1,
      },
    ]);
    // duplicate GlobalId (plate 12), member without marks, beam without GUID → dropped
    expect(out.summary).toEqual({ parts: 2, assemblies: 1, byType: { beam: 1, column: 1 } });
    // web-ifc's per-element inverse scan is never used…
    expect(fx.api.properties.getPropertySets).not.toHaveBeenCalled();
    // …and a shared pset is parsed once, not once per related part.
    const psetReads = fx.api.GetLine.mock.calls.filter(([, id]) => id === 100).length;
    expect(psetReads).toBe(1);
    // relationships that touch no rostered part are never followed
    expect(fx.api.GetLine.mock.calls.some(([, id]) => id === 203)).toBe(false);
  });

  it("reports index then parts progress", async () => {
    const seen: Array<[number, number, string]> = [];
    await extractRosterFromModel(
      { api: fx.api, WebIFC: fx.WebIFC, modelID: 0 },
      (done, total, phase) => seen.push([done, total, phase]),
    );
    expect(seen[0]).toEqual([0, 5, "index"]);
    expect(seen[seen.length - 1]).toEqual([5, 5, "parts"]);
  });

  it("fails loudly when the model was closed underneath it instead of returning a short roster", async () => {
    fx.state.open = false;
    await expect(extractRosterFromModel({ api: fx.api, WebIFC: fx.WebIFC, modelID: 0 }))
      .rejects.toThrow(MODEL_CLOSED_MESSAGE);
  });
});

describe("extractIfcRoster", () => {
  let fx: ReturnType<typeof fixture>;
  beforeEach(() => {
    fx = fixture();
    engine.current = { api: fx.api, WebIFC: fx.WebIFC };
  });

  it("borrows an open viewer model and leaves it open", async () => {
    const out = await extractIfcRoster(new ArrayBuffer(8), undefined, { model: { modelID: 0, isOpen: () => true } });
    expect(out.rows).toHaveLength(2);
    expect(fx.api.OpenModel).not.toHaveBeenCalled();
    expect(fx.api.CloseModel).not.toHaveBeenCalled();
  });

  it("parses the buffer itself when the handle is stale, and closes what it opened", async () => {
    const out = await extractIfcRoster(new ArrayBuffer(8), undefined, { model: { modelID: 0, isOpen: () => false } });
    expect(out.rows).toHaveLength(2);
    expect(fx.api.OpenModel).toHaveBeenCalledTimes(1);
    expect(fx.api.CloseModel).toHaveBeenCalledWith(7);
  });

  it("closes its own model even when extraction throws", async () => {
    fx.api.GetLineIDsWithType.mockImplementation(() => { throw new Error("corrupt"); });
    await expect(extractIfcRoster(new ArrayBuffer(8))).rejects.toThrow("corrupt");
    expect(fx.api.CloseModel).toHaveBeenCalledWith(7);
  });
});
