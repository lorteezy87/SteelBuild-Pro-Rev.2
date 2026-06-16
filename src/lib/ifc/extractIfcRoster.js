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
 * Deterministic, no AI — the caller stages a count summary for confirmation
 * (§30) before committing via services/ifcRosterImport.
 */
import { getEngine } from "@/lib/ifc/ifcEngine";

const PART_TYPES = ["IFCBEAM", "IFCCOLUMN", "IFCPLATE", "IFCMEMBER"];

/**
 * @param {ArrayBuffer} buffer
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ schema: string, rows: Array<object>,
 *   summary: { parts: number, assemblies: number, byType: Record<string, number> } }>}
 */
export async function extractIfcRoster(buffer, onProgress) {
  const { api, WebIFC } = await getEngine();
  const modelID = api.OpenModel(new Uint8Array(buffer), { COORDINATE_TO_ORIGIN: true });
  try {
    const schema = api.GetModelSchema?.(modelID) || "IFC";
    const rows = [];
    const byType = {};
    const assemblies = new Set();

    const idLists = PART_TYPES.map((t) => api.GetLineIDsWithType(modelID, WebIFC[t]));
    const total = idLists.reduce((sum, list) => sum + list.size(), 0);
    let done = 0;

    for (let ti = 0; ti < PART_TYPES.length; ti += 1) {
      const ids = idLists[ti];
      const typeName = PART_TYPES[ti].replace("IFC", "").toLowerCase(); // beam/column/plate/member
      for (let i = 0; i < ids.size(); i += 1) {
        const eid = ids.get(i);
        let guid;
        let name;
        const marks = {};
        try {
          const el = api.GetLine(modelID, eid);
          guid = el?.GlobalId?.value;
          name = el?.Name?.value;
          const psets = await api.properties.getPropertySets(modelID, eid, true);
          for (const ps of psets || []) {
            if (ps?.Name?.value !== "Part Properties") continue;
            for (const p of ps.HasProperties || []) {
              const k = p?.Name?.value;
              const v = p?.NominalValue?.value;
              if (k === "Assembly Mark") marks.assembly = v;
              else if (k === "Part Mark") marks.part = v;
              else if (k === "Sequence (Phase)") marks.seq = v;
            }
          }
        } catch { /* skip unreadable element */ }

        done += 1;
        // Yield to the event loop periodically so a big model (10k+ parts) doesn't
        // freeze the tab while extracting — the UI stays responsive + progress ticks.
        if (done % 250 === 0) {
          onProgress?.(done, total);
          await new Promise((r) => setTimeout(r, 0));
        }

        const pieceMark = marks.assembly || marks.part;
        if (!guid || !pieceMark) continue; // need both to be useful (GUID joins geometry)

        if (marks.assembly) assemblies.add(String(marks.assembly));
        byType[typeName] = (byType[typeName] || 0) + 1;

        rows.push({
          element_guid: String(guid),
          piece_mark: String(pieceMark),
          assembly_mark: marks.assembly != null ? String(marks.assembly) : null,
          part_mark: marks.part != null ? String(marks.part) : null,
          sequence_number: marks.seq != null ? String(marks.seq) : null,
          name: name != null ? String(name) : null,
          ifc_type: typeName,
          quantity: 1,
        });
      }
    }

    onProgress?.(total, total);
    return { schema, rows, summary: { parts: rows.length, assemblies: assemblies.size, byType } };
  } finally {
    try { api.CloseModel(modelID); } catch { /* ignore */ }
  }
}
