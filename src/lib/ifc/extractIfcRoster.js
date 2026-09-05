/**
 * extractIfcRoster.js — parse an IFC export into a staged piece roster, one row
 * per steel part keyed by its IFC GlobalId. This is what backfills
 * model_elements.element_guid (the geometry↔status join the schema was built
 * for) so the viewer can color by fab status.
 *
 * Grain = PART (IfcBeam/Column/Plate/Member), not assembly: the rendered meshes
 * are parts, so coloring needs part GUIDs. `piece_mark` carries the ASSEMBLY
 * mark (the shippable/erectable piece production status tracks), so many part
 * rows share a piece_mark and roll up to one assembly. Verified against the real
 * Tekla 2024 export (marks in the "Part Properties" PSet).
 *
 * Performance contract (this is the step that used to kill the tab on big
 * jobs): everything is O(lines). The marks are read with ONE pass over
 * IfcRelDefinesByProperties → (part expressID → marks), instead of web-ifc's
 * `getPropertySets(elementID)`, which does an inverse-relationship scan of every
 * IfcRelDefinesByProperties line per element (O(parts × rels) — ~26k parts ×
 * ~130k rels was minutes of blocked main thread and a Safari tab kill, so the
 * save never reached the network). The extractor can also borrow the viewer's
 * already-open model instead of parsing the IFC a second time, which halves
 * peak wasm memory on the save path.
 *
 * Deterministic, no AI — the caller stages a count summary for confirmation
 * (§30) before committing via services/ifcRosterImport.
 */
import { getEngine } from "@/lib/ifc/ifcEngine";

const PART_TYPES = ["IFCBEAM", "IFCCOLUMN", "IFCPLATE", "IFCMEMBER"];
const PSET_NAME = "Part Properties";
/** Lines processed between event-loop yields (keeps progress + UI alive). */
const YIELD_EVERY = 500;

export const MODEL_CLOSED_MESSAGE =
  "The 3D model was closed before its piece list finished reading. Reload the IFC and save again.";

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * Read the marks out of one "Part Properties" IfcPropertySet. Returns null when
 * the pset is a different one or carries none of the marks we track.
 */
function readPartMarks(api, modelID, psetId) {
  let pset;
  try { pset = api.GetLine(modelID, psetId); } catch { return null; }
  if (pset?.Name?.value !== PSET_NAME) return null;
  const marks = {};
  let found = false;
  for (const handle of asArray(pset.HasProperties)) {
    let prop = handle;
    // Non-flattened GetLine hands back refs ({ value: expressID }); resolve them.
    if (prop && prop.Name === undefined && prop.value != null) {
      try { prop = api.GetLine(modelID, prop.value); } catch { continue; }
    }
    const key = prop?.Name?.value;
    const value = prop?.NominalValue?.value;
    if (value == null || value === "") continue;
    if (key === "Assembly Mark") { marks.assembly = value; found = true; }
    else if (key === "Part Mark") { marks.part = value; found = true; }
    else if (key === "Sequence (Phase)") { marks.seq = value; found = true; }
  }
  return found ? marks : null;
}

/**
 * One pass over IfcRelDefinesByProperties: part expressID → { assembly, part, seq }.
 * Property sets are parsed once each (Tekla writes one pset per part, but a
 * shared pset is legal), and only relationships that touch a rostered part are
 * followed.
 *
 * @param {{ api: object, WebIFC: object, modelID: number }} model
 * @param {Map<number, string>} partIds  expressID → part type name
 * @param {(done: number, total: number) => (void|Promise<void>)} [onTick]
 */
export async function buildPartMarksIndex(model, partIds, onTick) {
  const { api, WebIFC, modelID } = model;
  const marksByPset = new Map();
  const marksByPart = new Map();
  const rels = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
  const total = rels.size();
  for (let i = 0; i < total; i += 1) {
    if ((i + 1) % YIELD_EVERY === 0) await onTick?.(i + 1, total);
    let rel;
    try { rel = api.GetLine(modelID, rels.get(i)); } catch { continue; }
    const related = asArray(rel?.RelatedObjects);
    let touchesPart = false;
    for (const ref of related) {
      if (partIds.has(ref?.value)) { touchesPart = true; break; }
    }
    if (!touchesPart) continue;
    const psetId = rel?.RelatingPropertyDefinition?.value;
    if (psetId == null) continue;
    let marks = marksByPset.get(psetId);
    if (marks === undefined) {
      marks = readPartMarks(api, modelID, psetId);
      marksByPset.set(psetId, marks);
    }
    if (!marks) continue;
    for (const ref of related) {
      const eid = ref?.value;
      if (!partIds.has(eid)) continue;
      const prev = marksByPart.get(eid);
      // First pset wins per key; a second "Part Properties" only fills gaps.
      marksByPart.set(eid, prev ? { ...marks, ...prev } : marks);
    }
  }
  return marksByPart;
}

/**
 * Extract the roster from an ALREADY OPEN web-ifc model. Does not close it.
 *
 * @param {{ api: object, WebIFC: object, modelID: number }} model
 * @param {(done: number, total: number, phase: "index"|"parts") => void} [onProgress]
 */
export async function extractRosterFromModel(model, onProgress) {
  const { api, WebIFC, modelID } = model;
  const isOpen = () => {
    try { return typeof api.IsModelOpen === "function" ? api.IsModelOpen(modelID) : true; } catch { return true; }
  };
  const assertOpen = () => { if (!isOpen()) throw new Error(MODEL_CLOSED_MESSAGE); };

  const schema = api.GetModelSchema?.(modelID) || "IFC";

  // expressID → part type, in the type order the old extractor used so rows and
  // byType counts are stable across versions.
  const partIds = new Map();
  for (const type of PART_TYPES) {
    const typeName = type.replace("IFC", "").toLowerCase(); // beam/column/plate/member
    const ids = api.GetLineIDsWithType(modelID, WebIFC[type]);
    for (let i = 0; i < ids.size(); i += 1) partIds.set(ids.get(i), typeName);
  }
  const total = partIds.size;
  onProgress?.(0, total, "index");

  const marksByPart = await buildPartMarksIndex(model, partIds, async (done, relTotal) => {
    assertOpen();
    onProgress?.(done, relTotal, "index");
    await yieldToUi();
  });
  assertOpen();

  const rows = [];
  const byType = {};
  const assemblies = new Set();
  const seenGuids = new Set();
  let done = 0;

  for (const [eid, typeName] of partIds) {
    done += 1;
    if (done % YIELD_EVERY === 0) {
      assertOpen();
      onProgress?.(done, total, "parts");
      await yieldToUi();
    }

    let guid;
    let name;
    try {
      const el = api.GetLine(modelID, eid);
      guid = el?.GlobalId?.value;
      name = el?.Name?.value;
    } catch { continue; /* unreadable element */ }

    const marks = marksByPart.get(eid) || {};
    const pieceMark = marks.assembly || marks.part;
    if (!guid || !pieceMark) continue; // need both to be useful (GUID joins geometry)
    // model_elements has a unique (model_id, element_guid) index; a duplicated
    // GlobalId in the export must not 23505 the whole save.
    const guidKey = String(guid);
    if (seenGuids.has(guidKey)) continue;
    seenGuids.add(guidKey);

    if (marks.assembly) assemblies.add(String(marks.assembly));
    byType[typeName] = (byType[typeName] || 0) + 1;

    rows.push({
      element_guid: guidKey,
      piece_mark: String(pieceMark),
      assembly_mark: marks.assembly != null ? String(marks.assembly) : null,
      part_mark: marks.part != null ? String(marks.part) : null,
      sequence_number: marks.seq != null ? String(marks.seq) : null,
      name: name != null ? String(name) : null,
      ifc_type: typeName,
      quantity: 1,
    });
  }
  assertOpen();

  onProgress?.(total, total, "parts");
  return { schema, rows, summary: { parts: rows.length, assemblies: assemblies.size, byType } };
}

/**
 * @param {ArrayBuffer} buffer
 * @param {(done: number, total: number, phase: "index"|"parts") => void} [onProgress]
 * @param {object} [opts]
 * @param {{ modelID: number, isOpen?: () => boolean }|null} [opts.model]
 *   An open model handle (from loadIfcGeometry) to read from instead of parsing
 *   `buffer` again. Left open on return; ignored when it is no longer open.
 * @returns {Promise<{ schema: string, rows: Array<object>,
 *   summary: { parts: number, assemblies: number, byType: Record<string, number> } }>}
 */
export async function extractIfcRoster(buffer, onProgress, opts = {}) {
  const { api, WebIFC } = await getEngine();

  const borrowed = opts.model;
  if (borrowed && Number.isInteger(borrowed.modelID)) {
    let open = false;
    try {
      open = typeof borrowed.isOpen === "function"
        ? !!borrowed.isOpen()
        : (typeof api.IsModelOpen === "function" ? api.IsModelOpen(borrowed.modelID) : false);
    } catch { open = false; }
    if (open) return extractRosterFromModel({ api, WebIFC, modelID: borrowed.modelID }, onProgress);
  }

  const modelID = api.OpenModel(new Uint8Array(buffer), { COORDINATE_TO_ORIGIN: true });
  try {
    return await extractRosterFromModel({ api, WebIFC, modelID }, onProgress);
  } finally {
    try { api.CloseModel(modelID); } catch { /* ignore */ }
  }
}
