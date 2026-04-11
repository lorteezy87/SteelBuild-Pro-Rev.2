import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ─── STATUS COLOR MAPPING ─────────────────────────────────────────
const STATUS_COLORS = {
  "Not Started": { color: 0x6b7280, label: "Not Started", cssColor: "#6B7280" },
  Detailing: { color: 0xf59e0b, label: "Detailing", cssColor: "#F59E0B" },
  Fabrication: { color: 0x3b82f6, label: "In Fabrication", cssColor: "#3B82F6" },
  Shipped: { color: 0x10b981, label: "Shipped/On-site", cssColor: "#10B981" },
  Erected: { color: 0x8b5cf6, label: "Erected", cssColor: "#8B5CF6" },
  Blocked: { color: 0xef4444, label: "Blocked", cssColor: "#EF4444" },
};

function seededRandom(seed) {
  let x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ─── TYPE INFERENCE ───────────────────────────────────────────────
function inferType(name) {
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

const TYPE_COLORS = {
  COLUMN: "#9B59B6", GIRDER: "#2C3E50", BEAM: "#3498DB", SLAB: "#27AE60",
  BRACE: "#E67E22", STAIR: "#F1C40F", WALL: "#95A5A6", MEMBER: "#7F8C8D",
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────
export default function ModelViewer() {
  const containerRef = useRef(null);
  const componentsRef = useRef(null);
  const worldRef = useRef(null);
  const loadedModelRef = useRef(null);

  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [loadingModel, setLoadingModel] = useState({ active: false, progress: 0, status: "", fileName: "" });
  const [modelLoaded, setModelLoaded] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [selectedElement, setSelectedElement] = useState(null);
  const [navMode, setNavMode] = useState("orbit");

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages"],
    queryFn: () => base44.entities.WorkPackage.list(),
  });

  // ─── @thatopen/components INITIALIZATION ────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || componentsRef.current) return;

    const components = new OBC.Components();
    componentsRef.current = components;

    async function init() {
      const worlds = components.get(OBC.Worlds);
      const world = worlds.create();

      // Scene
      world.scene = new OBC.SimpleScene(components);
      world.scene.setup();
      world.scene.three.background = new THREE.Color(0xf0f2f5);

      // Renderer
      world.renderer = new OBC.SimpleRenderer(components, container);

      // Camera — OrthoPerspectiveCamera with proper orbit
      world.camera = new OBC.OrthoPerspectiveCamera(components);

      // Start render loop
      components.init();

      // Grid
      const grids = components.get(OBC.Grids);
      grids.create(world);

      worldRef.current = world;
    }

    init().catch((err) => {
      console.error("Failed to init @thatopen/components:", err);
      setUploadError("Failed to initialize 3D viewer: " + err.message);
    });

    return () => {
      if (componentsRef.current) {
        componentsRef.current.dispose();
        componentsRef.current = null;
        worldRef.current = null;
      }
    };
  }, []);

  // ─── FIT CAMERA ────────────────────────────────────────────────
  const fitCamera = useCallback(async (target) => {
    const world = worldRef.current;
    if (!world?.camera?.controls) return;
    if (target) {
      const box = new THREE.Box3().setFromObject(target);
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      world.camera.controls.fitToSphere(sphere, true);
    }
  }, []);

  // ─── LOAD GLTF/GLB ────────────────────────────────────────────
  const handleGLTFUpload = useCallback(async (file) => {
    const world = worldRef.current;
    if (!world) return;

    setLoadingModel({ active: true, progress: 10, status: "Parsing GLTF...", fileName: file.name });
    setUploadError(null);

    try {
      const url = URL.createObjectURL(file);
      const loader = new GLTFLoader();

      const gltf = await new Promise((resolve, reject) => {
        loader.load(
          url,
          (result) => resolve(result),
          (progress) => {
            if (progress.total > 0) {
              setLoadingModel((prev) => ({ ...prev, progress: Math.round((progress.loaded / progress.total) * 80) }));
            }
          },
          reject
        );
      });

      URL.revokeObjectURL(url);
      setLoadingModel((prev) => ({ ...prev, progress: 85, status: "Processing meshes..." }));

      const model = gltf.scene;
      world.scene.three.add(model);

      // Extract members
      const extracted = [];
      let idx = 0;
      model.traverse((child) => {
        if (child.isMesh) {
          const name = child.name || `Element ${idx + 1}`;
          const type = inferType(name);
          extracted.push({
            id: idx,
            name,
            type,
            color: TYPE_COLORS[type],
            mesh: child,
          });
          idx++;
        }
      });

      setMembers(extracted);
      setLoadingModel((prev) => ({ ...prev, progress: 95, status: "Fitting view..." }));

      // Store reference and fit
      loadedModelRef.current = model;
      await fitCamera(model);

      setModelLoaded({ name: file.name, memberCount: extracted.length, format: "GLTF" });
      setLoadingModel({ active: false, progress: 100, status: "", fileName: "" });
    } catch (err) {
      console.error("GLTF load error:", err);
      setUploadError("Failed to load model: " + err.message);
      setLoadingModel({ active: false, progress: 0, status: "", fileName: "" });
    }
  }, [fitCamera]);

  // ─── LOAD IFC ──────────────────────────────────────────────────
  const handleIFCUpload = useCallback(async (file) => {
    const components = componentsRef.current;
    const world = worldRef.current;
    if (!components || !world) return;

    setLoadingModel({ active: true, progress: 5, status: "Initializing IFC loader...", fileName: file.name });
    setUploadError(null);

    try {
      // Get the IFC loader
      const ifcLoader = components.get(OBC.IfcLoader);

      // Setup WASM — point to the public/wasm folder
      setLoadingModel((prev) => ({ ...prev, progress: 10, status: "Loading WASM engine..." }));
      await ifcLoader.setup({
        autoSetWasm: false,
        wasm: { path: "/wasm/", absolute: true },
      });

      // Initialize fragments manager
      const fragments = components.get(OBC.FragmentsManager);
      // Set up the worker for fragments
      try {
        const workerUrl = "https://thatopen.github.io/engine_fragment/resources/worker.mjs";
        const resp = await fetch(workerUrl);
        const blob = await resp.blob();
        const workerFile = new File([blob], "worker.mjs", { type: "text/javascript" });
        const objUrl = URL.createObjectURL(workerFile);
        fragments.init(objUrl);
      } catch {
        // Worker init may fail on some setups, continue anyway
      }

      // Wire model loading to scene
      fragments.list.onItemSet.add(({ value: model }) => {
        model.useCamera(world.camera.three);
        world.scene.three.add(model.object);
      });

      setLoadingModel((prev) => ({ ...prev, progress: 30, status: "Parsing IFC file..." }));

      // Load IFC
      const data = await file.arrayBuffer();
      const buffer = new Uint8Array(data);
      const ifcModel = await ifcLoader.load(buffer, true, file.name);

      setLoadingModel((prev) => ({ ...prev, progress: 80, status: "Extracting elements..." }));

      // Extract members from the loaded model object
      const extracted = [];
      let idx = 0;
      ifcModel.object.traverse((child) => {
        if (child.isMesh || child.isGroup) {
          const name = child.name || `Element ${idx + 1}`;
          const type = inferType(name);
          if (child.isMesh) {
            extracted.push({ id: idx, name, type, color: TYPE_COLORS[type], mesh: child });
            idx++;
          }
        }
      });

      setMembers(extracted);
      setLoadingModel((prev) => ({ ...prev, progress: 95, status: "Fitting view..." }));

      // Fit camera to model
      loadedModelRef.current = ifcModel.object;
      await fitCamera(ifcModel.object);

      setModelLoaded({ name: file.name, memberCount: extracted.length, format: "IFC" });
      setLoadingModel({ active: false, progress: 100, status: "", fileName: "" });
    } catch (err) {
      console.error("IFC load error:", err);
      setUploadError("Failed to load IFC: " + err.message);
      setLoadingModel({ active: false, progress: 0, status: "", fileName: "" });
    }
  }, [fitCamera]);

  // ─── FILE HANDLING ──────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "ifc") handleIFCUpload(file);
    else if (["gltf", "glb"].includes(ext)) handleGLTFUpload(file);
    else setUploadError("Unsupported format. Use .gltf, .glb, or .ifc");
  }, [handleIFCUpload, handleGLTFUpload]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFile(e.dataTransfer?.files?.[0]);
  }, [handleFile]);

  // ─── CAMERA PRESETS ────────────────────────────────────────────
  const setView = useCallback(async (preset) => {
    const world = worldRef.current;
    const model = world?._loadedModel;
    if (!world?.camera?.controls || !model) return;

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) * 2;

    const dir = new THREE.Vector3();
    switch (preset) {
      case "front": dir.set(0, 0, 1); break;
      case "back": dir.set(0, 0, -1); break;
      case "top": dir.set(0, 1, 0.001); break;
      case "right": dir.set(1, 0, 0); break;
      case "left": dir.set(-1, 0, 0); break;
      case "iso": default: dir.set(1, 0.6, 1); break;
    }
    dir.normalize();
    const pos = center.clone().addScaledVector(dir, maxDim);

    await world.camera.controls.setLookAt(
      pos.x, pos.y, pos.z,
      center.x, center.y, center.z,
      true
    );
  }, []);

  // ─── NAV MODE ──────────────────────────────────────────────────
  useEffect(() => {
    const world = worldRef.current;
    if (!world?.camera) return;
    try {
      if (navMode === "orbit") world.camera.set("Orbit");
      else if (navMode === "firstperson") world.camera.set("FirstPerson");
      else if (navMode === "plan") world.camera.set("Plan");
    } catch {
      // Camera mode not available yet
    }
  }, [navMode]);

  // ─── KEYBOARD SHORTCUTS ────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "f" || e.key === "F") {
        const model = loadedModelRef.current;
        if (model) fitCamera(model);
      }
      if (e.key === "[") setLeftPanelOpen((p) => !p);
      if (e.key === "1") setNavMode("orbit");
      if (e.key === "2") setNavMode("firstperson");
      if (e.key === "3") setNavMode("plan");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fitCamera]);

  // ─── MEMBER SELECTION ──────────────────────────────────────────
  const selectMember = useCallback((member) => {
    setSelectedMember(member);
    if (member?.mesh) {
      const world = worldRef.current;
      if (world?.camera?.controls) {
        const box = new THREE.Box3().setFromObject(member.mesh);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        world.camera.controls.fitToSphere(sphere, true);
      }
    }
  }, []);

  // ─── FILTERED MEMBERS ──────────────────────────────────────────
  const filteredMembers = useMemo(() => {
    let list = members;
    if (filterType !== "all") list = list.filter((m) => m.type === filterType);
    if (memberSearch) {
      const q = memberSearch.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q));
    }
    return list;
  }, [members, filterType, memberSearch]);

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", flex: 1, minHeight: 0, background: "var(--bg-page)" }}>
      {/* TOOLBAR */}
      <div style={{
        height: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 14px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.12em" }}>
            3D MODEL VIEWER
          </span>
          {modelLoaded && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-success)", background: "var(--success-muted)", border: "1px solid var(--success-border)", borderRadius: 4, padding: "2px 6px" }}>
              {modelLoaded.format} \u00B7 {modelLoaded.memberCount} elements
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Nav mode buttons */}
          {modelLoaded && ["orbit", "firstperson", "plan"].map((mode) => (
            <button key={mode} onClick={() => setNavMode(mode)} style={{
              padding: "4px 8px", borderRadius: 4, fontSize: 8, fontWeight: 700, fontFamily: "var(--font-mono)",
              background: navMode === mode ? "var(--accent)" : "transparent",
              color: navMode === mode ? "#fff" : "var(--text-muted)",
              border: navMode === mode ? "1px solid var(--accent-border)" : "1px solid var(--border-default)",
              cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {mode === "firstperson" ? "FPS" : mode === "plan" ? "2D" : "ORBIT"}
            </button>
          ))}

          {modelLoaded && <div style={{ width: 1, height: 16, background: "var(--divider)" }} />}

          {/* View presets */}
          {modelLoaded && (
            <>
              <button onClick={() => fitCamera(loadedModelRef.current)} title="Fit all (F)" style={tbBtn}>
                \u229E FIT
              </button>
              {["Iso", "Front", "Top", "Right"].map((v) => (
                <button key={v} onClick={() => setView(v.toLowerCase())} style={{ ...tbBtn, fontSize: 8 }}>
                  {v.toUpperCase()}
                </button>
              ))}
            </>
          )}

          {modelLoaded && <div style={{ width: 1, height: 16, background: "var(--divider)" }} />}

          {/* List toggle */}
          {members.length > 0 && (
            <button onClick={() => setLeftPanelOpen((p) => !p)} title="Toggle element list ([)" style={{
              ...tbBtn, color: leftPanelOpen ? "var(--accent)" : "var(--text-muted)",
              background: leftPanelOpen ? "rgba(200,155,32,0.12)" : "transparent",
            }}>
              {leftPanelOpen ? "\u25C1 LIST" : "LIST \u25B7"}
            </button>
          )}

          {/* Upload */}
          <input id="model-upload" type="file" accept=".gltf,.glb,.ifc" style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0])} />
          <label htmlFor="model-upload" style={{
            padding: "5px 12px", borderRadius: 6, background: "var(--accent)", color: "#fff",
            fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            \u2191 Upload Model
          </label>
        </div>
      </div>

      {/* Control hints bar */}
      {modelLoaded && (
        <div style={{
          height: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
          background: "var(--bg-surface-low)", borderBottom: "1px solid var(--border-default)",
          fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em",
        }}>
          <span>LMB: Rotate</span>
          <span>RMB: Pan</span>
          <span>Scroll: Zoom</span>
          <span>F: Fit All</span>
          <span>1/2/3: Orbit/FPS/2D</span>
          <span>[: Toggle List</span>
        </div>
      )}

      {/* MAIN: Left Panel + Canvas */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Left panel — element list */}
        {members.length > 0 && (
          <div style={{
            width: leftPanelOpen ? 220 : 0, minWidth: leftPanelOpen ? 220 : 0,
            background: "var(--bg-surface-low)", borderRight: leftPanelOpen ? "1px solid var(--border-default)" : "none",
            display: "flex", flexDirection: "column", overflow: "hidden", transition: "width 0.2s, min-width 0.2s",
          }}>
            <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase", borderBottom: "1px solid var(--divider)" }}>
              ELEMENTS ({filteredMembers.length})
            </div>
            <input
              type="text" placeholder="Search..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
              style={{ margin: "8px", padding: "6px 10px", background: "var(--bg-sidebar)", border: "1px solid var(--border-default)", borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", outline: "none" }}
            />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ margin: "0 8px 8px", padding: "6px 10px", background: "var(--bg-sidebar)", border: "1px solid var(--border-default)", borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)" }}>
              <option value="all">All Types</option>
              {["COLUMN", "BEAM", "GIRDER", "SLAB", "BRACE", "STAIR", "WALL", "MEMBER"].map((t) => (
                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase() + "s"}</option>
              ))}
            </select>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
              {filteredMembers.map((m) => (
                <div
                  key={m.id}
                  onClick={() => selectMember(m)}
                  style={{
                    padding: "6px 10px", marginBottom: 2, borderRadius: 6, cursor: "pointer",
                    background: selectedMember?.id === m.id ? "rgba(245,158,11,0.12)" : "transparent",
                    borderLeft: selectedMember?.id === m.id ? "2px solid var(--accent)" : "2px solid transparent",
                    display: "flex", alignItems: "center", gap: 8, transition: "all 0.1s",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.name}>
                    {m.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3D Canvas */}
        <div
          ref={containerRef}
          style={{ flex: 1, position: "relative", overflow: "hidden" }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}
        >
          {/* Upload zone — shown when no model loaded */}
          {!modelLoaded && !loadingModel.active && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
            }}>
              <div style={{
                background: "rgba(20,20,22,0.85)", border: `2px dashed ${isDragging ? "var(--accent)" : "rgba(245,158,11,0.4)"}`,
                borderRadius: 16, padding: 40, textAlign: "center", maxWidth: 400,
                transform: isDragging ? "scale(1.02)" : "scale(1)", transition: "all 0.2s",
              }}>
                <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.6 }}>{"\u2B06"}</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#F2F4F8", marginBottom: 8 }}>
                  Drop GLTF / GLB / IFC here
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                  or click to browse
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 16 }}>
                  Supported: .gltf .glb .ifc
                </div>
                <label htmlFor="model-upload" style={{
                  padding: "6px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff",
                  fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                  Browse Files
                </label>
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {loadingModel.active && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(8,11,18,0.95)", backdropFilter: "blur(8px)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, zIndex: 100,
            }}>
              <div style={{ width: 60, height: 60, border: "2px solid rgba(245,158,11,0.2)", borderTop: "3px solid var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)" }}>{loadingModel.status}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{loadingModel.fileName}</div>
              <div style={{ width: 360, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${loadingModel.progress}%`, height: "100%", background: "var(--accent)", borderRadius: 3, transition: "width 0.3s ease" }} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{loadingModel.progress}%</div>
            </div>
          )}

          {/* Error overlay */}
          {uploadError && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(13,17,23,0.95)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
            }}>
              <div style={{ background: "var(--bg-surface-low)", border: "1px solid rgba(255,61,61,0.3)", borderRadius: 12, padding: 20, maxWidth: 400, textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--status-error)", fontWeight: 700, marginBottom: 8 }}>Load Error</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "rgba(220,225,240,0.72)", marginBottom: 16 }}>{uploadError}</div>
                <button onClick={() => setUploadError(null)} style={{
                  padding: "6px 12px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)",
                  borderRadius: 6, color: "var(--accent)", fontFamily: "var(--font-body)", fontSize: 11, cursor: "pointer",
                }}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — selected element detail */}
        {selectedMember && (
          <div style={{
            width: 280, minWidth: 280, background: "var(--bg-surface-low)", borderLeft: "3px solid var(--accent)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{ padding: "12px 14px", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", borderBottom: "1px solid var(--divider)" }}>
              {selectedMember.name}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.14em", marginBottom: 8, textTransform: "uppercase" }}>Properties</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 2 }}>
                <div><span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Type: </span>{selectedMember.type}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Color: </span>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: selectedMember.color, display: "inline-block" }} />
                  <span>{selectedMember.color}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedMember(null)} style={{
              margin: "8px 12px", padding: "8px 12px", background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-muted)",
              fontFamily: "var(--font-body)", fontSize: 11, cursor: "pointer",
            }}>
              Close
            </button>
          </div>
        )}
      </div>

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const tbBtn = {
  padding: "4px 8px", borderRadius: 4, background: "transparent", border: "1px solid var(--border-default)",
  color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, cursor: "pointer",
  letterSpacing: "0.06em", textTransform: "uppercase",
};
