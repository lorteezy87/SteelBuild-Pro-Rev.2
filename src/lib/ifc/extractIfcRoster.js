/**
 * extractIfcRoster.js — parse an IFC export into a staged piece roster, one row
 * per steel part keyed by its IFC GlobalId. This is what backfills
 * model_elements.element_guid (the geometry↔status join the schema was built
 * for) so the viewer can color by fab status.
 *
 * Grain = PART (IfcBeam/Column/Plate/Member, plus IfcBuildingElementProxy for
 * exports that never mapped their parts), not assembly: the rendered meshes are
 * parts, so coloring needs part GUIDs. `piece_mark` carries the ASSEMBLY mark
 * (the shippable/erectable piece production status tracks), so many part rows
 * share a piece_mark and roll up to one assembly.
 *
 * Where the marks come from — in priority order, per part:
 *   1. Any attached IfcPropertySet whose properties are named like a mark
 *      ("Assembly Mark", "Assembly/Cast unit Mark", "Part Mark", "Member
 *      Piecemark", …). The S&H Tekla config writes a custom "Part Properties"
 *      set; Tekla's stock config writes "Tekla Common" / "Tekla Assembly";
 *      SDS/2 writes its own. Keys are matched normalized, so all of them work.
 *   2. IfcElement.Tag (Tekla writes the part position there) as the part mark.
 *   Nothing → the part is skipped and counted in `diagnostics`, which the UI
 *   turns into a message naming what WAS in the file.
 *
 * Performance contract (this is the step that used to kill the tab on big
 * jobs): everything is O(lines). Marks are read with ONE pass over
 * IfcRelDefinesByProperties → (part expressID → marks), instead of web-ifc's
 * `getPropertySets(elementID)`, which does an inverse-relationship scan of every
 * IfcRelDefinesByProperties line per element (O(parts × rels)). The extractor
 * can also borrow the viewer's already-open model instead of parsing the IFC a
 * second time, which halves peak wasm memory on the save path.
 *
 * Deterministic, no AI — the caller stages a count summary for confirmation
 * (§30) before committing via services/ifcRosterImport.
 */
import { getEngine } from "@/lib/ifc/ifcEngine";

/** IFC entity → roster ifc_type. Order is the historical one (stable byType). */
export const PART_TYPES = [
  ["IFCBEAM", "beam"],
  ["IFCCOLUMN", "column"],
  ["IFCPLATE", "plate"],
  ["IFCMEMBER", "member"],
  ["IFCBUILDINGELEMENTPROXY", "proxy"],
];

/** Entities counted for the "nothing usable" diagnostic (not rostered). */
const OTHER_TYPES = [
  "IFCELEMENTASSEMBLY", "IFCMECHANICALFASTENER", "IFCDISCRETEACCESSORY", "IFCFASTENER",
  "IFCWALL", "IFCWALLSTANDARDCASE", "IFCSLAB", "IFCFOOTING", "IFCRAILING", "IFCSTAIR",
  "IFCSTAIRFLIGHT", "IFCCURTAINWALL", "IFCDOOR", "IFCWINDOW", "IFCFURNISHINGELEMENT",
  "IFCBUILDINGELEMENTPART", "IFCREINFORCINGBAR", "IFCPILE", "IFCCOVERING", "IFCFLOWSEGMENT",
];

/** Lines processed between event-loop yields (keeps progress + UI alive). */
const YIELD_EVERY = 500;

export const MODEL_CLOSED_MESSAGE =
  "The 3D model was closed before its piece list finished reading. Reload the IFC and save again.";

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** "Assembly/Cast unit Mark" → "assemblycastunitmark" */
export const normalizeKey = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Property names that carry each mark, normalized, best first. Covers the S&H
 * custom Tekla set ("Part Properties"), Tekla's stock sets, SDS/2, and the
 * common template-attribute spellings.
 */
export const MARK_KEYS = {
  assembly: [
    "assemblymark", "assemblycastunitmark", "assemblycastunitposition", "assemblyposition",
    "assemblypos", "castunitmark", "memberpiecemark", "memberpiecemarks", "mainmark", "mainpartmark",
    "assemblyname", "piecemark",
  ],
  part: [
    "partmark", "partposition", "partpos", "materialpiecemark", "materialpiecemarks", "materialmark",
    "partname", "position",
  ],
  seq: [
    "sequencephase", "sequencenumber", "sequence", "phase", "lot", "lotnumber", "erectionsequence",
    "sequenceno", "phasenumber",
  ],
};

const MARK_KEY_INDEX = new Map();
for (const [field, keys] of Object.entries(MARK_KEYS)) {
  keys.forEach((k, rank) => { if (!MARK_KEY_INDEX.has(k)) MARK_KEY_INDEX.set(k, { field, rank }); });
}

/** A value that looks like a piece mark (not a GUID, not a sentence, not blank). */
export function looksLikeMark(v) {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s || s.length > 32) return false;
  if (/^[0-9A-Za-z_$]{22}$/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s)) return false; // IFC GUID
  return /^[A-Za-z0-9][A-Za-z0-9 ._\-/()]*$/.test(s) && !/\s{2,}/.test(s);
}

function readPropertyValue(api, modelID, handle) {
  let prop = handle;
  // Non-flattened GetLine hands back refs ({ value: expressID }); resolve them.
  if (prop && prop.Name === undefined && prop.value != null) {
    try { prop = api.GetLine(modelID, prop.value); } catch { return null; }
  }
  const key = prop?.Name?.value;
  if (key == null) return null;
  // IfcPropertySingleValue → NominalValue; enumerated / list values are rare for marks.
  let value = prop?.NominalValue?.value;
  if (value == null) {
    const ev = asArray(prop?.EnumerationValues)[0];
    value = ev?.value;
  }
  if (value == null || value === "") return null;
  return { key: String(key), value: String(value).trim() };
}

/**
 * Read the marks out of one IfcPropertySet, whatever it is called. Returns
 * `{ marks, setName, keys }` where `marks` is null when nothing matched;
 * `keys` lists the property names seen (for diagnostics).
 */
function readMarksFromPset(api, modelID, psetId) {
  let pset;
  try { pset = api.GetLine(modelID, psetId); } catch { return { marks: null, setName: null, keys: [] }; }
  const setName = pset?.Name?.value != null ? String(pset.Name.value) : null;
  const keys = [];
  const best = {}; // field → { rank, value }
  for (const handle of asArray(pset?.HasProperties)) {
    const p = readPropertyValue(api, modelID, handle);
    if (!p) continue;
    keys.push(p.key);
    const hit = MARK_KEY_INDEX.get(normalizeKey(p.key));
    if (!hit) continue;
    if (hit.field !== "seq" && !looksLikeMark(p.value)) continue;
    const prev = best[hit.field];
    if (!prev || hit.rank < prev.rank) best[hit.field] = { rank: hit.rank, value: p.value };
  }
  const marks = {};
  let found = false;
  for (const field of ["assembly", "part", "seq"]) {
    if (best[field]) { marks[field] = best[field].value; marks[`${field}Rank`] = best[field].rank; found = true; }
  }
  return { marks: found ? marks : null, setName, keys };
}

/** Merge marks from two psets: better (lower) rank wins per field. */
function mergeMarks(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  for (const field of ["assembly", "part", "seq"]) {
    const rb = b[`${field}Rank`];
    if (b[field] == null) continue;
    if (out[field] == null || rb < out[`${field}Rank`]) { out[field] = b[field]; out[`${field}Rank`] = rb; }
  }
  return out;
}

/**
 * One pass over IfcRelDefinesByProperties: part expressID → marks. Property
 * sets are parsed once each (Tekla writes one pset per part, but a shared pset
 * is legal), and only relationships that touch a rostered part are followed.
 *
 * @param {{ api: object, WebIFC: object, modelID: number }} model
 * @param {Map<number, string>} partIds  expressID → part type name
 * @param {(done: number, total: number) => (void|Promise<void>)} [onTick]
 * @returns {Promise<{ marksByPart: Map<number, object>, psetCounts: Map<string, number>,
 *   keyCounts: Map<string, number>, relCount: number, relsTouchingParts: number }>}
 */
export async function buildPartMarksIndex(model, partIds, onTick) {
  const { api, WebIFC, modelID } = model;
  const parsedByPset = new Map();
  const marksByPart = new Map();
  const psetCounts = new Map(); // pset name → parts it was attached to
  const keyCounts = new Map(); // property name → occurrences (diagnostics)
  const rels = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
  const total = rels.size();
  let relsTouchingParts = 0;
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
    relsTouchingParts += 1;
    const psetId = rel?.RelatingPropertyDefinition?.value;
    if (psetId == null) continue;
    let parsed = parsedByPset.get(psetId);
    if (parsed === undefined) {
      parsed = readMarksFromPset(api, modelID, psetId);
      parsedByPset.set(psetId, parsed);
      for (const k of parsed.keys) keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
    }
    for (const ref of related) {
      const eid = ref?.value;
      if (!partIds.has(eid)) continue;
      const name = parsed.setName ?? "(unnamed set)";
      psetCounts.set(name, (psetCounts.get(name) ?? 0) + 1);
      if (parsed.marks) marksByPart.set(eid, mergeMarks(marksByPart.get(eid), parsed.marks));
    }
  }
  return { marksByPart, psetCounts, keyCounts, relCount: total, relsTouchingParts };
}

const topEntries = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/**
 * @typedef {{ element_guid: string, piece_mark: string, assembly_mark: string|null,
 *   part_mark: string|null, sequence_number: string|null, name: string|null,
 *   ifc_type: string, quantity: number }} RosterRow
 * @typedef {{ schema: string, partsFound: number, partsByType: Record<string, number>,
 *   otherTypes: Record<string, number>, relCount: number, relsTouchingParts: number,
 *   propertySets: Array<{ name: string, count: number }>,
 *   propertyKeys: Array<{ name: string, count: number }>, markedFromTag: number,
 *   skipped: { noGuid: number, noMark: number, duplicateGuid: number, unreadable: number } }} RosterDiagnostics
 * @typedef {{ schema: string, rows: RosterRow[],
 *   summary: { parts: number, assemblies: number, byType: Record<string, number> },
 *   diagnostics: RosterDiagnostics }} RosterResult
 */

/**
 * Extract the roster from an ALREADY OPEN web-ifc model. Does not close it.
 *
 * @param {{ api: object, WebIFC: object, modelID: number }} model
 * @param {(done: number, total: number, phase: "index"|"parts") => void} [onProgress]
 * @returns {Promise<RosterResult>}
 */
export async function extractRosterFromModel(model, onProgress) {
  const { api, WebIFC, modelID } = model;
  const isOpen = () => {
    try { return typeof api.IsModelOpen === "function" ? api.IsModelOpen(modelID) : true; } catch { return true; }
  };
  const assertOpen = () => { if (!isOpen()) throw new Error(MODEL_CLOSED_MESSAGE); };
  const countType = (name) => {
    const code = WebIFC[name];
    if (code == null) return 0;
    try { return api.GetLineIDsWithType(modelID, code).size(); } catch { return 0; }
  };

  const schema = api.GetModelSchema?.(modelID) || "IFC";

  // expressID → part type, in the type order the old extractor used so rows and
  // byType counts are stable across versions.
  const partIds = new Map();
  const partsByType = {};
  for (const [entity, typeName] of PART_TYPES) {
    const code = WebIFC[entity];
    if (code == null) continue;
    const ids = api.GetLineIDsWithType(modelID, code);
    partsByType[typeName] = ids.size();
    for (let i = 0; i < ids.size(); i += 1) partIds.set(ids.get(i), typeName);
  }
  const total = partIds.size;
  onProgress?.(0, total, "index");

  const index = await buildPartMarksIndex(model, partIds, async (done, relTotal) => {
    assertOpen();
    onProgress?.(done, relTotal, "index");
    await yieldToUi();
  });
  assertOpen();

  const rows = [];
  const byType = {};
  const assemblies = new Set();
  const seenGuids = new Set();
  const skipped = { noGuid: 0, noMark: 0, duplicateGuid: 0, unreadable: 0 };
  let markedFromTag = 0;
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
    let tag;
    try {
      const el = api.GetLine(modelID, eid);
      guid = el?.GlobalId?.value;
      name = el?.Name?.value;
      tag = el?.Tag?.value;
    } catch { skipped.unreadable += 1; continue; }

    const marks = index.marksByPart.get(eid) || {};
    let partMark = marks.part;
    // Tekla writes the part position to IfcElement.Tag; use it whenever no
    // property set supplied a part mark (with or without an assembly mark).
    if (partMark == null && looksLikeMark(tag)) {
      partMark = String(tag).trim();
      markedFromTag += 1;
    }
    const pieceMark = marks.assembly || partMark;
    if (!guid) { skipped.noGuid += 1; continue; }
    if (!pieceMark) { skipped.noMark += 1; continue; }
    // model_elements has a unique (model_id, element_guid) index; a duplicated
    // GlobalId in the export must not 23505 the whole save.
    const guidKey = String(guid);
    if (seenGuids.has(guidKey)) { skipped.duplicateGuid += 1; continue; }
    seenGuids.add(guidKey);

    if (marks.assembly) assemblies.add(String(marks.assembly));
    byType[typeName] = (byType[typeName] || 0) + 1;

    rows.push({
      element_guid: guidKey,
      piece_mark: String(pieceMark),
      assembly_mark: marks.assembly != null ? String(marks.assembly) : null,
      part_mark: partMark != null ? String(partMark) : null,
      sequence_number: marks.seq != null ? String(marks.seq) : null,
      name: name != null ? String(name) : null,
      ifc_type: typeName,
      quantity: 1,
    });
  }
  assertOpen();

  // Only pay for the "what else is in here" census when nothing was rostered.
  const otherTypes = {};
  if (rows.length === 0) {
    for (const entity of OTHER_TYPES) {
      const n = countType(entity);
      if (n > 0) otherTypes[entity.replace(/^IFC/, "").toLowerCase()] = n;
    }
  }

  onProgress?.(total, total, "parts");
  return {
    schema,
    rows,
    summary: { parts: rows.length, assemblies: assemblies.size, byType },
    diagnostics: {
      schema,
      partsFound: total,
      partsByType,
      otherTypes,
      relCount: index.relCount,
      relsTouchingParts: index.relsTouchingParts,
      propertySets: topEntries(index.psetCounts, 8).map(([name, count]) => ({ name, count })),
      propertyKeys: topEntries(index.keyCounts, 12).map(([name, count]) => ({ name, count })),
      markedFromTag,
      skipped,
    },
  };
}

/**
 * @param {ArrayBuffer} buffer
 * @param {(done: number, total: number, phase: "index"|"parts") => void} [onProgress]
 * @param {object} [opts]
 * @param {{ modelID: number, isOpen?: () => boolean }|null} [opts.model]
 *   An open model handle (from loadIfcGeometry) to read from instead of parsing
 *   `buffer` again. Left open on return; ignored when it is no longer open.
 * @returns {Promise<RosterResult>}
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
