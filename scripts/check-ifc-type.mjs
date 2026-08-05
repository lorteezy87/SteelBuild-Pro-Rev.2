// Probe: does web-ifc expose element type the way the viewer assumes?
import * as WebIFC from "web-ifc";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const api = new WebIFC.IfcAPI();
api.SetWasmPath(path.resolve("node_modules/web-ifc") + path.sep, true);
await api.Init();
const modelID = api.OpenModel(new Uint8Array(fs.readFileSync(process.argv[2])));

console.log("typeof api.GetLineType:", typeof api.GetLineType);
for (const t of ["IFCBEAM", "IFCCOLUMN", "IFCPLATE", "IFCMEMBER"]) {
  const ids = api.GetLineIDsWithType(modelID, WebIFC[t]);
  if (!ids.size()) { console.log(t, "none"); continue; }
  const eid = ids.get(0);
  const line = api.GetLine(modelID, eid);
  let glt = "n/a";
  try { glt = api.GetLineType(modelID, eid); } catch (e) { glt = "THREW: " + e.message; }
  console.log(`${t}: const=${WebIFC[t]} line.type=${line?.type} GetLineType=${glt} matchLineType=${line?.type === WebIFC[t]} matchGLT=${glt === WebIFC[t]}`);
}
api.CloseModel(modelID);
