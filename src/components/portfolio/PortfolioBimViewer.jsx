import { Children, useEffect, useMemo, useRef, useState } from "react";
import { resolveFileUrl } from "@/api/base44Client";

const FRAGMENTS_WORKER_URL = "/thatopen/fragments-worker.mjs";

const MATERIALS = [
  { type: "W-shape beam", grade: "ASTM A992", finish: "Shop primer", color: "#4f8cff" },
  { type: "HSS column", grade: "ASTM A500 Gr C", finish: "Galvanized", color: "#0f766e" },
  { type: "Plate girder", grade: "ASTM A572 Gr 50", finish: "Shop primer", color: "#c084fc" },
  { type: "Metal deck", grade: "G90 galvanized deck", finish: "Galvanized", color: "#94a3b8" },
  { type: "Connection plate", grade: "ASTM A36", finish: "Bare steel", color: "#f59e0b" },
  { type: "Joist seat", grade: "K-series joist seat", finish: "Shop primer", color: "#22c55e" },
];

const TYPE_COLORS = {
  COLUMN: "#0f766e",
  GIRDER: "#c084fc",
  BEAM: "#4f8cff",
  SLAB: "#94a3b8",
  BRACE: "#f59e0b",
  PLATE: "#f97316",
  STAIR: "#eab308",
  MEMBER: "#38bdf8",
};

const REALISTIC_STEEL_COLORS = {
  COLUMN: "#748495",
  GIRDER: "#8ca3b8",
  BEAM: "#7f98b0",
  SLAB: "#a5adb4",
  BRACE: "#6f7d88",
  PLATE: "#b79d76",
  STAIR: "#788a95",
  MEMBER: "#9cc5df",
};

const CLICK_SELECT_MAX_MOVEMENT_PX = 5;
const PROJECTED_SELECTION_PADDING_PX = 30;
const ISOLATED_CONTEXT_OPACITY = 0.38;
const COMMON_LINK_TOKENS = new Set([
  "MODEL",
  "IFC",
  "STEEL",
  "MEMBER",
  "BEAM",
  "COLUMN",
  "GIRDER",
  "PLATE",
  "SLAB",
  "DECK",
  "HSS",
  "W",
]);

function inferMemberType(name) {
  const n = String(name || "").toUpperCase();
  if (/COL|COLUMN|PILLAR|POST/.test(n)) return "COLUMN";
  if (/GIR|GIRDER|MAINBEAM/.test(n)) return "GIRDER";
  if (/BM|BEAM|JOIST|PURLIN|RAFTER/.test(n)) return "BEAM";
  if (/SLAB|DECK|FLOOR/.test(n)) return "SLAB";
  if (/BRAC|BRACE|DIAGONAL|HSS/.test(n)) return "BRACE";
  if (/PLATE|CLIP|TAB|CONNECTION/.test(n)) return "PLATE";
  if (/STAIR|STEP|RISER/.test(n)) return "STAIR";
  return "MEMBER";
}

function modelDocumentExtension(doc) {
  return String(doc?.file_name || doc?.display_name || doc?.file_url || "")
    .split(".")
    .pop()
    ?.toLowerCase() || "";
}

function modelDocumentName(doc) {
  return doc?.display_name || doc?.file_name || doc?.title || "Uploaded model";
}

function modelDocumentIdentity(doc) {
  if (!doc) return "";
  return [
    doc.id,
    doc.file_url,
    doc.display_name,
    doc.file_name,
    doc.title,
  ].filter(Boolean).join("|");
}

function workPackageModelIdentity(workPackages = []) {
  return (workPackages || []).slice(0, 42).map((wp) => [
    wp.id,
    wp.wp_number,
    wp.package_number,
    wp.work_package_number,
    wp.mark,
    wp.piece_mark,
    wp.name,
    wp.title,
    wp.status,
    wp.release_status,
    wp.phase,
    wp.percent_complete,
    wp.progress,
    wp.tonnage,
    wp.lbs,
    wp.weight_lbs,
    wp.sequence_number,
  ].map((value) => value ?? "").join("~")).join("|");
}

function normalizeLinkText(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function extractLinkTokens(...values) {
  const tokens = new Set();
  values.filter(Boolean).forEach((value) => {
    const text = String(value).toUpperCase();
    const full = normalizeLinkText(text);
    if (full.length >= 5 && !COMMON_LINK_TOKENS.has(full)) tokens.add(full);

    const matches = text.match(/[A-Z]{1,8}[-_ ]?\d{1,6}[A-Z0-9-_]*|\d{2,6}[A-Z]{0,4}/g) || [];
    matches.forEach((match) => {
      const token = normalizeLinkText(match);
      if (token.length >= 3 && !COMMON_LINK_TOKENS.has(token)) tokens.add(token);
    });
  });
  return [...tokens];
}

function workPackageLinkValues(wp) {
  if (!wp) return [];
  return [
    wp.id,
    wp.wp_number,
    wp.package_number,
    wp.work_package_number,
    wp.mark,
    wp.piece_mark,
    wp.sequence_number,
    wp.name,
    wp.title,
    wp.description,
  ].filter(Boolean);
}

function modelElementIdentity(mesh, material) {
  const data = mesh?.userData || {};
  const values = [
    mesh?.name,
    material?.name,
    data.name,
    data.Name,
    data.ObjectType,
    data.Tag,
    data.GlobalId,
    data.globalId,
    data.guid,
    data.expressID,
    data.ifcType,
    data.type,
    data.material,
  ].filter(Boolean);
  const label = values.find((value) => String(value).trim()) || "Model element";
  return {
    label: String(label),
    values,
    search: normalizeLinkText(values.join(" ")),
    tokens: extractLinkTokens(...values),
  };
}

function matchElementToWorkPackage(identity, workPackages = []) {
  if (!identity || !workPackages.length) return null;

  let best = null;
  let bestScore = 0;
  const elementTokens = new Set(identity.tokens || []);
  const elementSearch = identity.search || "";

  workPackages.forEach((wp) => {
    const values = workPackageLinkValues(wp);
    const strongValues = [
      wp.wp_number,
      wp.package_number,
      wp.work_package_number,
      wp.mark,
      wp.piece_mark,
      wp.sequence_number,
    ].filter(Boolean).map(normalizeLinkText).filter((value) => value.length >= 3);
    const packageSearch = normalizeLinkText(values.join(" "));
    const packageTokens = extractLinkTokens(...values);
    let score = 0;

    strongValues.forEach((token) => {
      if (elementSearch.includes(token) || elementTokens.has(token)) {
        score = Math.max(score, 120 + token.length);
      }
    });

    packageTokens.forEach((token) => {
      if (elementSearch.includes(token) || elementTokens.has(token)) {
        score = Math.max(score, 60 + token.length);
      }
    });

    const packageName = normalizeLinkText(wp.name || wp.title || "");
    if (packageName.length >= 8 && elementSearch.length >= 8 && (elementSearch.includes(packageName) || packageName.includes(elementSearch))) {
      score = Math.max(score, 80 + Math.min(packageName.length, 40));
    }

    if (score > bestScore) {
      best = wp;
      bestScore = score;
    }
  });

  return bestScore >= 60 ? best : null;
}

function pieceReferenceTokens(piece) {
  if (!piece) return [];
  return extractLinkTokens(
    piece.id,
    piece.linkedWorkPackageId,
    piece.mark,
    piece.name,
    piece.modelElementName,
  );
}

function firstMaterial(mesh) {
  return Array.isArray(mesh?.material) ? mesh.material[0] : mesh?.material;
}

function materialList(material) {
  if (!material) return [];
  return Array.isArray(material) ? material.filter(Boolean) : [material];
}

function isLodModelMesh(mesh) {
  if (!mesh?.isMesh) return false;
  return Boolean(
    mesh.geometry?.isLODGeometry ||
    materialList(mesh.material).some((mat) => mat?.isLodMaterial || mat?.uniforms?.lodSize)
  );
}

function isRenderableModelMesh(mesh) {
  if (!mesh?.isMesh || !mesh.geometry) return false;
  if (isLodModelMesh(mesh)) return false;
  const position = mesh.geometry.attributes?.position;
  return Boolean(position?.array && typeof position.count === "number" && position.count > 0);
}

function patchLodRenderHook(mesh) {
  if (!isLodModelMesh(mesh)) return;
  mesh.onBeforeRender = (renderer) => {
    const lodMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const lodSize = lodMaterial?.lodSize || lodMaterial?.uniforms?.lodSize?.value;
    if (lodSize?.set) renderer.getSize(lodSize);
  };
}

function createModelMaterial(THREE, sourceMaterial, typeKey = "MEMBER", viewMode = "model") {
  const material = new THREE.MeshStandardMaterial({
    color: viewMode === "material"
      ? TYPE_COLORS[typeKey] || TYPE_COLORS.MEMBER
      : REALISTIC_STEEL_COLORS[typeKey] || REALISTIC_STEEL_COLORS.MEMBER,
    metalness: viewMode === "material" ? 0.38 : 0.72,
    roughness: viewMode === "material" ? 0.5 : 0.3,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
  material.name = sourceMaterial?.name || "";
  return material;
}

function cloneMaterialSafely(THREE, material, typeKey = "MEMBER", viewMode = "model") {
  if (!material?.clone) return createModelMaterial(THREE, material, typeKey, viewMode);
  try {
    return material.clone();
  } catch {
    return createModelMaterial(THREE, material, typeKey, viewMode);
  }
}

function cloneMeshMaterials(THREE, mesh, typeKey = "MEMBER", viewMode = "model") {
  if (!mesh) return;
  if (mesh.userData?.materialsCloned) return;
  if (Array.isArray(mesh.material)) {
    const sourceMaterials = mesh.material.length > 0 ? mesh.material : [null];
    mesh.material = sourceMaterials.map((mat) =>
      mat
        ? cloneMaterialSafely(THREE, mat, typeKey, viewMode)
        : createModelMaterial(THREE, null, typeKey, viewMode)
    );
  } else {
    mesh.material = mesh.material
      ? cloneMaterialSafely(THREE, mesh.material, typeKey, viewMode)
      : createModelMaterial(THREE, null, typeKey, viewMode);
  }
  mesh.userData = { ...mesh.userData, materialsCloned: true };
}

function ensureModelMaterial(THREE, mesh, typeKey = "MEMBER", viewMode = "model") {
  const fallbackMaterial = () => createModelMaterial(THREE, null, typeKey, viewMode);

  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.length > 0
      ? mesh.material.map((mat) => mat || fallbackMaterial())
      : [fallbackMaterial()];
    return;
  }

  if (!mesh.material) {
    mesh.material = fallbackMaterial();
  }
}

function normalizeModelMaterial(THREE, mesh, typeKey = "MEMBER", viewMode = "model") {
  const materials = materialList(mesh.material);
  const realisticColor = new THREE.Color(REALISTIC_STEEL_COLORS[typeKey] || REALISTIC_STEEL_COLORS.MEMBER);
  const materialMapColor = new THREE.Color(TYPE_COLORS[typeKey] || TYPE_COLORS.MEMBER);
  materials.forEach((mat) => {
    if (!mat) return;
    mat.side = THREE.DoubleSide;
    if (mat.color) {
      mat.color.copy(viewMode === "material" ? materialMapColor : realisticColor);
    }
    if ("metalness" in mat) mat.metalness = viewMode === "material" ? 0.42 : 0.72;
    if ("roughness" in mat) mat.roughness = viewMode === "material" ? 0.48 : 0.28;
    if ("envMapIntensity" in mat) mat.envMapIntensity = 0;
    if (mat.transparent && mat.opacity >= 0.4) {
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
    }
    mat.needsUpdate = true;
  });
}

function styleRenderableMaterial(THREE, object, typeKey = "MEMBER", viewMode = "model") {
  if (!isRenderableModelMesh(object) || !object.material) return;
  cloneMeshMaterials(THREE, object, typeKey, viewMode);
  const materials = materialList(object.material);
  const realisticColor = new THREE.Color(REALISTIC_STEEL_COLORS[typeKey] || REALISTIC_STEEL_COLORS.MEMBER);
  const materialMapColor = new THREE.Color(TYPE_COLORS[typeKey] || TYPE_COLORS.MEMBER);
  materials.forEach((mat) => {
    if (!mat) return;
    if (mat.color) mat.color.copy(viewMode === "material" ? materialMapColor : realisticColor);
    if ("vertexColors" in mat) mat.vertexColors = false;
    if ("metalness" in mat) mat.metalness = viewMode === "material" ? 0.38 : 0.72;
    if ("roughness" in mat) mat.roughness = viewMode === "material" ? 0.5 : 0.3;
    if ("envMapIntensity" in mat) mat.envMapIntensity = 0;
    if ("linewidth" in mat) mat.linewidth = 1.5;
    mat.transparent = false;
    mat.opacity = 1;
    mat.needsUpdate = true;
  });
}

function disposeObject(root) {
  root?.traverse?.((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => mat?.dispose?.());
  });
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch {
    return false;
  }
}

function statusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("complete") || s.includes("delivered")) return "#22c55e";
  if (s.includes("progress") || s.includes("fabrication")) return "#f59e0b";
  if (s.includes("delay") || s.includes("hold") || s.includes("risk")) return "#ef4444";
  return "#4f8cff";
}

function pieceFromWorkPackage(wp, index, fallbackProjectName) {
  const spec = MATERIALS[index % MATERIALS.length];
  const progress = Number(wp?.percent_complete) || 0;
  const tons = Number(wp?.tonnage) || Math.max(0.8, (Number(wp?.shop_hours_budget) || 24) / 40);
  const gridX = index % 5;
  const gridZ = Math.floor(index / 5) % 4;
  const level = Math.floor(index / 20);
  const kind = index % 6;

  return {
    id: wp?.id || `generated-${index}`,
    mark: wp?.wp_number || wp?.package_number || wp?.work_package_number || `WP-${String(index + 1).padStart(3, "0")}`,
    name: wp?.name || `${fallbackProjectName || "Project"} member ${index + 1}`,
    phase: wp?.phase || "Fabrication",
    status: wp?.status || "Planned",
    progress,
    tons,
    type: spec.type,
    grade: spec.grade,
    finish: spec.finish,
    baseColor: statusColor(wp?.status) || spec.color,
    specColor: spec.color,
    crew: wp?.crew || "Unassigned",
    start: wp?.scheduled_start_date || wp?.released_date || null,
    end: wp?.scheduled_end_date || null,
    linkedWorkPackageId: wp?.id || null,
    linkStatus: wp?.id ? "Linked work package" : "Generated preview",
    shape: kind,
    position: {
      x: (gridX - 2) * 3.2,
      y: 0.35 + level * 2.4,
      z: (gridZ - 1.5) * 3.0,
    },
  };
}

function fallbackPieces(project) {
  return Array.from({ length: 18 }, (_, index) =>
    pieceFromWorkPackage(
      {
        wp_number: `SIM-${String(index + 1).padStart(3, "0")}`,
        name: ["Grid A beam", "Grid B column", "Level 2 deck", "Moment plate", "Joist line", "Roof frame"][index % 6],
        phase: ["Detailing", "Fabrication", "Delivery", "Installation"][index % 4],
        status: ["Planned", "In Progress", "Complete"][index % 3],
        percent_complete: [10, 45, 80, 100][index % 4],
        tonnage: 1.2 + index * 0.25,
      },
      index,
      project?.name,
    )
  );
}

function pieceFromUploadedMesh({
  mesh,
  material,
  index,
  typeKey,
  materialColor,
  baseColor,
  modelDocument,
  workPackages,
  projectName,
  sourceLabel = "uploaded",
}) {
  const identity = modelElementIdentity(mesh, material);
  const linkedWorkPackage = matchElementToWorkPackage(identity, workPackages);

  if (linkedWorkPackage) {
    return {
      ...pieceFromWorkPackage(linkedWorkPackage, index, projectName),
      id: linkedWorkPackage.id || `${sourceLabel}-linked-${index}`,
      type: typeKey.charAt(0) + typeKey.slice(1).toLowerCase(),
      grade: material?.name || mesh.userData?.material || "Model material",
      finish: modelDocumentName(modelDocument),
      baseColor,
      specColor: materialColor,
      source: `${sourceLabel}-linked`,
      modelElementName: identity.label,
      linkStatus: "Linked work package",
    };
  }

  return {
    id: `${sourceLabel}-${index}`,
    mark: identity.label || `${sourceLabel.toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
    name: mesh.userData?.name || mesh.name || `${sourceLabel === "ifc" ? "IFC" : "Model"} element ${index + 1}`,
    phase: "Model",
    status: "Unlinked model element",
    progress: null,
    tons: null,
    type: typeKey.charAt(0) + typeKey.slice(1).toLowerCase(),
    grade: material?.name || mesh.userData?.material || "Model material",
    finish: modelDocumentName(modelDocument),
    baseColor,
    specColor: materialColor,
    crew: "Model",
    source: sourceLabel,
    modelElementName: identity.label,
    linkedWorkPackageId: null,
    linkStatus: "No work package match",
  };
}

export default function PortfolioBimViewer({
  project,
  workPackages = [],
  deliveries = [],
  rfis = [],
  modelDocument = null,
  onUploadModel,
  onOpenProject,
  onOpenWorkPackages,
}) {
  const sectionRef = useRef(null);
  const mountRef = useRef(null);
  const fileInputRef = useRef(null);
  const apiRef = useRef(null);
  const isolatedRef = useRef(false);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [mode, setMode] = useState("model");
  const [isolated, setIsolated] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
  const [modelState, setModelState] = useState({ source: "generated", status: "idle", message: "", count: 0 });
  const [uploading, setUploading] = useState(false);
  const modelDocumentKey = useMemo(() => modelDocumentIdentity(modelDocument), [
    modelDocument?.id,
    modelDocument?.file_url,
    modelDocument?.display_name,
    modelDocument?.file_name,
    modelDocument?.title,
  ]);
  const workPackageModelKey = useMemo(() => workPackageModelIdentity(workPackages), [workPackages]);

  useEffect(() => {
    isolatedRef.current = isolated;
  }, [isolated]);

  const pieces = useMemo(() => {
    const source = (workPackages || []).slice(0, 42);
    return source.length > 0
      ? source.map((wp, index) => pieceFromWorkPackage(wp, index, project?.name))
      : fallbackPieces(project);
  }, [project?.id, project?.name, workPackageModelKey]);

  const selectedOpenRfis = useMemo(() => {
    if (!selectedPiece) return [];
    const tokens = pieceReferenceTokens(selectedPiece);
    const linkedId = String(selectedPiece.linkedWorkPackageId || selectedPiece.id || "");
    return (rfis || [])
      .filter((r) => {
        if (["Answered", "Closed", "Void"].includes(r.status)) return false;
        const directIds = [
          r.work_package_id,
          r.wp_id,
          r.package_id,
          r.linked_work_package_id,
        ].filter(Boolean).map(String);
        if (linkedId && directIds.includes(linkedId)) return true;

        const haystack = normalizeLinkText(`${r.rfi_number || ""} ${r.title || ""} ${r.description || ""} ${r.drawing_reference || ""}`);
        return tokens.some((token) => haystack.includes(token));
      })
      .slice(0, 3);
  }, [rfis, selectedPiece]);

  const deliveryForPiece = useMemo(() => {
    if (!selectedPiece) return null;
    const tokens = pieceReferenceTokens(selectedPiece);
    const linkedId = String(selectedPiece.linkedWorkPackageId || selectedPiece.id || "");
    return (deliveries || []).find((d) => {
      const directIds = [
        d.work_package_id,
        d.wp_id,
        d.package_id,
        d.linked_work_package_id,
      ].filter(Boolean).map(String);
      if (linkedId && directIds.includes(linkedId)) return true;

      const text = normalizeLinkText(`${d.description || ""} ${d.po_number || ""} ${d.vendor || ""}`);
      return tokens.some((token) => text.includes(token));
    });
  }, [deliveries, selectedPiece]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const updateLayout = () => setIsCompact(section.getBoundingClientRect().width < 760);
    updateLayout();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateLayout);
      return () => window.removeEventListener("resize", updateLayout);
    }
    const observer = new ResizeObserver(updateLayout);
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || hasEnteredViewport) return;

    const fallbackTimer = window.setTimeout(() => {
      setHasEnteredViewport(true);
    }, 1200);

    if (typeof IntersectionObserver === "undefined") {
      window.clearTimeout(fallbackTimer);
      setHasEnteredViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting || entry?.intersectionRatio > 0) {
          setHasEnteredViewport(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: "240px 0px", threshold: 0.01 },
    );

    observer.observe(section);
    return () => {
      window.clearTimeout(fallbackTimer);
      observer.disconnect();
    };
  }, [hasEnteredViewport]);

  useEffect(() => {
    if (!hasEnteredViewport) return;

    let disposed = false;
    let cleanup = () => {};

    async function init() {
      const mount = mountRef.current;
      if (!mount) return;
      if (!supportsWebGL()) {
        setModelState({
          source: "fallback",
          status: "error",
          message: "3D preview requires WebGL. Use a WebGL-capable browser or open the project details.",
          count: pieces.length,
        });
        return;
      }

      const [THREE, { OrbitControls }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/controls/OrbitControls.js"),
      ]);
      if (disposed || !mountRef.current) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#071017");
      scene.fog = new THREE.Fog("#071017", 22, 46);

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
      camera.position.set(12, 10, 14);

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      } catch (error) {
        console.error("Portfolio BIM preview renderer failed:", error);
        setModelState({
          source: "fallback",
          status: "error",
          message: "3D preview could not start in this browser session. Project model data is still available in the panel.",
          count: pieces.length,
        });
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.innerHTML = "";
      mount.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.14;
      controls.rotateSpeed = 0.35;
      controls.zoomSpeed = 0.35;
      controls.panSpeed = 0.35;
      controls.keyPanSpeed = 3;
      controls.target.set(0, 2, 0);
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.minDistance = 1.2;
      controls.maxDistance = 90;

      scene.add(new THREE.HemisphereLight("#e8f2ff", "#172033", 1.05));
      const keyLight = new THREE.DirectionalLight("#ffffff", 2.4);
      keyLight.position.set(8, 16, 10);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight("#8db7ff", 0.85);
      fillLight.position.set(-10, 6, -8);
      scene.add(fillLight);
      const rimLight = new THREE.DirectionalLight("#f8fafc", 1.05);
      rimLight.position.set(0, 10, -14);
      scene.add(rimLight);

      const grid = new THREE.GridHelper(18, 18, "#40566e", "#1d344b");
      grid.position.y = -0.02;
      scene.add(grid);

      // Procedural environment map for metallic reflections
      try {
        const pmremGen = new THREE.PMREMGenerator(renderer);
        pmremGen.compileEquirectangularShader();
        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color("#071017");
        const envTopLight = new THREE.Mesh(
          new THREE.PlaneGeometry(8, 8),
          new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
        );
        envTopLight.position.set(0, 6, 0);
        envTopLight.rotation.x = Math.PI / 2;
        envScene.add(envTopLight);
        const envSideLight = new THREE.Mesh(
          new THREE.PlaneGeometry(5, 5),
          new THREE.MeshBasicMaterial({ color: 0x6688bb, side: THREE.DoubleSide }),
        );
        envSideLight.position.set(6, 2, 0);
        envSideLight.rotation.y = -Math.PI / 2;
        envScene.add(envSideLight);
        const envTex = pmremGen.fromScene(envScene, 0.04).texture;
        scene.environment = envTex;
        envScene.traverse((c) => { c.geometry?.dispose?.(); c.material?.dispose?.(); });
      } catch { /* env map generation is optional */ }

      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(18, 0.08, 14),
        new THREE.MeshStandardMaterial({ color: "#0b111a", roughness: 0.62, metalness: 0.18 })
      );
      slab.position.y = -0.08;
      slab.receiveShadow = true;
      scene.add(slab);

      const group = new THREE.Group();
      scene.add(group);
      const meshes = [];
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let selectedMesh = null;
      let pointerStart = null;
      let frameId = 0;

      const makeGeometry = (piece) => {
        switch (piece.shape) {
          case 1:
            return new THREE.BoxGeometry(0.55, 4.4, 0.55);
          case 2:
            return new THREE.BoxGeometry(2.8, 0.16, 2.1);
          case 3:
            return new THREE.BoxGeometry(0.22, 1.5, 1.2);
          case 4:
            return new THREE.BoxGeometry(0.32, 0.32, 3.2);
          case 5:
            return new THREE.BoxGeometry(1.1, 0.12, 0.8);
          default:
            return new THREE.BoxGeometry(3.6, 0.36, 0.44);
        }
      };

      const edges = new THREE.Group();
      const pickProxies = new THREE.Group();
      let fitTarget = group;

      const addEdgesForMesh = (mesh) => {
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({ color: "#8ba8c8", transparent: true, opacity: 0.35 })
        );
        edge.position.copy(mesh.position);
        edge.rotation.copy(mesh.rotation);
        edges.add(edge);
      };

      const addUploadedEdgesForMesh = (mesh, typeKey, viewMode = mode) => {
        if (mesh.userData.uploadedEdgeOverlay || !isRenderableModelMesh(mesh)) return;
        const color = viewMode === "material"
          ? TYPE_COLORS[typeKey] || TYPE_COLORS.MEMBER
          : REALISTIC_STEEL_COLORS[typeKey] || REALISTIC_STEEL_COLORS.MEMBER;
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: viewMode === "material" ? 1 : 0.9,
          })
        );
        mesh.updateWorldMatrix(true, false);
        edge.applyMatrix4(mesh.matrixWorld);
        mesh.userData.uploadedEdgeOverlay = edge;
        edges.add(edge);
      };
      group.add(edges);
      group.add(pickProxies);

      const addPickProxy = (mesh) => {
        if (mesh.userData.pickProxy || !mesh.userData?.piece || !isRenderableModelMesh(mesh)) return;
        const box = new THREE.Box3().setFromObject(mesh);
        if (box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const proxy = new THREE.Mesh(
          new THREE.BoxGeometry(
            Math.max(size.x, 0.18),
            Math.max(size.y, 0.18),
            Math.max(size.z, 0.18)
          ),
          new THREE.MeshBasicMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: 0,
            depthWrite: false,
          })
        );
        proxy.position.copy(center);
        proxy.userData = { piece: mesh.userData.piece, targetMesh: mesh };
        mesh.userData.pickProxy = proxy;
        pickProxies.add(proxy);
      };

      const fitToObject = (object) => {
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 1);
        const distance = maxDim * 1.45;
        controls.target.copy(center);
        camera.position.set(center.x + distance, center.y + distance * 0.72, center.z + distance);
        camera.near = Math.max(0.01, maxDim / 1000);
        camera.far = Math.max(120, distance * 8);
        camera.updateProjectionMatrix();
        controls.update();
      };

      const addGeneratedModel = (fallbackMessage = "") => {
        pieces.forEach((piece, index) => {
          const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(mode === "material" ? piece.specColor : piece.baseColor),
            roughness: 0.32,
            metalness: 0.75,
            emissive: "#000000",
            envMapIntensity: 0.6,
          });
          const mesh = new THREE.Mesh(makeGeometry(piece), material);
          mesh.position.set(piece.position.x, piece.position.y, piece.position.z);
          if (piece.shape === 0) mesh.rotation.y = index % 2 === 0 ? 0 : Math.PI / 2;
          if (piece.shape === 2) mesh.position.y += 2.2;
          if (piece.shape === 3) mesh.rotation.z = index % 2 ? Math.PI / 2 : 0;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData = { piece, baseColor: material.color.clone() };
          group.add(mesh);
          meshes.push(mesh);
          addPickProxy(mesh);
          addEdgesForMesh(mesh);
        });
        setModelState({
          source: fallbackMessage ? "fallback" : "generated",
          status: "ready",
          message: fallbackMessage,
          count: pieces.length,
        });
        fitTarget = group;
        fitToObject(group);
      };

      let uploadedRoot = null;
      let fragmentsManager = null;
      let ifcComponents = null;
      let streamPoll = 0;
      let didFitUploadedModelOnce = false;
      const addUploadedModel = async () => {
        const ext = modelDocumentExtension(modelDocument);
        if (!modelDocument || !["glb", "gltf", "ifc"].includes(ext)) {
          addGeneratedModel();
          return;
        }

        setModelState({
          source: "uploaded",
          status: "loading",
          message: `Loading ${modelDocumentName(modelDocument)}`,
          count: 0,
        });

        try {
          const url = await resolveFileUrl(modelDocument.file_url);
          if (!url) throw new Error("No model file URL available");
          if (ext === "ifc") {
            const OBC = await import("@thatopen/components");
            ifcComponents = new OBC.Components();
            ifcComponents.init();
            fragmentsManager = ifcComponents.get(OBC.FragmentsManager);
            fragmentsManager.init(FRAGMENTS_WORKER_URL);
            const ifcLoader = ifcComponents.get(OBC.IfcLoader);
            await ifcLoader.setup({
              autoSetWasm: false,
            });
            ifcLoader.settings.wasm.path = "https://unpkg.com/web-ifc@0.0.77/";
            ifcLoader.settings.wasm.absolute = true;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Model download failed (${response.status})`);
            const uint8Array = new Uint8Array(await response.arrayBuffer());
            const ifcModel = await ifcLoader.load(uint8Array, true, modelDocumentName(modelDocument).replace(/\.ifc$/i, ""));
            try { ifcModel.useCamera(camera); } catch { /* camera binding is best-effort for preview */ }
            uploadedRoot = ifcModel.object;
            if (!uploadedRoot) throw new Error("IFC loaded without a scene object");
            fitTarget = uploadedRoot;
            group.add(uploadedRoot);

            const registerIfcMeshes = () => {
              const seen = new Set(meshes);
              uploadedRoot.traverse((child) => {
                patchLodRenderHook(child);
                try {
                  if (!isRenderableModelMesh(child)) return;
                  const typeKey = inferMemberType(child.name || firstMaterial(child)?.name);
                  styleRenderableMaterial(THREE, child, typeKey, mode);
                } catch (error) {
                  console.warn("Skipped IFC renderable styling:", error);
                }
              });
              uploadedRoot.traverse((child) => {
                patchLodRenderHook(child);
                if (!isRenderableModelMesh(child) || seen.has(child)) return;
                try {
                  let mat = firstMaterial(child);
                  const typeKey = inferMemberType(child.name || mat?.name);
                  cloneMeshMaterials(THREE, child, typeKey, mode);
                  ensureModelMaterial(THREE, child, typeKey, mode);
                  mat = firstMaterial(child);
                  const materialColor = new THREE.Color(TYPE_COLORS[typeKey] || TYPE_COLORS.MEMBER);
                  const baseColor = new THREE.Color(REALISTIC_STEEL_COLORS[typeKey] || REALISTIC_STEEL_COLORS.MEMBER);
                  normalizeModelMaterial(THREE, child, typeKey, mode);
                  child.castShadow = true;
                  child.receiveShadow = true;
                  const index = meshes.length;
                  const piece = pieceFromUploadedMesh({
                    mesh: child,
                    material: mat,
                    index,
                    typeKey,
                    materialColor,
                    baseColor,
                    modelDocument,
                    workPackages,
                    projectName: project?.name,
                    sourceLabel: "ifc",
                  });
                  child.userData = {
                    ...child.userData,
                    piece,
                    baseColor: mode === "material" ? materialColor.clone() : baseColor.clone(),
                  };
                  meshes.push(child);
                  addPickProxy(child);
                  addUploadedEdgesForMesh(child, typeKey);
                } catch (error) {
                  console.warn("Skipped IFC fragment styling:", error);
                }
              });
              setModelState({
                source: "uploaded",
                status: "ready",
                message: modelDocumentName(modelDocument),
                count: meshes.length,
              });
              if (meshes.length > 0 && !didFitUploadedModelOnce) {
                didFitUploadedModelOnce = true;
                fitToObject(fitTarget || uploadedRoot || group);
              }
            };

            // Stream tiles in — do NOT use update(true) which evicts tiles
            // and causes the model to "pop in and out" of the frame.
            try { await fragmentsManager.core.update(); } catch { /* ignore initial streaming errors */ }
            registerIfcMeshes();
            try {
              ifcModel.onViewUpdated?.add?.(() => {
                registerIfcMeshes();
              });
            } catch { /* ignore optional event hook */ }
            let pollCount = 0;
            streamPoll = window.setInterval(async () => {
              pollCount++;
              // Stream only — no eviction (update without `true`)
              try { await fragmentsManager?.core?.update?.(); } catch { /* ignore */ }
              registerIfcMeshes();
              if (meshes.length > 0 || pollCount > 30) window.clearInterval(streamPoll);
            }, 250);
            return;
          }

          const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
          const loader = new GLTFLoader();
          const gltf = await new Promise((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });

          uploadedRoot = gltf.scene;
          fitTarget = uploadedRoot;
          const box = new THREE.Box3().setFromObject(uploadedRoot);
          if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z, 1);
            const scale = 12 / maxDim;
            uploadedRoot.scale.setScalar(scale);
            uploadedRoot.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
          }

          let index = 0;
          group.add(uploadedRoot);
          uploadedRoot.updateMatrixWorld(true);
          uploadedRoot.traverse((child) => {
            patchLodRenderHook(child);
            try {
              if (!isRenderableModelMesh(child)) return;
              const typeKey = inferMemberType(child.name || firstMaterial(child)?.name);
              styleRenderableMaterial(THREE, child, typeKey, mode);
            } catch (error) {
              console.warn("Skipped uploaded renderable styling:", error);
            }
          });
          uploadedRoot.traverse((child) => {
            patchLodRenderHook(child);
            if (!isRenderableModelMesh(child)) return;

            let mat = firstMaterial(child);
            const typeKey = inferMemberType(child.name || mat?.name);
            cloneMeshMaterials(THREE, child, typeKey, mode);
            ensureModelMaterial(THREE, child, typeKey, mode);
            mat = firstMaterial(child);
            const materialColor = new THREE.Color(TYPE_COLORS[typeKey] || TYPE_COLORS.MEMBER);
            const baseColor = new THREE.Color(REALISTIC_STEEL_COLORS[typeKey] || REALISTIC_STEEL_COLORS.MEMBER);
            normalizeModelMaterial(THREE, child, typeKey, mode);
            child.castShadow = true;
            child.receiveShadow = true;

            const piece = pieceFromUploadedMesh({
              mesh: child,
              material: mat,
              index,
              typeKey,
              materialColor,
              baseColor,
              modelDocument,
              workPackages,
              projectName: project?.name,
              sourceLabel: "model",
            });
            child.userData = { ...child.userData, piece, baseColor: mode === "material" ? materialColor.clone() : baseColor.clone() };
            meshes.push(child);
            addPickProxy(child);
            addUploadedEdgesForMesh(child, typeKey);
            index++;
          });

          setModelState({
            source: "uploaded",
            status: "ready",
            message: modelDocumentName(modelDocument),
            count: meshes.length,
          });
          fitToObject(fitTarget || uploadedRoot || group);
        } catch (error) {
          console.error("Portfolio model load failed:", error);
          addGeneratedModel(`Could not load ${modelDocumentName(modelDocument)} (${error?.message || "unknown error"}); using work-package preview.`);
        }
      };

      await addUploadedModel();

      const resize = () => {
        const rect = mount.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };

      const forEachMaterial = (mesh, fn) => {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
          if (mat) fn(mat);
        });
      };

      const findSelectableMesh = (object) => {
        let current = object;
        while (current && current !== group) {
          if (current.userData?.targetMesh) return current.userData.targetMesh;
          if (current.isMesh && current.userData?.piece) return current;
          current = current.parent;
        }
        return null;
      };

      const findNearestProjectedMesh = (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        const box = new THREE.Box3();
        let best = null;
        let bestDistance = Infinity;

        meshes.forEach((mesh) => {
          if (!mesh.userData?.piece) return;
          box.setFromObject(mesh);
          if (box.isEmpty()) return;

          const corners = [
            [box.min.x, box.min.y, box.min.z],
            [box.min.x, box.min.y, box.max.z],
            [box.min.x, box.max.y, box.min.z],
            [box.min.x, box.max.y, box.max.z],
            [box.max.x, box.min.y, box.min.z],
            [box.max.x, box.min.y, box.max.z],
            [box.max.x, box.max.y, box.min.z],
            [box.max.x, box.max.y, box.max.z],
          ].map(([x, y, z]) => new THREE.Vector3(x, y, z).project(camera));

          const visibleCorners = corners.filter((corner) => corner.z >= -1 && corner.z <= 1);
          if (visibleCorners.length === 0) return;

          const xs = visibleCorners.map((corner) => ((corner.x + 1) / 2) * rect.width);
          const ys = visibleCorners.map((corner) => ((-corner.y + 1) / 2) * rect.height);
          const minX = Math.min(...xs) - PROJECTED_SELECTION_PADDING_PX;
          const maxX = Math.max(...xs) + PROJECTED_SELECTION_PADDING_PX;
          const minY = Math.min(...ys) - PROJECTED_SELECTION_PADDING_PX;
          const maxY = Math.max(...ys) + PROJECTED_SELECTION_PADDING_PX;
          const clampedX = Math.max(minX, Math.min(clickX, maxX));
          const clampedY = Math.max(minY, Math.min(clickY, maxY));
          const distance = Math.hypot(clickX - clampedX, clickY - clampedY);

          if (distance < bestDistance) {
            bestDistance = distance;
            best = mesh;
          }
        });

        return bestDistance <= PROJECTED_SELECTION_PADDING_PX ? best : null;
      };

      const setMeshSelected = (mesh) => {
        selectedMesh = mesh;
        meshes.forEach((m) => {
          const hidden = isolatedRef.current && mesh && m !== mesh;
          forEachMaterial(m, (mat) => {
            if (mat.color && m.userData.baseColor) mat.color.copy(m.userData.baseColor);
            mat.emissive?.set?.("#000000");
            mat.opacity = hidden ? ISOLATED_CONTEXT_OPACITY : 1;
            mat.transparent = hidden;
            mat.depthWrite = !hidden;
            mat.needsUpdate = true;
          });
        });
        if (mesh) {
          forEachMaterial(mesh, (mat) => {
            mat.color?.set?.("#fbbf24");
            mat.emissive?.set?.("#422006");
            mat.opacity = 1;
            mat.transparent = false;
            mat.depthWrite = true;
            mat.needsUpdate = true;
          });
          setSelectedPiece(mesh.userData.piece);
        }
      };

      const pick = (event, commit) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        let hit = null;
        try {
          hit = raycaster.intersectObjects(pickProxies.children.filter(isRenderableModelMesh), false)
            .map((intersection) => findSelectableMesh(intersection.object))
            .find(Boolean) || null;
        } catch (error) {
          console.warn("Skipped BIM pick raycast:", error);
        }
        hit = hit || findNearestProjectedMesh(event);
        renderer.domElement.style.cursor = hit ? "pointer" : "grab";
        if (!commit) return;
        setMeshSelected(hit);
      };

      const onPointerDown = (event) => {
        if (event.button !== 0) return;
        pointerStart = {
          x: event.clientX,
          y: event.clientY,
          pointerId: event.pointerId,
        };
        renderer.domElement.style.cursor = "grabbing";
      };
      const onPointerMove = (event) => {
        if (pointerStart) {
          const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
          renderer.domElement.style.cursor = distance > CLICK_SELECT_MAX_MOVEMENT_PX ? "grabbing" : "pointer";
          return;
        }
        pick(event, false);
      };
      const onPointerUp = (event) => {
        if (!pointerStart || event.button !== 0) return;
        const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
        pointerStart = null;
        if (distance <= CLICK_SELECT_MAX_MOVEMENT_PX) {
          pick(event, true);
        } else {
          pick(event, false);
        }
      };
      const onPointerCancel = () => {
        pointerStart = null;
        renderer.domElement.style.cursor = "grab";
      };
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointercancel", onPointerCancel);
      renderer.domElement.addEventListener("pointerleave", onPointerCancel);

      apiRef.current = {
        fit: () => {
          fitToObject(fitTarget || group);
        },
        clear: () => {
          setSelectedPiece(null);
          setMeshSelected(null);
        },
        applyIsolation: (nextIsolated) => {
          meshes.forEach((m) => {
            const hidden = nextIsolated && selectedMesh && m !== selectedMesh;
            forEachMaterial(m, (mat) => {
              mat.opacity = hidden ? ISOLATED_CONTEXT_OPACITY : 1;
              mat.transparent = hidden;
              mat.depthWrite = !hidden;
              mat.needsUpdate = true;
            });
          });
        },
        applyMode: (nextMode) => {
          meshes.forEach((mesh) => {
            const piece = mesh.userData?.piece;
            const typeKey = inferMemberType(piece?.type || mesh.name || firstMaterial(mesh)?.name);
            if (String(piece?.source || "").startsWith("uploaded") || ["ifc", "model"].some((prefix) => String(piece?.source || "").startsWith(prefix))) {
              normalizeModelMaterial(THREE, mesh, typeKey, nextMode);
              const realisticColor = new THREE.Color(REALISTIC_STEEL_COLORS[typeKey] || REALISTIC_STEEL_COLORS.MEMBER);
              const materialColor = new THREE.Color(TYPE_COLORS[typeKey] || TYPE_COLORS.MEMBER);
              mesh.userData.baseColor = nextMode === "material" ? materialColor : realisticColor;
            } else {
              const nextColor = nextMode === "material" ? piece?.specColor : piece?.baseColor;
              if (nextColor) {
                forEachMaterial(mesh, (mat) => {
                  mat.color?.set?.(nextColor);
                  mat.needsUpdate = true;
                });
                mesh.userData.baseColor = new THREE.Color(nextColor);
              }
            }
          });

          edges.children.forEach((edge) => {
            const sourceMesh = meshes.find((mesh) => mesh.userData?.uploadedEdgeOverlay === edge);
            if (!sourceMesh) return;
            const typeKey = inferMemberType(sourceMesh.userData?.piece?.type || sourceMesh.name || firstMaterial(sourceMesh)?.name);
            edge.material.color.set(nextMode === "material"
              ? TYPE_COLORS[typeKey] || TYPE_COLORS.MEMBER
              : REALISTIC_STEEL_COLORS[typeKey] || REALISTIC_STEEL_COLORS.MEMBER);
            edge.material.opacity = nextMode === "material" ? 1 : 0.9;
            edge.material.needsUpdate = true;
          });

          if (selectedMesh) setMeshSelected(selectedMesh);
        },
      };

      resize();
      let observer = null;
      if (typeof ResizeObserver === "undefined") {
        window.addEventListener("resize", resize);
      } else {
        observer = new ResizeObserver(resize);
        observer.observe(mount);
      }

      const animate = () => {
        controls.update();
        try { fragmentsManager?.core?.update?.(); } catch { /* ignore IFC streaming heartbeat errors */ }
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(animate);
      };
      animate();

      cleanup = () => {
        cancelAnimationFrame(frameId);
        if (streamPoll) window.clearInterval(streamPoll);
        observer?.disconnect?.();
        if (!observer) window.removeEventListener("resize", resize);
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
        renderer.domElement.removeEventListener("pointerleave", onPointerCancel);
        controls.dispose();
        meshes.forEach((mesh) => {
          mesh.geometry.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((mat) => mat?.dispose?.());
        });
        edges.children.forEach((edge) => {
          edge.geometry.dispose();
          edge.material.dispose();
        });
        disposeObject(pickProxies);
        disposeObject(uploadedRoot);
        try { ifcComponents?.dispose?.(); } catch { /* ignore */ }
        renderer.dispose();
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      };
    }

    init();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [hasEnteredViewport, pieces, modelDocumentKey]);

  useEffect(() => {
    apiRef.current?.applyIsolation(isolated);
  }, [isolated]);

  useEffect(() => {
    apiRef.current?.applyMode(mode);
  }, [mode]);

  useEffect(() => {
    setSelectedPiece(null);
    setModelState({ source: "generated", status: "idle", message: "", count: 0 });
  }, [project?.id, modelDocumentKey]);

  const projectName = project?.name || "Select a project";
  const modelTonnage = pieces.reduce((sum, piece) => sum + (Number(piece.tons) || 0), 0);
  const visibleElementCount = modelState.count || pieces.length;
  const modelSourceLabel = modelState.source === "uploaded"
    ? "Uploaded model"
    : modelState.source === "fallback"
      ? "Work package preview"
      : workPackages.length > 0 ? "Work package model" : "Conceptual model";
  const viewerModeOptions = modelState.source === "uploaded"
    ? [
        ["model", "Realistic"],
        ["material", "Material map"],
      ]
    : [
        ["model", "Status colors"],
        ["material", "Material colors"],
      ];
  const modelDisplayMessage = modelState.source === "uploaded" && modelState.status === "ready"
    ? `${modelDocumentName(modelDocument)} is ready. Click model elements to identify material and source data.`
    : modelState.message || "Click steel members to identify mark, material, status, crew, tonnage, and linked risk signals.";

  return (
    <section
      ref={sectionRef}
      style={{
        minHeight: isCompact ? 0 : 520,
        display: "grid",
        gridTemplateColumns: isCompact ? "1fr" : "minmax(0, 1.45fr) minmax(320px, 0.55fr)",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "relative", minHeight: isCompact ? 460 : 520, background: "#071017" }}>
        <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
        {modelState.status === "loading" && (
          <ViewerOverlay
            title="Loading model"
            message={modelState.message || "Preparing 3D model preview"}
          />
        )}
        {modelState.status === "error" && (
          <ViewerOverlay
            title="3D preview unavailable"
            message={modelState.message}
            actionLabel={project?.id ? "Open project" : null}
            onAction={project?.id ? onOpenProject : null}
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf,.ifc"
          style={{ display: "none" }}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file || !onUploadModel) return;
            setUploading(true);
            try {
              await onUploadModel(file);
            } finally {
              setUploading(false);
            }
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            zIndex: 2,
          }}
        >
          {viewerModeOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 6,
                border: `1px solid ${mode === value ? "var(--accent)" : "rgba(255,255,255,0.18)"}`,
                background: mode === value ? "rgba(59,130,246,0.22)" : "rgba(2,6,23,0.72)",
                color: mode === value ? "var(--accent)" : "#cbd5e1",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => apiRef.current?.fit()}
            style={toolbarButtonStyle}
          >
            Fit
          </button>
          <button
            type="button"
            onClick={() => setIsolated((v) => !v)}
            style={{
              ...toolbarButtonStyle,
              borderColor: isolated ? "var(--accent)" : "rgba(255,255,255,0.18)",
              color: isolated ? "var(--accent)" : "#cbd5e1",
            }}
          >
            Isolate
          </button>
          <button
            type="button"
            disabled={!project?.id || !onUploadModel || uploading}
            onClick={() => fileInputRef.current?.click()}
            style={{
              ...toolbarButtonStyle,
              borderColor: "var(--accent)",
              color: "var(--accent)",
              opacity: !project?.id || !onUploadModel || uploading ? 0.55 : 1,
              cursor: !project?.id || !onUploadModel || uploading ? "not-allowed" : "pointer",
            }}
            title="Upload a .glb, .gltf, or .ifc model for the selected project"
          >
            {uploading ? "Uploading" : "Upload model"}
          </button>
        </div>

        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            right: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "end",
            gap: 12,
            flexWrap: "wrap",
            pointerEvents: "none",
          }}
        >
          <div>
            <div style={viewerEyebrow}>Interactive BIM Lens</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "#f8fafc" }}>
              {projectName}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
              {modelDisplayMessage}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatPill label={modelState.source === "uploaded" ? "Elements" : "Pieces"} value={visibleElementCount} />
            <StatPill label={modelState.source === "uploaded" ? "Source" : "Modeled tons"} value={modelState.source === "uploaded" ? "Upload" : `${modelTonnage.toFixed(1)}T`} />
          </div>
        </div>
      </div>

      <aside
        style={{
          borderLeft: isCompact ? 0 : "1px solid var(--border-default)",
          borderTop: isCompact ? "1px solid var(--border-default)" : 0,
          background: "var(--bg-surface-low)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid var(--border-default)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Selected Member
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginTop: 6 }}>
            {selectedPiece?.mark || "No piece selected"}
          </div>
          <p style={{ margin: "6px 0 0", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>
            {selectedPiece?.name || "Select any beam, column, deck panel, or connection in the model to inspect its material and project signals."}
          </p>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          {selectedPiece ? (
            <>
              <InfoRow label="Material" value={`${selectedPiece.type} / ${selectedPiece.grade}`} />
              <InfoRow label="Finish" value={selectedPiece.finish} />
              <InfoRow label="Status" value={selectedPiece.status} tone={statusColor(selectedPiece.status)} />
              <InfoRow
                label="Link"
                value={selectedPiece.linkStatus || "Model element"}
                tone={selectedPiece.linkedWorkPackageId ? "var(--status-success)" : "var(--status-warning)"}
              />
              {selectedPiece.modelElementName && selectedPiece.modelElementName !== selectedPiece.mark && (
                <InfoRow label="Model element" value={selectedPiece.modelElementName} />
              )}
              <InfoRow label="Phase" value={selectedPiece.phase} />
              <InfoRow label="Crew" value={selectedPiece.crew} />
              <InfoRow label="Tonnage" value={Number.isFinite(selectedPiece.tons) ? `${selectedPiece.tons.toFixed(2)} tons` : "Model element"} />
              {Number.isFinite(selectedPiece.progress) && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={rowLabelStyle}>Completion</span>
                    <span style={rowValueStyle}>{Math.round(selectedPiece.progress)}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 999, overflow: "hidden", background: "var(--bg-surface-high)" }}>
                    <div style={{ width: `${Math.min(100, selectedPiece.progress)}%`, height: "100%", background: statusColor(selectedPiece.status) }} />
                  </div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button type="button" onClick={() => apiRef.current?.clear()} style={actionButtonStyle}>
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => (selectedPiece.linkedWorkPackageId ? onOpenWorkPackages?.(selectedPiece) : onOpenProject?.())}
                  style={{ ...actionButtonStyle, color: "var(--accent)", borderColor: "var(--accent-border)" }}
                >
                  {selectedPiece.linkedWorkPackageId ? "Open WPs" : "Open project"}
                </button>
              </div>
              <SignalBlock title="Linked RFIs" empty="No direct RFI match">
                {selectedOpenRfis.map((rfi) => (
                  <div key={rfi.id} style={signalRowStyle}>
                    <span>{rfi.rfi_number || "RFI"}</span>
                    <strong>{rfi.status || "Open"}</strong>
                  </div>
                ))}
              </SignalBlock>
              <SignalBlock title="Delivery Match" empty="No delivery found">
                {deliveryForPiece && (
                  <div style={signalRowStyle}>
                    <span>{deliveryForPiece.po_number || deliveryForPiece.vendor || "Delivery"}</span>
                    <strong>{deliveryForPiece.status || "Scheduled"}</strong>
                  </div>
                )}
              </SignalBlock>
            </>
          ) : (
            <>
              <InfoRow label="Viewer" value="Orbit, zoom, select" />
              <InfoRow label="Source" value={modelSourceLabel} />
              <InfoRow label="Model file" value={modelDocument ? modelDocumentName(modelDocument) : "None uploaded"} />
              <InfoRow label="Default view" value={modelState.source === "uploaded" ? "Realistic steel finishes" : "Blue planned, amber active, green complete, red risk"} />
              <InfoRow label="Material map" value="Switch mode to see steel grade/material families" />
            </>
          )}
        </div>
      </aside>
    </section>
  );
}

const toolbarButtonStyle = {
  height: 30,
  padding: "0 10px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(2,6,23,0.72)",
  color: "#cbd5e1",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const viewerEyebrow = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 800,
  color: "#60a5fa",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const rowLabelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const rowValueStyle = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-primary)",
  fontWeight: 700,
  textAlign: "right",
};

const actionButtonStyle = {
  height: 34,
  borderRadius: 6,
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const signalRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  padding: "7px 8px",
  borderRadius: 6,
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-secondary)",
};

function StatPill({ label, value }) {
  return (
    <div style={{ minWidth: 86, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, background: "rgba(2,6,23,0.68)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#94a3b8", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 800, color: "#f8fafc", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ViewerOverlay({ title, message, actionLabel, onAction }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "linear-gradient(180deg, rgba(7,16,23,0.78), rgba(7,16,23,0.92))",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          border: "1px solid rgba(148,163,184,0.24)",
          borderRadius: 8,
          background: "rgba(8,13,20,0.94)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.42)",
          padding: 18,
          textAlign: "center",
          pointerEvents: "auto",
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>
          {title}
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#a8b4c8", lineHeight: 1.45, marginTop: 8 }}>
          {message}
        </div>
        {actionLabel && onAction && (
          <button type="button" onClick={onAction} style={{ ...toolbarButtonStyle, marginTop: 14, color: "var(--accent)", borderColor: "var(--accent)" }}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, tone }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={{ ...rowValueStyle, color: tone || rowValueStyle.color }}>{value || "-"}</span>
    </div>
  );
}

function SignalBlock({ title, empty, children }) {
  const hasChildren = Children.count(children) > 0;
  return (
    <div>
      <div style={{ ...rowLabelStyle, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {hasChildren ? children : (
          <div style={{ ...signalRowStyle, color: "var(--text-muted)" }}>
            <span>{empty}</span>
          </div>
        )}
      </div>
    </div>
  );
}
