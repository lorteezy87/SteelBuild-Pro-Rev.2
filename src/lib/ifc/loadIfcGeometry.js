/**
 * loadIfcGeometry.js — turn an IFC ArrayBuffer into a three.js Group, keyed for
 * status-coloring + picking. The self-hosted half of the Detailing Control
 * Center 3D viewer (web-ifc 0.0.77 + three 0.184).
 *
 * Lives in its own module so it's the only thing the lazy viewer chunk pulls in
 * web-ifc/three through — the ~1.2 MB wasm + three never touch the main bundle.
 *
 * Geometry only here (fast: StreamAllMeshes + a cheap GetLine for each element's
 * IFC GlobalId). Per-element PROPERTY reads (assembly/part mark, sequence) are
 * deferred to pickInfo() on click, so opening the model never pays for parsing
 * property sets on 2,600+ members up front. The roster importer
 * (extractIfcRoster.js) does the full property pass once, on upload.
 */
import * as THREE from "three";
import { getEngine } from "@/lib/ifc/ifcEngine";

/**
 * @param {ArrayBuffer} buffer  raw .ifc bytes
 * @param {object} [opts]
 * @param {(guid: string) => string|undefined} [opts.colorForGuid]  hex per GlobalId
 * @param {string} [opts.defaultColor]  hex for unmatched/unstatused members
 * @returns {Promise<{ group: THREE.Group, dispose: () => void, count: number,
 *   pickInfo: (expressID: number) => object, recolor: (fn) => void }>}
 */
export async function loadIfcGeometry(buffer, opts = {}) {
  const { api } = await getEngine();
  const defaultColor = opts.defaultColor || "#9aa4b2";

  const modelID = api.OpenModel(new Uint8Array(buffer), {
    COORDINATE_TO_ORIGIN: true,
  });

  const group = new THREE.Group();
  group.name = "ifc-model";
  const materials = []; // track for recolor + dispose, parallel to children

  // Reusable scratch so we don't allocate a Matrix4 per placed geometry.
  const m4 = new THREE.Matrix4();

  api.StreamAllMeshes(modelID, (flatMesh) => {
    const expressID = flatMesh.expressID;
    let guid;
    try { guid = api.GetLine(modelID, expressID)?.GlobalId?.value; } catch { /* no guid */ }

    const placed = flatMesh.geometries;
    for (let i = 0; i < placed.size(); i++) {
      const pg = placed.get(i);
      const geom = api.GetGeometry(modelID, pg.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

      // web-ifc packs [px,py,pz, nx,ny,nz] per vertex (stride 6).
      const positions = new Float32Array(verts.length / 2);
      const normals = new Float32Array(verts.length / 2);
      for (let v = 0; v < verts.length; v += 6) {
        const o = (v / 6) * 3;
        positions[o] = verts[v]; positions[o + 1] = verts[v + 1]; positions[o + 2] = verts[v + 2];
        normals[o] = verts[v + 3]; normals[o + 1] = verts[v + 4]; normals[o + 2] = verts[v + 5];
      }

      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      bg.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      bg.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));

      // The IFC carries a per-member color (Tekla "ViewColors:On" — class/material
      // colors). Use it as the base so the model is recognizable on its own;
      // status colors overlay on top when a piece has a status (see recolor).
      const c = pg.color || { x: 0.62, y: 0.66, z: 0.72, w: 1 };
      const ifcHex = `#${new THREE.Color(c.x, c.y, c.z).getHexString()}`;
      const statusHex = guid ? opts.colorForGuid?.(guid) : null;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(statusHex || ifcHex),
        metalness: 0.2,
        roughness: 0.72,
        transparent: c.w < 1,
        opacity: c.w < 1 ? c.w : 1,
      });
      const mesh = new THREE.Mesh(bg, mat);
      m4.fromArray(pg.flatTransformation);
      mesh.applyMatrix4(m4);
      mesh.userData = { expressID, guid };
      group.add(mesh);
      materials.push({ mat, guid, ifcHex });

      geom.delete();
    }
  });

  // Re-color in place when status data changes (no reload): a piece shows its
  // status color when it has one, otherwise falls back to its native IFC color.
  const recolor = (colorForGuid) => {
    for (const { mat, guid, ifcHex } of materials) {
      mat.color.set((guid && colorForGuid?.(guid)) || ifcHex || defaultColor);
    }
  };

  // On-click detail: read the part's marks/sequence from the "Part Properties"
  // PSet (Tekla 2024 export — verified against the real 25116 model).
  // getPropertySets is async in web-ifc, so this is too.
  const pickInfo = async (expressID) => {
    const out = { expressID };
    try {
      const el = api.GetLine(modelID, expressID);
      out.guid = el?.GlobalId?.value;
      out.name = el?.Name?.value;
      const psets = await api.properties.getPropertySets(modelID, expressID, true);
      for (const ps of psets || []) {
        if (ps?.Name?.value !== "Part Properties") continue;
        for (const p of ps.HasProperties || []) {
          const k = p?.Name?.value;
          if (k === "Assembly Mark") out.assemblyMark = p?.NominalValue?.value;
          else if (k === "Part Mark") out.partMark = p?.NominalValue?.value;
          else if (k === "Sequence (Phase)") out.sequence = p?.NominalValue?.value;
        }
      }
    } catch { /* ignore */ }
    return out;
  };

  const dispose = () => {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    try { api.CloseModel(modelID); } catch { /* ignore */ }
  };

  return { group, dispose, count: group.children.length, pickInfo, recolor };
}
