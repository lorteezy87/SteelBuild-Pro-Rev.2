import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fake web-ifc surface: a line table + a type index. Enough to prove the
 * roster comes out of ONE pass over IfcRelDefinesByProperties (no per-element
 * inverse scans), that marks are found under any property-set name, and that
 * borrowed models are used and left open. The real-engine counterpart is
 * extractIfcRoster.webifc.test.ts.
 */
type Line = Record<string, any>;

const T = {
  IFCBEAM: 1, IFCCOLUMN: 2, IFCPLATE: 3, IFCMEMBER: 4, IFCRELDEFINESBYPROPERTIES: 5,
  IFCBUILDINGELEMENTPROXY: 6, IFCELEMENTASSEMBLY: 7, IFCMECHANICALFASTENER: 8,
};

const ref = (value: number) => ({ type: 5, value });
const str = (value: string | null) => ({ type: 1, value });

function prop(name: string, value: string | null): Line {
  return { Name: str(name), NominalValue: value == null ? null : str(value) };
}

function fixture() {
  const lines: Record<number, Line> = {
    // parts
    10: { GlobalId: str("G-BEAM"), Name: str("BEAM"), Tag: str("b1") },
    11: { GlobalId: str("G-COL"), Name: str("COLUMN"), Tag: str("c1") },
    12: { GlobalId: str("G-BEAM"), Name: str("PLATE dup guid"), Tag: str("p9") }, // duplicate GlobalId
    13: { GlobalId: str("G-MEMBER"), Name: str("MEMBER no marks, no tag"), Tag: null },
    14: { GlobalId: str(null), Name: str("BEAM no guid"), Tag: str("b2") },
    15: { GlobalId: str("G-PROXY"), Name: str("PROXY tag only"), Tag: str("x7") },
    16: { GlobalId: str("G-STOCK"), Name: str("MEMBER stock tekla set"), Tag: str("m3") },
    // property sets + properties
    100: { Name: str("Part Properties"), HasProperties: [ref(200), ref(201), ref(202)] },
    101: { Name: str("Tekla Quantity"), HasProperties: [ref(203)] },
    102: { Name: str("Part Properties"), HasProperties: [ref(204), ref(205)] },
    103: { Name: str("Tekla Common"), HasProperties: [ref(206), ref(207)] },
    200: prop("Assembly Mark", "1B1"),
    201: prop("Part Mark", "p1"),
    202: prop("Sequence (Phase)", "3"),
    203: prop("Weight", "412.5"),
    204: prop("Part Mark", "c1"),
    205: prop("Assembly Mark", ""), // blank → ignored
    206: prop("Assembly/Cast unit Mark", "2M3"),
    207: prop("Phase", "7"),
    // relationships
    300: { RelatedObjects: [ref(10)], RelatingPropertyDefinition: ref(100) },
    301: { RelatedObjects: [ref(11)], RelatingPropertyDefinition: ref(101) },
    302: { RelatedObjects: [ref(11), ref(999)], RelatingPropertyDefinition: ref(102) },
    303: { RelatedObjects: ref(12), RelatingPropertyDefinition: ref(100) }, // shared pset, scalar RelatedObjects
    304: { RelatedObjects: [ref(999)], RelatingPropertyDefinition: ref(100) }, // no part → not followed
    305: { RelatedObjects: [ref(14)], RelatingPropertyDefinition: ref(100) },
    306: { RelatedObjects: [ref(16)], RelatingPropertyDefinition: ref(103) },
  };
  const typeIndex: Record<number, number[]> = {
    [T.IFCBEAM]: [10, 14],
    [T.IFCCOLUMN]: [11],
    [T.IFCPLATE]: [12],
    [T.IFCMEMBER]: [13, 16],
    [T.IFCBUILDINGELEMENTPROXY]: [15],
    [T.IFCRELDEFINESBYPROPERTIES]: [300, 301, 302, 303, 304, 305, 306],
    [T.IFCMECHANICALFASTENER]: [900, 901, 902],
  };
  const vec = (ids: number[]) => ({ size: () => ids.length, get: (i: number) => ids[i] });
  const state = { open: true };
  const api = {
    IsModelOpen: vi.fn(() => state.open),
    GetModelSchema: vi.fn(() => "IFC2X3"),
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
  return { api, WebIFC: T, state, typeIndex };
}

const engine = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/ifc/ifcEngine", () => ({ getEngine: async () => engine.current }));

import {
  MODEL_CLOSED_MESSAGE, extractIfcRoster, extractRosterFromModel, looksLikeMark, normalizeKey,
} from "../extractIfcRoster";

describe("extractRosterFromModel", () => {
  let fx: ReturnType<typeof fixture>;
  beforeEach(() => { fx = fixture(); });

  it("builds part rows from one pass over IfcRelDefinesByProperties, under any property-set name", async () => {
    const out = await extractRosterFromModel({ api: fx.api, WebIFC: fx.WebIFC, modelID: 0 });
    expect(out.schema).toBe("IFC2X3");
    expect(out.rows).toEqual([
      {
        element_guid: "G-BEAM", piece_mark: "1B1", assembly_mark: "1B1", part_mark: "p1",
        sequence_number: "3", name: "BEAM", ifc_type: "beam", quantity: 1,
      },
      {
        element_guid: "G-COL", piece_mark: "c1", assembly_mark: null, part_mark: "c1",
        sequence_number: null, name: "COLUMN", ifc_type: "column", quantity: 1,
      },
      // stock "Tekla Common" set: Assembly/Cast unit Mark + Phase
      {
        element_guid: "G-STOCK", piece_mark: "2M3", assembly_mark: "2M3", part_mark: "m3",
        sequence_number: "7", name: "MEMBER stock tekla set", ifc_type: "member", quantity: 1,
      },
      // proxy with no property sets at all: Tag is the part mark
      {
        element_guid: "G-PROXY", piece_mark: "x7", assembly_mark: null, part_mark: "x7",
        sequence_number: null, name: "PROXY tag only", ifc_type: "proxy", quantity: 1,
      },
    ]);
    // duplicate GlobalId (plate 12), member without marks or tag, beam without GUID → dropped
    expect(out.summary).toEqual({ parts: 4, assemblies: 2, byType: { beam: 1, column: 1, member: 1, proxy: 1 } });
    expect(out.diagnostics.skipped).toEqual({ noGuid: 1, noMark: 1, duplicateGuid: 1, unreadable: 0 });
    expect(out.diagnostics.markedFromTag).toBe(2); // stock-set member (part from Tag) + proxy
    expect(out.diagnostics.otherTypes).toEqual({}); // census only runs when nothing was rostered
    // web-ifc's per-element inverse scan is never used…
    expect(fx.api.properties.getPropertySets).not.toHaveBeenCalled();
    // …and a shared pset is parsed once, not once per related part.
    expect(fx.api.GetLine.mock.calls.filter(([, id]) => id === 100).length).toBe(1);
    // relationships that touch no rostered part are never followed
    expect(fx.api.GetLine.mock.calls.some(([, id]) => id === 999)).toBe(false);
  });

  it("reports index then parts progress", async () => {
    const seen: Array<[number, number, string]> = [];
    await extractRosterFromModel(
      { api: fx.api, WebIFC: fx.WebIFC, modelID: 0 },
      (done, total, phase) => seen.push([done, total, phase]),
    );
    expect(seen[0]).toEqual([0, 7, "index"]);
    expect(seen[seen.length - 1]).toEqual([7, 7, "parts"]);
  });

  it("explains an empty roster with what the file did contain", async () => {
    // Strip every property set and every Tag: parts exist, marks do not.
    fx.typeIndex[fx.WebIFC.IFCRELDEFINESBYPROPERTIES] = [301];
    for (const id of [10, 11, 12, 13, 14, 15, 16]) fx.api.GetLine.getMockImplementation()!(0, id).Tag = null;
    const out = await extractRosterFromModel({ api: fx.api, WebIFC: fx.WebIFC, modelID: 0 });
    expect(out.rows).toEqual([]);
    expect(out.diagnostics).toMatchObject({
      partsFound: 7,
      partsByType: { beam: 2, column: 1, plate: 1, member: 2, proxy: 1 },
      otherTypes: { mechanicalfastener: 3 },
      relCount: 1,
      relsTouchingParts: 1,
      propertySets: [{ name: "Tekla Quantity", count: 1 }],
      propertyKeys: [{ name: "Weight", count: 1 }],
      skipped: { noGuid: 1, noMark: 6, duplicateGuid: 0, unreadable: 0 },
    });
  });

  it("fails loudly when the model was closed underneath it instead of returning a short roster", async () => {
    fx.state.open = false;
    await expect(extractRosterFromModel({ api: fx.api, WebIFC: fx.WebIFC, modelID: 0 }))
      .rejects.toThrow(MODEL_CLOSED_MESSAGE);
  });
});

describe("mark heuristics", () => {
  it("normalizes property names", () => {
    expect(normalizeKey("Assembly/Cast unit Mark")).toBe("assemblycastunitmark");
    expect(normalizeKey(" Sequence (Phase) ")).toBe("sequencephase");
  });

  it("accepts marks and rejects GUIDs, blanks and prose", () => {
    for (const ok of ["1B1", "302M107", "b1", "C-12/A", "PL 1/2x4", "x7"]) expect(looksLikeMark(ok)).toBe(true);
    for (const bad of ["", "   ", null, "0Bq6XdsyPD8QUCKLEBcZse", "This is a beam that spans the bay and more", "a".repeat(40)]) {
      expect(looksLikeMark(bad)).toBe(false);
    }
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
    expect(out.rows).toHaveLength(4);
    expect(fx.api.OpenModel).not.toHaveBeenCalled();
    expect(fx.api.CloseModel).not.toHaveBeenCalled();
  });

  it("parses the buffer itself when the handle is stale, and closes what it opened", async () => {
    const out = await extractIfcRoster(new ArrayBuffer(8), undefined, { model: { modelID: 0, isOpen: () => false } });
    expect(out.rows).toHaveLength(4);
    expect(fx.api.OpenModel).toHaveBeenCalledTimes(1);
    expect(fx.api.CloseModel).toHaveBeenCalledWith(7);
  });

  it("closes its own model even when extraction throws", async () => {
    fx.api.GetLineIDsWithType.mockImplementation(() => { throw new Error("corrupt"); });
    await expect(extractIfcRoster(new ArrayBuffer(8))).rejects.toThrow("corrupt");
    expect(fx.api.CloseModel).toHaveBeenCalledWith(7);
  });
});
