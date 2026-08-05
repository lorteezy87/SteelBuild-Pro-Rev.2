// One-off local verification: prove web-ifc can parse a real Tekla IFC and that
// we can pull GlobalId + Assembly/Part Mark off each steel part. Not a CI test
// (needs an external multi-MB IFC); run manually against a real export:
//   node scripts/verify-ifc-extract.mjs "G:\path\to\model.ifc"
import * as WebIFC from "web-ifc";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ifcPath = process.argv[2];
if (!ifcPath) { console.error("usage: node scripts/verify-ifc-extract.mjs <path.ifc>"); process.exit(1); }

const api = new WebIFC.IfcAPI();
api.SetWasmPath(path.resolve("node_modules/web-ifc") + path.sep, true);
await api.Init();

const bytes = new Uint8Array(fs.readFileSync(ifcPath));
const modelID = api.OpenModel(bytes);
console.log("schema:", api.GetModelSchema?.(modelID) ?? "(n/a)");

const TYPES = {
  IFCBEAM: WebIFC.IFCBEAM, IFCCOLUMN: WebIFC.IFCCOLUMN, IFCPLATE: WebIFC.IFCPLATE,
  IFCMEMBER: WebIFC.IFCMEMBER, IFCELEMENTASSEMBLY: WebIFC.IFCELEMENTASSEMBLY,
};
for (const [name, t] of Object.entries(TYPES)) {
  const ids = api.GetLineIDsWithType(modelID, t);
  console.log(`${name.padEnd(20)} ${ids.size()}`);
}

// Helper: read the "Part Properties" PSet for one element.
async function partMarks(eid) {
  const out = {};
  try {
    const psets = await api.properties.getPropertySets(modelID, eid, true);
    for (const ps of psets) {
      const psName = ps?.Name?.value;
      if (psName !== "Part Properties") continue;
      for (const p of ps.HasProperties || []) {
        const k = p?.Name?.value;
        const v = p?.NominalValue?.value;
        if (k != null) out[k] = v;
      }
    }
  } catch (e) { out.__error = String(e?.message || e); }
  return out;
}

const beamIds = api.GetLineIDsWithType(modelID, WebIFC.IFCBEAM);
console.log("\n--- sample of 6 beams ---");
const seenAssembly = new Set();
for (let i = 0; i < Math.min(6, beamIds.size()); i++) {
  const eid = beamIds.get(i);
  const el = api.GetLine(modelID, eid);
  const m = await partMarks(eid);
  console.log(`#${eid} GUID=${el?.GlobalId?.value} Name=${el?.Name?.value} | Assembly=${m["Assembly Mark"]} Part=${m["Part Mark"]} Seq=${m["Sequence (Phase)"]}${m.__error ? " ERR=" + m.__error : ""}`);
}

// Roster coverage: how many beams expose an Assembly Mark?
let withAssembly = 0, withPart = 0, total = 0;
const sampleN = Math.min(beamIds.size(), 300);
for (let i = 0; i < sampleN; i++) {
  const m = await partMarks(beamIds.get(i));
  total++;
  if (m["Assembly Mark"]) withAssembly++;
  if (m["Part Mark"]) withPart++;
  if (m["Assembly Mark"]) seenAssembly.add(m["Assembly Mark"]);
}
console.log(`\nover ${total} sampled beams: ${withAssembly} have Assembly Mark, ${withPart} have Part Mark, ${seenAssembly.size} distinct assemblies`);

api.CloseModel(modelID);
console.log("OK");
