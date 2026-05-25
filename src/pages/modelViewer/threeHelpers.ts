import * as THREE from "three";

export function inferType(name) {
  const n = (name || "").toUpperCase();
  if (/COL|COLUMN|PILLAR|POST/.test(n)) return "COLUMN";
  if (/GIR|GIRDER|MAINBEAM/.test(n)) return "GIRDER";
  if (/BM|BEAM|JOIST|PURLIN/.test(n)) return "BEAM";
  if (/SLAB|DECK|FLOOR|PLATE/.test(n)) return "SLAB";
  if (/BRAC|BRACE|DIAGONAL|HSS/.test(n)) return "BRACE";
  if (/STAIR|STEP|RISER/.test(n)) return "STAIR";
  if (/WALL|SHEAR/.test(n)) return "WALL";
  return "MEMBER";
}

export const TYPE_COLORS = {
  COLUMN: "#9B59B6", GIRDER: "#2C3E50", BEAM: "#3498DB", SLAB: "#27AE60",
  BRACE: "#E67E22", STAIR: "#F1C40F", WALL: "#95A5A6", MEMBER: "#7F8C8D",
};

// ─── WORK PACKAGE MATCHING ───────────────────────────────────────
export function matchElementToWorkPackage(elementName, workPackages) {
  if (!elementName || !workPackages?.length) return null;

  const name = elementName.toUpperCase().trim();

  // Try exact match on work package number
  let match = workPackages.find(wp => wp.wp_number?.toUpperCase() === name);
  if (match) return match;

  // Try partial match (e.g., "BM-101" matches "WP-001-BM-101")
  match = workPackages.find(wp => name.includes(wp.wp_number?.toUpperCase()) || wp.wp_number?.toUpperCase().includes(name));
  if (match) return match;

  // Try matching common patterns like "W12x26-BM-101" to "BM-101"
  const patterns = [
    /-([A-Z]+-\d+)$/i,  // ends with -TYPE-NUMBER
    /([A-Z]+-\d+)/i,     // contains TYPE-NUMBER
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      const code = match[1];
      const wp = workPackages.find(wp => wp.wp_number?.toUpperCase().includes(code));
      if (wp) return wp;
    }
  }

  return null;
}

export function getStatusColor(status, progress = 0) {
  const s = String(status || "").toLowerCase();
  if (s.includes("complete") || s.includes("delivered") || s.includes("erected")) return "#22c55e"; // green
  if (s.includes("progress") || s.includes("fabrication") || s.includes("in progress")) return "#f59e0b"; // amber
  if (s.includes("planned") || s.includes("scheduled")) return "#6b7280"; // gray
  if (progress > 0) return "#3b82f6"; // blue for in progress
  return "#9ca3af"; // default gray
}

// ─── MATERIAL NORMALIZATION ──────────────────────────────────────
// IFC files frequently bake transparency into glass / cladding materials.
// On a white background that produces a "ghost" model. We force every
// material opaque (unless it's intentionally fully transparent — opacity 0),
// re-enable depth writes, and double-side so back-faces aren't dropped.
// We also run this on every tile streaming update because @thatopen/fragments
// builds new BIMMesh tiles asynchronously after load() resolves.
export function materialList(material) {
  if (!material) return [];
  return Array.isArray(material) ? material.filter(Boolean) : [material];
}

export function isRenderableMesh(child) {
  if (!child?.isMesh) return false;
  const position = child.geometry?.attributes?.position;
  return Boolean(position?.array && typeof position.count === "number" && position.count > 0);
}

export function normalizeMaterials(root) {
  if (!root?.traverse) return;
  const seen = new WeakSet();
  root.traverse((child) => {
    if (!child.isMesh) return;
    const mats = materialList(child.material);
    for (const m of mats) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (m.transparent || (typeof m.opacity === "number" && m.opacity < 1)) {
        const op = typeof m.opacity === "number" ? m.opacity : 1;
        if (op >= 0.4) {
          m.transparent = false;
          m.opacity = 1;
          m.depthWrite = true;
        } else {
          m.transparent = true;
          m.opacity = Math.max(op, 0.55);
          m.depthWrite = false;
        }
      }
      m.side = THREE.DoubleSide;
      // Lift near-white colors to a light steel tone so they don't blow out
      if (m.color && m.color.r > 0.97 && m.color.g > 0.97 && m.color.b > 0.97) {
        m.color.setHex(0x9aa0a8);
      }
      // Set PBR metallic properties for realistic steel look — if the material
      // supports metalness/roughness (MeshStandardMaterial or MeshPhysicalMaterial)
      if ("metalness" in m) {
        m.metalness = Math.min(m.metalness ?? 0.25, 0.35);
      }
      if ("roughness" in m) {
        m.roughness = Math.max(m.roughness ?? 0.65, 0.55);
      }
      // Turn off flat shading that some IFC exporters bake in
      if (m.flatShading) {
        m.flatShading = false;
      }
      m.needsUpdate = true;
    }
  });
}

// Default steel color — a warm grey that reads as shop-primer steel under
// ACES tone mapping with our studio environment map.
export const DEFAULT_STEEL_COLOR = new THREE.Color(0.62, 0.63, 0.65); // light primer grey
export const GREY_THRESHOLD = 0.08; // how close r/g/b must be to count as "grey"

export function isUncoloredMaterial(mat) {
  if (!mat?.color) return true;
  const { r, g, b } = mat.color;
  if (![r, g, b].every(Number.isFinite)) return true;
  const avg = (r + g + b) / 3;
  if (avg < 0.05 || avg > 0.95) return true;
  const spread = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
  return spread < GREY_THRESHOLD;
}

// Apply default steel color + PBR metallic properties to any mesh whose
// material is uncolored (near-black, near-white, or pure grey). Called
// during model load before status-based coloring so the baseline isn't
// white/black ghosts. With the ACES tone mapping + env map, these
// properties produce realistic brushed-steel reflections.
// Extract a meaningful name from an IFC/GLTF mesh by checking multiple
// metadata sources before falling back to a generic "Element N" label.
export function extractElementName(child, index) {
  // Direct mesh name (set by some IFC exporters / GLTF)
  if (child.name && !/^(Mesh|mesh|Object|Group|root|Scene)\d*$/i.test(child.name)) {
    return child.name;
  }
  // Check userData for IFC properties
  const ud = child.userData || {};
  const candidates = [ud.Name, ud.name, ud.ObjectType, ud.Tag, ud.type, ud.ifcType, ud.GlobalId];
  for (const c of candidates) {
    if (c && String(c).trim() && !/^\d+$/.test(String(c).trim())) {
      return String(c).trim();
    }
  }
  // expressID — prefix with parent type or "IFC Element"
  const eid = ud.expressID || ud.globalId || ud.guid;
  if (eid) {
    let parent = child.parent;
    let depth = 0;
    while (parent && depth < 3) {
      if (parent.name && !/^(Mesh|mesh|Object|Group|root|Scene)\d*$/i.test(parent.name)) {
        return `${parent.name} #${eid}`;
      }
      parent = parent.parent;
      depth++;
    }
    return `IFC Element #${eid}`;
  }
  // Check parent names for hierarchy context
  let parent = child.parent;
  let depth = 0;
  while (parent && depth < 3) {
    if (parent.name && !/^(Mesh|mesh|Object|Group|root|Scene)\d*$/i.test(parent.name)) {
      return `${parent.name} part ${index + 1}`;
    }
    parent = parent.parent;
    depth++;
  }
  // Geometry-based descriptive name
  try {
    const box = new THREE.Box3().setFromObject(child);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const minDim = Math.min(size.x, size.y, size.z);
      const ratio = maxDim / Math.max(minDim, 0.001);
      if (ratio > 8) return `Linear Member ${index + 1}`;
      if (ratio > 3) return `Frame Member ${index + 1}`;
      if (size.y < size.x * 0.15 && size.y < size.z * 0.15) return `Plate ${index + 1}`;
    }
  } catch { /* ignore geometry errors */ }
  return `Element ${index + 1}`;
}

export function applyStatusBasedColor(root, workPackages, currentMembers = []) {
  if (!root?.traverse) return;
  root.traverse((child) => {
    if (!child.isMesh) return;

    // Find the member data for this mesh
    const memberData = currentMembers.find(m => m.mesh === child);
    if (memberData?.workPackage) {
      const statusColor = getStatusColor(memberData.workPackage.status, memberData.workPackage.percent_complete);
      const mats = materialList(child.material);
      for (const mat of mats) {
        if (mat?.color?.setStyle) {
          mat.color.setStyle(statusColor);
          mat.needsUpdate = true;
        }
      }
    } else if (isUncoloredMaterial(child.material)) {
      // Apply default steel color for uncolored, unlinked elements
      const mats = materialList(child.material);
      for (const mat of mats) {
        if (mat?.color?.copy) {
          mat.color.copy(DEFAULT_STEEL_COLOR);
          mat.needsUpdate = true;
        }
      }
    }
  });
}

// ─── REALISTIC MATERIAL PASS ─────────────────────────────────────
// Default appearance. Gives bare structural steel a metallic PBR finish so
// the studio environment map produces real metal reflections (instead of the
// flat "painted" look the conservative metalness cap in normalizeMaterials
// leaves), and gives slabs / decks / walls / foundations a matte concrete
// look. Runs AFTER normalizeMaterials, so it intentionally overrides that
// cap. The alternative is the work-package "Status" colour heatmap.
export const REALISTIC_STEEL = new THREE.Color(0.50, 0.53, 0.58);    // cool bare-steel grey
export const REALISTIC_CONCRETE = new THREE.Color(0.74, 0.72, 0.68); // matte concrete grey
export function applyRealisticMaterials(root) {
  if (!root?.traverse) return;
  root.traverse((child) => {
    if (!child.isMesh) return;
    const ud = child.userData || {};
    const name = `${child.name || ""} ${ud.Name || ud.type || ud.ObjectType || ""}`.toUpperCase();
    const isConcrete = /SLAB|DECK|FLOOR|CONC|FOUND|FOOTING|GROUT|PIER|WALL/.test(name);
    const mats = materialList(child.material);
    for (const mat of mats) {
      if (!mat) continue;
      if (mat.color?.copy) mat.color.copy(isConcrete ? REALISTIC_CONCRETE : REALISTIC_STEEL);
      if ("metalness" in mat) mat.metalness = isConcrete ? 0.0 : 0.85;
      if ("roughness" in mat) mat.roughness = isConcrete ? 0.92 : 0.42;
      if ("envMapIntensity" in mat) mat.envMapIntensity = isConcrete ? 0.25 : 1.15;
      mat.needsUpdate = true;
    }
  });
}

// Shadow-pass helper — enable cast/receive on renderable meshes so the
// shadow ground plane catches them and model self-shadowing works.
export function enableShadows(root) {
  if (!root?.traverse) return;
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}
