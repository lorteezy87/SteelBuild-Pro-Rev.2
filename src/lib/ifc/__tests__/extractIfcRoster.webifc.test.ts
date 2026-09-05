// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { extractRosterFromModel } from "../extractIfcRoster";

/**
 * Real-engine regression: runs web-ifc's Node build (same wasm parser the
 * browser uses) over hand-written IFC2X3 / IFC4 files, so the single-pass
 * property read is proven against the actual GetLine shapes, not a fake.
 */
const require = createRequire(import.meta.url);
const WebIFC = require("web-ifc");

const HEADER = (schema: string) => `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('t.ifc','2026-09-05T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('${schema}'));
ENDSEC;
DATA;
`;
const FOOTER = `ENDSEC;
END-ISO-10303-21;
`;

// IFC2X3 IfcBeam/IfcColumn take 8 attributes (no PredefinedType); Tag is #8.
const TEKLA_CUSTOM_2X3 = HEADER("IFC2X3") + `#1=IFCBEAM('0Bq6XdsyPD8QUCKLEBcZse',$,'BEAM',$,$,$,$,'b1');
#2=IFCPROPERTYSINGLEVALUE('Assembly Mark',$,IFCLABEL('1B1'),$);
#3=IFCPROPERTYSINGLEVALUE('Part Mark',$,IFCLABEL('p1'),$);
#4=IFCPROPERTYSINGLEVALUE('Sequence (Phase)',$,IFCLABEL('3'),$);
#5=IFCPROPERTYSET('1Bq6XdsyPD8QUCKLEBcZse',$,'Part Properties',$,(#2,#3,#4));
#6=IFCRELDEFINESBYPROPERTIES('2Bq6XdsyPD8QUCKLEBcZse',$,$,$,(#1),#5);
#7=IFCCOLUMN('3Bq6XdsyPD8QUCKLEBcZse',$,'COLUMN',$,$,$,$,'c1');
#8=IFCPROPERTYSINGLEVALUE('Weight',$,IFCREAL(412.5),$);
#9=IFCPROPERTYSET('4Bq6XdsyPD8QUCKLEBcZse',$,'Tekla Quantity',$,(#8));
#10=IFCRELDEFINESBYPROPERTIES('5Bq6XdsyPD8QUCKLEBcZse',$,$,$,(#7),#9);
` + FOOTER;

// Stock Tekla config (no custom "Part Properties"), parts as proxies, IFC4.
const TEKLA_STOCK_PROXY_4 = HEADER("IFC4") + `#1=IFCBUILDINGELEMENTPROXY('0Bq6XdsyPD8QUCKLEBcZsf',$,'ANGLE',$,$,$,$,'302M107',$);
#2=IFCPROPERTYSINGLEVALUE('Assembly/Cast unit Mark',$,IFCLABEL('302M107'),$);
#3=IFCPROPERTYSINGLEVALUE('Phase',$,IFCLABEL('2'),$);
#4=IFCPROPERTYSET('1Bq6XdsyPD8QUCKLEBcZsf',$,'Tekla Common',$,(#2,#3));
#5=IFCRELDEFINESBYPROPERTIES('2Bq6XdsyPD8QUCKLEBcZsf',$,$,$,(#1),#4);
#6=IFCMEMBER('3Bq6XdsyPD8QUCKLEBcZsf',$,'BRACE',$,$,$,$,'m2',$);
` + FOOTER;

// Parts present, no property sets, no tags: must yield nothing but explain.
const BARE_2X3 = HEADER("IFC2X3") + `#1=IFCBEAM('0Bq6XdsyPD8QUCKLEBcZsg',$,'BEAM',$,$,$,$,$);
#2=IFCMECHANICALFASTENER('1Bq6XdsyPD8QUCKLEBcZsg',$,'BOLT',$,$,$,$,$,$,$);
` + FOOTER;

async function withModel<T>(ifc: string, fn: (model: { api: any; WebIFC: any; modelID: number }) => Promise<T>): Promise<T> {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  try { api.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_OFF); } catch { /* older engine */ }
  const modelID = api.OpenModel(new TextEncoder().encode(ifc), { COORDINATE_TO_ORIGIN: true });
  try {
    return await fn({ api, WebIFC, modelID });
  } finally {
    api.CloseModel(modelID);
  }
}

describe("extractRosterFromModel against the real web-ifc engine", () => {
  it("reads the S&H custom 'Part Properties' set from an IFC2X3 Tekla export", async () => {
    const out = await withModel(TEKLA_CUSTOM_2X3, (m) => extractRosterFromModel(m));
    expect(out.schema).toBe("IFC2X3");
    expect(out.rows).toEqual([
      {
        element_guid: "0Bq6XdsyPD8QUCKLEBcZse", piece_mark: "1B1", assembly_mark: "1B1", part_mark: "p1",
        sequence_number: "3", name: "BEAM", ifc_type: "beam", quantity: 1,
      },
      // no mark in its only pset → Tag ("c1") is the part mark
      {
        element_guid: "3Bq6XdsyPD8QUCKLEBcZse", piece_mark: "c1", assembly_mark: null, part_mark: "c1",
        sequence_number: null, name: "COLUMN", ifc_type: "column", quantity: 1,
      },
    ]);
    expect(out.diagnostics.propertySets).toEqual([
      { name: "Part Properties", count: 1 },
      { name: "Tekla Quantity", count: 1 },
    ]);
  }, 30000);

  it("reads stock 'Tekla Common' marks off proxy parts in an IFC4 export, and Tags off bare members", async () => {
    const out = await withModel(TEKLA_STOCK_PROXY_4, (m) => extractRosterFromModel(m));
    expect(out.schema).toBe("IFC4");
    expect(out.rows).toEqual([
      {
        element_guid: "3Bq6XdsyPD8QUCKLEBcZsf", piece_mark: "m2", assembly_mark: null, part_mark: "m2",
        sequence_number: null, name: "BRACE", ifc_type: "member", quantity: 1,
      },
      {
        element_guid: "0Bq6XdsyPD8QUCKLEBcZsf", piece_mark: "302M107", assembly_mark: "302M107", part_mark: "302M107",
        sequence_number: "2", name: "ANGLE", ifc_type: "proxy", quantity: 1,
      },
    ]);
    expect(out.summary.byType).toEqual({ member: 1, proxy: 1 });
  }, 30000);

  it("returns no rows but a precise census when parts carry neither property sets nor tags", async () => {
    const out = await withModel(BARE_2X3, (m) => extractRosterFromModel(m));
    expect(out.rows).toEqual([]);
    expect(out.diagnostics).toMatchObject({
      schema: "IFC2X3",
      partsFound: 1,
      partsByType: { beam: 1, column: 0, plate: 0, member: 0, proxy: 0 },
      otherTypes: { mechanicalfastener: 1 },
      relCount: 0,
      relsTouchingParts: 0,
      skipped: { noGuid: 0, noMark: 1, duplicateGuid: 0, unreadable: 0 },
    });
  }, 30000);
});
