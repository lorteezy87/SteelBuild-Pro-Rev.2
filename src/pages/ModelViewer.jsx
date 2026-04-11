import React, { useState, useEffect, useRef, useCallback, useMemo, } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ─── IFC via runtime-loaded web-ifc (NOT bundled through Rollup) ──────────
// Rollup's minification corrupts Emscripten's WASM glue code, so we load
// web-ifc-api-browser.js as a classic <script> from /public/wasm/.  The IIFE
// assigns `var WebIFC = (...)()` which becomes a global in classic-script mode.
const IFC_WASM_PATH = "/wasm/";

let _webIfcPromise = null;
function loadWebIFC() {
  if (_webIfcPromise) return _webIfcPromise;
  _webIfcPromise = new Promise((resolve, reject) => {
    if (window.WebIFC) return resolve(window.WebIFC);
    const s = document.createElement("script");
    s.src = "/wasm/web-ifc-api-browser.js";
    s.onload = () => (window.WebIFC ? resolve(window.WebIFC) : reject(new Error("WebIFC not found after script load")));
    s.onerror = () => reject(new Error("Failed to load web-ifc from /wasm/"));
    document.head.appendChild(s);
  });
  return _webIfcPromise;
}

// ─── STATUS COLOR MAPPING ─────────────────────────────────────────
const STATUS_COLORS = {
  'Not Started': { color: 0x6B7280, label: 'Not Started', cssColor: '#6B7280' },
  'Detailing':   { color: 0xF59E0B, label: 'Detailing', cssColor: '#F59E0B' },
  'Fabrication': { color: 0x3B82F6, label: 'In Fabrication', cssColor: '#3B82F6' },
  'Shipped':     { color: 0x10B981, label: 'Shipped/On-site', cssColor: '#10B981' },
  'Erected':     { color: 0x8B5CF6, label: 'Erected', cssColor: '#8B5CF6' },
  'Blocked':     { color: 0xEF4444, label: 'Blocked', cssColor: '#EF4444' },
};

// Seeded pseudo-random for deterministic "Blocked" assignment
function seededRandom(seed) {
  let x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ─── THREE.JS SCENE INITIALIZATION ────────────────────────────────
export default function ModelViewer() {
  const mountRef = useRef(null);
  const sceneRef = useRef({});
  const [loadError, setLoadError] = useState(null);

  // State
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [loadingModel, setLoadingModel] = useState({
    active: false, progress: 0, status: "", fileName: ""
  });
  const [modelLoaded, setModelLoaded] = useState(null);
  const [colorMode, setColorMode] = useState("none");
  const [filterType, setFilterType] = useState("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [colorByStatus, setColorByStatus] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);
  const [statusCounts, setStatusCounts] = useState({});
  const [statusAssignments, setStatusAssignments] = useState(new Map());
  const originalMaterialsRef = useRef(new Map());

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages"],
    queryFn: () => base44.entities.WorkPackage.list(),
  });

  // ─── THREE.JS SCENE INITIALIZATION ────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;
    if (sceneRef.current.initialized) return;

    let rafInit;
    rafInit = requestAnimationFrame(() => {
      if (!mountRef.current || sceneRef.current.initialized) return;

      const width = mountRef.current.clientWidth || 800;
      const height = mountRef.current.clientHeight || 600;

      // Scene — bright CAD-style background like BIMvision
      const scene = new THREE.Scene();
      // Gradient sky: light gray top to white bottom
      const canvas = document.createElement('canvas');
      canvas.width = 2; canvas.height = 512;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#E8ECF0');
      grad.addColorStop(0.4, '#F2F4F6');
      grad.addColorStop(1, '#FFFFFF');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 2, 512);
      const bgTex = new THREE.CanvasTexture(canvas);
      bgTex.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = bgTex;
      // No fog — BIMvision doesn't use it

      // Camera — elevated and pulled back for better framing
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 5000);
      camera.position.set(40, 30, 50);

      // Renderer — bright, no tone mapping (CAD-style direct colors)
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      mountRef.current.appendChild(renderer.domElement);

      // Controls — target slightly above grid so model appears elevated
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 0.5;
      controls.maxDistance = 1000;
      controls.target.set(0, 5, 0);

      // Lights — bright studio lighting for vivid steel colors
      scene.add(new THREE.AmbientLight(0xFFFFFF, 0.6));
      const sun = new THREE.DirectionalLight(0xFFFFFF, 1.4);
      sun.position.set(50, 100, 60);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      scene.add(sun);
      // Key light from opposite side
      const fill = new THREE.DirectionalLight(0xE8F0FF, 0.8);
      fill.position.set(-40, 80, -30);
      scene.add(fill);
      // Rim light from below for depth
      const rim = new THREE.DirectionalLight(0xFFFFFF, 0.3);
      rim.position.set(0, -20, 40);
      scene.add(rim);
      scene.add(new THREE.HemisphereLight(0xDDE4EE, 0xA0B0C0, 0.8));

      // Grid — visible professional CAD grid on the ground plane
      const grid = new THREE.GridHelper(200, 40, 0xB0B8C4, 0xD0D8E0);
      grid.material.opacity = 0.5;
      grid.material.transparent = true;
      grid.name = '__grid__';
      scene.add(grid);

      // Animation loop
      let animFrameId;
      const animate = () => {
        animFrameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Resize handler — use ResizeObserver for reliable container tracking
      const onResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      };
      window.addEventListener('resize', onResize);

      let resizeObserver;
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => onResize());
        resizeObserver.observe(mountRef.current);
      }

      // Also trigger resize after flex layout settles
      setTimeout(onResize, 100);

      // Store refs
      sceneRef.current = {
        scene, camera, renderer, controls,
        initialized: true, animFrameId, onResize, resizeObserver
      };
    });

    // Cleanup
    return () => {
      cancelAnimationFrame(rafInit);
      if (sceneRef.current.initialized) {
        cancelAnimationFrame(sceneRef.current.animFrameId);
        if (sceneRef.current.onResize) window.removeEventListener('resize', sceneRef.current.onResize);
        if (sceneRef.current.resizeObserver) sceneRef.current.resizeObserver.disconnect();
        sceneRef.current.controls?.dispose();
        sceneRef.current.renderer?.dispose();
        if (mountRef.current && sceneRef.current.renderer?.domElement?.parentNode === mountRef.current) {
          mountRef.current.removeChild(sceneRef.current.renderer.domElement);
        }
        sceneRef.current = {};
      }
    };
  }, []);

  // ─── MEMBER TYPE INFERENCE ────────────────────────────────────
  const inferMemberType = (name = '') => {
    const n = name.toUpperCase();
    if (/COL|COLUMN|PILLAR|POST/.test(n)) return 'COLUMN';
    if (/GIR|GIRDER|MAINBEAM/.test(n)) return 'GIRDER';
    if (/BM|BEAM|JOIST|PURLIN/.test(n)) return 'BEAM';
    if (/SLAB|DECK|FLOOR|PLATE/.test(n)) return 'SLAB';
    if (/BRAC|BRACE|DIAGONAL|HSS/.test(n)) return 'BRACE';
    if (/STAIR|STEP|RISER/.test(n)) return 'STAIR';
    if (/WALL|SHEAR/.test(n)) return 'WALL';
    return 'MEMBER';
  };

  // BIMvision-style vivid steel colors
  const TYPE_COLORS = {
    COLUMN: 0x9B59B6,  // vivid purple
    GIRDER: 0x2C3E50,  // dark steel blue
    BEAM:   0x3498DB,  // bright blue
    SLAB:   0x27AE60,  // strong green
    BRACE:  0xE67E22,  // burnt orange
    STAIR:  0xF1C40F,  // golden yellow
    WALL:   0x95A5A6,  // silver gray
    MEMBER: 0x7F8C8D,  // warm gray
  };

  const getStatusColor = (type) => {
    return TYPE_COLORS[type] || TYPE_COLORS.MEMBER;
  };

  // ─── COLOR MODE APPLICATION ───────────────────────────────────
  const applyColorMode = useCallback((memberList, mode) => {
    if (!sceneRef.current.scene || !memberList) return;

    memberList.forEach((member) => {
      const color = TYPE_COLORS[member.type] || TYPE_COLORS.MEMBER;

      if (mode === "none" && member.mesh?.userData?.originalMaterial) {
        // Restore original material
        member.mesh.material = member.mesh.userData.originalMaterial.clone();
      } else if (member.mesh?.material) {
        member.mesh.material.color.setHex(color);
        // Boost vivid appearance
        if (member.mesh.material.shininess !== undefined) {
          member.mesh.material.shininess = 40;
        }
      }
    });
  }, []);

  // ─── FIT CAMERA TO MODEL (FOV-based) ───────────────────────────
  // Computes exact distance so entire model fits in view with padding
  const fitCameraToModel = useCallback((preset = 'iso') => {
    const { camera, controls, loadedModel } = sceneRef.current;
    if (!camera || !loadedModel) return;

    // Force world matrix update after any position changes
    loadedModel.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(loadedModel);
    const ctr = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(sz.x, sz.y, sz.z);
    if (maxDim <= 0) return;

    // Use the largest single dimension (not diagonal) for more intuitive framing,
    // then apply generous 2.5x padding so the full structure is clearly visible
    const fovRad = camera.fov * (Math.PI / 180);
    const d = (maxDim / Math.tan(fovRad / 2)) * 2.5;

    // Update near/far planes for the model's scale
    camera.near = Math.max(0.1, d * 0.001);
    camera.far = d * 30;
    camera.updateProjectionMatrix();

    // Place camera at exactly distance d along the chosen direction
    const dir = new THREE.Vector3();
    switch (preset) {
      case 'front':  dir.set(0, 0, 1); break;
      case 'back':   dir.set(0, 0, -1); break;
      case 'top':    dir.set(0, 1, 0.001); break;
      case 'right':  dir.set(1, 0, 0); break;
      case 'left':   dir.set(-1, 0, 0); break;
      case 'iso':
      default:       dir.set(1, 0.75, 1); break;
    }
    dir.normalize();
    camera.position.copy(ctr).addScaledVector(dir, d);

    controls.target.copy(ctr);
    camera.lookAt(ctr);
    controls.update();

    // Scale grid to match model extent
    const { scene } = sceneRef.current;
    if (scene) {
      const oldGrid = scene.getObjectByName('__grid__');
      if (oldGrid) scene.remove(oldGrid);
      const gridSize = maxDim * 3;
      const gridDivs = 40;
      const newGrid = new THREE.GridHelper(gridSize, gridDivs, 0xB0B8C4, 0xD0D8E0);
      newGrid.material.opacity = 0.5;
      newGrid.material.transparent = true;
      newGrid.name = '__grid__';
      scene.add(newGrid);
    }
  }, []);

  // ─── KEYBOARD SHORTCUTS ──────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '[') setLeftPanelOpen(p => !p);
      if (e.key === ']') setRightPanelOpen(p => !p);
      if (e.key === 'f' || e.key === 'F') {
        fitCameraToModel('iso');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fitCameraToModel]);

  // ─── TOGGLE EDGE OUTLINES ────────────────────────────────────
  const toggleEdges = useCallback((visible) => {
    const model = sceneRef.current.loadedModel;
    if (!model) return;
    model.traverse((child) => {
      if (child.userData?._isEdge) child.visible = visible;
    });
  }, []);

  // ─── COLOR BY STATUS LOGIC ────────────────────────────────────
  const applyStatusColors = useCallback(() => {
    const model = sceneRef.current.loadedModel;
    if (!model) return;

    // Compute the bounding box to classify by Y position
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const minY = box.min.y;
    const maxY = box.max.y;
    const rangeY = maxY - minY || 1;

    const counts = {};
    Object.keys(STATUS_COLORS).forEach(k => { counts[k] = 0; });
    const assignments = new Map();

    let meshIndex = 0;
    model.traverse((child) => {
      if (!child.isMesh) return;
      if (child.userData?._isEdge) return;

      // Store original material
      if (!originalMaterialsRef.current.has(child.uuid)) {
        originalMaterialsRef.current.set(
          child.uuid,
          Array.isArray(child.material)
            ? child.material.map(m => m.clone())
            : child.material.clone()
        );
      }

      // Determine status based on Y position + seeded random for "Blocked"
      const worldPos = new THREE.Vector3();
      child.getWorldPosition(worldPos);
      const normalizedY = (worldPos.y - minY) / rangeY;

      let status;
      if (seededRandom(meshIndex) < 0.10) {
        status = 'Blocked';
      } else if (normalizedY < 0.33) {
        status = 'Erected';
      } else if (normalizedY < 0.66) {
        status = 'Fabrication';
      } else {
        status = 'Detailing';
      }

      assignments.set(child.uuid, status);
      counts[status] = (counts[status] || 0) + 1;

      // Apply the status color material
      const statusDef = STATUS_COLORS[status];
      child.material = new THREE.MeshPhongMaterial({
        color: statusDef.color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        shininess: 30,
        specular: new THREE.Color(0x222222),
      });

      meshIndex++;
    });

    // If no meshes got "Not Started" or "Shipped", sprinkle some in for realism
    // (The remaining meshes that weren't assigned Blocked fall into 3 height buckets,
    //  so Not Started and Shipped won't appear unless we assign them. That's fine —
    //  real data would drive this. We leave them at zero counts.)

    setStatusCounts(counts);
    setStatusAssignments(assignments);
  }, []);

  const restoreOriginalMaterials = useCallback(() => {
    const model = sceneRef.current.loadedModel;
    if (!model) return;

    model.traverse((child) => {
      if (!child.isMesh) return;
      const orig = originalMaterialsRef.current.get(child.uuid);
      if (orig) {
        child.material = Array.isArray(orig) ? orig.map(m => m.clone()) : orig.clone();
      }
    });

    originalMaterialsRef.current.clear();
    setStatusCounts({});
    setStatusAssignments(new Map());
    setSelectedElement(null);
  }, []);

  // Apply/restore when colorByStatus changes
  useEffect(() => {
    if (colorByStatus) {
      applyStatusColors();
    } else {
      restoreOriginalMaterials();
    }
  }, [colorByStatus, applyStatusColors, restoreOriginalMaterials]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      originalMaterialsRef.current.clear();
    };
  }, []);

  // ─── STATUS CLICK HANDLER (RAYCASTING) ───────────────────────
  const handleStatusClick = useCallback((e) => {
    if (!colorByStatus) return;
    if (!sceneRef.current.camera || !sceneRef.current.renderer) return;

    const model = sceneRef.current.loadedModel;
    if (!model) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const rect = sceneRef.current.renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, sceneRef.current.camera);

    // Collect all meshes (not edge lines)
    const meshes = [];
    model.traverse((child) => {
      if (child.isMesh && !child.userData?._isEdge) meshes.push(child);
    });

    const hits = raycaster.intersectObjects(meshes, false);

    if (hits.length > 0) {
      const hit = hits[0].object;
      const status = statusAssignments.get(hit.uuid);
      const member = members.find(m => m.id === hit.uuid);
      setSelectedElement({
        name: member?.name || hit.name || `Element #${hit.uuid.slice(0, 6)}`,
        status: status || 'Not Started',
        screenX: e.clientX,
        screenY: e.clientY,
      });
    } else {
      setSelectedElement(null);
    }
  }, [colorByStatus, statusAssignments, members]);

  // ─── GLTF FILE UPLOAD HANDLER ─────────────────────────────────
  const handleGLTFUpload = useCallback((file) => {
    if (!sceneRef.current.initialized) {
      alert('3D engine still loading — please wait a moment');
      return;
    }

    const { scene, camera, controls } = sceneRef.current;

    // Validate file
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['gltf', 'glb'].includes(ext)) {
      setUploadError('Please upload a .gltf or .glb file');
      return;
    }


    // Reset color-by-status on new model load
    setColorByStatus(false);
    originalMaterialsRef.current.clear();
    setStatusCounts({});
    setStatusAssignments(new Map());
    setSelectedElement(null);

    setLoadingModel({
      active: true, progress: 0,
      status: 'Reading file...', fileName: file.name
    });

    // Remove existing model
    if (sceneRef.current.loadedModel) {
      scene.remove(sceneRef.current.loadedModel);
      sceneRef.current.loadedModel = null;
    }

    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();

    loader.load(
      url,
      // SUCCESS
      (gltf) => {
        setLoadingModel(p => ({ ...p, progress: 80, status: 'Processing geometry...' }));

        const model = gltf.scene;
        scene.add(model);
        sceneRef.current.loadedModel = model;

        // Center model at origin so it sits on the grid
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // Build member index
        setLoadingModel(p => ({ ...p, progress: 90, status: 'Indexing members...' }));
        
        const memberList = [];
        model.traverse((child) => {
          if (child.isMesh) {
            // Store original material
            if (Array.isArray(child.material)) {
              child.userData.originalMaterials = child.material.map(m => m.clone());
            } else {
              child.userData.originalMaterial = child.material?.clone();
            }
            
            const inferredType = inferMemberType(child.name);
            memberList.push({
              id: child.uuid,
              name: child.name || `Mesh_${memberList.length + 1}`,
              type: inferredType,
              color: getStatusColor(inferredType),
              mesh: child,
            });
          }
        });

        setMembers(memberList);
        applyColorMode(memberList, colorMode);

        // Add edge outlines to GLTF meshes for BIMvision-style crisp edges
        model.traverse((child) => {
          if (child.isMesh && child.geometry) {
            try {
              const edgesGeom = new THREE.EdgesGeometry(child.geometry, 15);
              const edgesMat = new THREE.LineBasicMaterial({ color: 0x2C3E50, opacity: 0.5, transparent: true });
              const edges = new THREE.LineSegments(edgesGeom, edgesMat);
              edges.userData._isEdge = true;
              child.add(edges);
            } catch(_) {}
          }
        });

        // Auto-frame using FOV-based calculation
        fitCameraToModel('iso');

        setLoadingModel(p => ({
          ...p, progress: 100,
          status: `✓ ${memberList.length} members loaded`
        }));

        setTimeout(() => {
          setLoadingModel({ active: false });
          setModelLoaded({ name: file.name, memberCount: memberList.length, format: ext.toUpperCase() });
        }, 1000);

        URL.revokeObjectURL(url);
      },
      // PROGRESS
      (xhr) => {
        if (xhr.total > 0) {
          const pct = Math.round((xhr.loaded / xhr.total) * 70);
          setLoadingModel(p => ({ 
            ...p, progress: pct, 
            status: `Loading geometry... ${pct}%` 
          }));
        }
      },
      // ERROR
      (error) => {
        console.error('GLTF load error:', error);
        URL.revokeObjectURL(url);
        setLoadingModel({ active: false });
        setUploadError(
          `Failed to load model: ${error.message || 'Unknown error'}. ` +
          `Ensure file is valid GLTF 2.0 or GLB format.`
        );
      }
    );
  }, [colorMode, applyColorMode]);

  // ─── IFC FILE UPLOAD HANDLER ──────────────────────────────────
  const handleIFCUpload = useCallback(async (file) => {
    if (!sceneRef.current.initialized) {
      alert('3D engine still loading');
      return;
    }

    const { scene, camera, controls } = sceneRef.current;

    // Reset color-by-status on new model load
    setColorByStatus(false);
    originalMaterialsRef.current.clear();
    setStatusCounts({});
    setStatusAssignments(new Map());
    setSelectedElement(null);

    setLoadingModel({ active: true, progress: 0, status: 'Initializing IFC loader...', fileName: file.name });

    if (sceneRef.current.loadedModel) {
      scene.remove(sceneRef.current.loadedModel);
      sceneRef.current.loadedModel = null;
    }

    try {
      setLoadingModel(p => ({ ...p, progress: 5, status: 'Loading IFC engine...' }));

      const WebIFC = await loadWebIFC();

      // Re-use IfcAPI instance across loads
      let ifcApi = sceneRef.current.ifcApi;
      if (!ifcApi) {
        ifcApi = new WebIFC.IfcAPI();
        ifcApi.SetWasmPath(IFC_WASM_PATH, true);
        await ifcApi.Init();
        sceneRef.current.ifcApi = ifcApi;
      }

      setLoadingModel(p => ({ ...p, progress: 20, status: 'Reading IFC file...' }));

      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const modelID = ifcApi.OpenModel(data);

      setLoadingModel(p => ({ ...p, progress: 40, status: 'Extracting geometry...' }));

      // Load all geometry from the IFC model
      const flatMeshes = ifcApi.LoadAllGeometry(modelID);
      const model = new THREE.Group();
      model.name = file.name;

      for (let i = 0; i < flatMeshes.size(); i++) {
        const flatMesh = flatMeshes.get(i);
        for (let j = 0; j < flatMesh.geometries.size(); j++) {
          const placement = flatMesh.geometries.get(j);
          const ifcGeom = ifcApi.GetGeometry(modelID, placement.geometryExpressID);

          const verts = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
          const idx = ifcApi.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

          // web-ifc returns 6 floats per vertex: x,y,z, nx,ny,nz
          const posArr = new Float32Array(verts.length / 2);
          const normArr = new Float32Array(verts.length / 2);
          for (let v = 0; v < verts.length; v += 6) {
            const o = (v / 6) * 3;
            posArr[o] = verts[v]; posArr[o+1] = verts[v+1]; posArr[o+2] = verts[v+2];
            normArr[o] = verts[v+3]; normArr[o+1] = verts[v+4]; normArr[o+2] = verts[v+5];
          }

          const geom = new THREE.BufferGeometry();
          geom.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
          geom.setAttribute("normal", new THREE.Float32BufferAttribute(normArr, 3));
          geom.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));

          const c = placement.color;
          const mat = new THREE.MeshPhongMaterial({
            color: new THREE.Color(c.x, c.y, c.z),
            opacity: c.w,
            transparent: c.w < 1,
            side: THREE.DoubleSide,
            shininess: 40,
            specular: new THREE.Color(0x444444),
          });

          const mesh = new THREE.Mesh(geom, mat);
          mesh.applyMatrix4(new THREE.Matrix4().fromArray(placement.flatTransformation));
          mesh.userData.expressID = flatMesh.expressID;
          model.add(mesh);

          // Edge outlines for crisp BIMvision look
          try {
            const edgesGeom = new THREE.EdgesGeometry(geom, 15);
            const edgesMat = new THREE.LineBasicMaterial({ color: 0x2C3E50, opacity: 0.5, transparent: true });
            const edges = new THREE.LineSegments(edgesGeom, edgesMat);
            edges.applyMatrix4(new THREE.Matrix4().fromArray(placement.flatTransformation));
            edges.userData._isEdge = true;
            model.add(edges);
          } catch(_) {}

          ifcGeom.delete();
        }
      }

      ifcApi.CloseModel(modelID);

      setLoadingModel(p => ({ ...p, progress: 85, status: 'Indexing elements...' }));

      scene.add(model);
      sceneRef.current.loadedModel = model;

      // Center model at origin
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      const IFC_TYPE_MAP = {
        'IFCBEAM': 'BEAM', 'IFCCOLUMN': 'COLUMN', 'IFCSLAB': 'SLAB',
        'IFCWALL': 'WALL', 'IFCWALLSTANDARDCASE': 'WALL', 'IFCMEMBER': 'MEMBER',
        'IFCPLATE': 'SLAB', 'IFCRAILING': 'MEMBER', 'IFCSTAIR': 'STAIR',
        'IFCSTAIRFLIGHT': 'STAIR', 'IFCFOOTING': 'MEMBER', 'IFCPILE': 'COLUMN',
      };

      const memberList = [];
      model.traverse((child) => {
        if (child.isMesh) {
          const ifcType = child.userData?.type || child.name?.split(':')[0]?.toUpperCase() || 'MEMBER';
          const mappedType = IFC_TYPE_MAP[ifcType] || inferMemberType(child.name || '');
          memberList.push({
            id: child.uuid,
            name: child.name || child.userData?.Name || `Element ${memberList.length + 1}`,
            type: mappedType,
            ifcType,
            expressId: child.userData?.expressID,
            color: getStatusColor(mappedType),
            mesh: child,
          });
        }
      });

      setMembers(memberList);
      applyColorMode(memberList, colorMode);

      // Auto-frame using FOV-based calculation
      fitCameraToModel('iso');

      setLoadingModel(p => ({ ...p, progress: 100, status: `✓ ${memberList.length} elements loaded` }));

      setTimeout(() => {
        setLoadingModel({ active: false });
        setModelLoaded({ name: file.name, memberCount: memberList.length, format: 'IFC' });
      }, 800);

    } catch (err) {
      console.error('IFC load error:', err);
      setLoadingModel({ active: false });
      setUploadError(`Failed to load IFC: ${err.message || 'Unknown error'}. Ensure the file is a valid IFC 2x3 or IFC 4 file.`);
    }
  }, [colorMode, applyColorMode]);

  // ─── FILE INPUT HANDLER ────────────────────────────────────────
  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'ifc') {
      handleIFCUpload(file);
    } else {
      handleGLTFUpload(file);
    }
  };

  // ─── DRAG & DROP HANDLERS ──────────────────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files.length) return;
    const file = files[0];
    const ext = file.name.split('.').pop().toLowerCase();
    if (['gltf', 'glb', 'ifc'].includes(ext)) {
      if (ext === 'ifc') {
        handleIFCUpload(file);
      } else {
        handleGLTFUpload(file);
      }
    } else {
      setUploadError('Please drop a .gltf, .glb, or .ifc file');
    }
  };

  // ─── CLICK TO SELECT ───────────────────────────────────────────
  const handleCanvasClick = useCallback(async (e) => {
    if (!sceneRef.current.camera || !sceneRef.current.renderer || members.length === 0) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const rect = sceneRef.current.renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, sceneRef.current.camera);

    const meshes = members.map(m => m.mesh);
    const hits = raycaster.intersectObjects(meshes, false);

    if (hits.length > 0) {
      const hit = hits[0].object;
      const member = members.find(m => m.id === hit.uuid);
      if (member) {
        setSelectedMember(member);
        // Try to fetch IFC properties if available
        if (member.expressId && sceneRef.current.ifcLoader) {
          try {
            const props = await sceneRef.current.ifcLoader.ifcManager.getItemProperties(0, member.expressId, true);
            setSelectedMember(m => ({ ...m, ifcProps: props }));
          } catch(e) {
            // IFC props not available
          }
        }
      }
    } else {
      setSelectedMember(null);
    }
  }, [members]);

  // ─── FILTERED MEMBERS ──────────────────────────────────────────
  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const matchSearch = !memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase());
      const matchType = filterType === 'all' || m.type === filterType;
      return matchSearch && matchType;
    });
  }, [members, memberSearch, filterType]);

  if (loadError) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-page)',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--status-error)', fontWeight: 700 }}>
          3D Engine Error
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)', maxWidth: 400, textAlign: 'center' }}>
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      height: '100%',
      background: 'var(--bg-page)',
    }}>
      {/* TOOLBAR */}
      <div style={{
        height: 48,
        background: 'var(--bg-page)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          3D MODEL VIEWER
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Panel toggles */}
          {members.length > 0 && (
            <button
              onClick={() => setLeftPanelOpen(p => !p)}
              title={leftPanelOpen ? "Hide member list" : "Show member list"}
              style={{
                padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)',
                background: leftPanelOpen ? 'rgba(200,155,32,0.12)' : 'transparent',
                color: leftPanelOpen ? 'var(--accent)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {leftPanelOpen ? '◁ LIST' : 'LIST ▷'}
            </button>
          )}

          {/* View presets */}
          {modelLoaded && (
            <>
              <button
                onClick={() => fitCameraToModel('iso')}
                style={{
                  padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent', color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                }}
                title="Isometric view (F)"
              >
                ⊞ FIT
              </button>
              {['Front', 'Top', 'Right', 'Back'].map(v => (
                <button
                  key={v}
                  onClick={() => fitCameraToModel(v.toLowerCase())}
                  style={{
                    padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)',
                    background: 'transparent', color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}
                >
                  {v}
                </button>
              ))}

              {/* Edge toggle */}
              <button
                onClick={() => {
                  const next = !showEdges;
                  setShowEdges(next);
                  toggleEdges(next);
                }}
                style={{
                  padding: '5px 10px', borderRadius: 6,
                  border: showEdges ? '1px solid rgba(52,152,219,0.5)' : '1px solid rgba(255,255,255,0.12)',
                  background: showEdges ? 'rgba(52,152,219,0.12)' : 'transparent',
                  color: showEdges ? '#3498DB' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                }}
                title="Toggle edge outlines"
              >
                EDGES
              </button>

              {/* Color-by-Status toggle */}
              <button
                onClick={() => setColorByStatus(prev => !prev)}
                style={{
                  padding: '5px 10px', borderRadius: 6,
                  border: colorByStatus ? '1px solid rgba(139,92,246,0.5)' : '1px solid var(--border-default)',
                  background: colorByStatus ? 'rgba(139,92,246,0.15)' : 'transparent',
                  color: colorByStatus ? '#8B5CF6' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                }}
                title="Color meshes by work package status"
              >
                STATUS
              </button>
            </>
          )}

          <input
            type="file"
            accept=".gltf,.glb,.ifc"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            id="gltf-upload"
          />
          <label htmlFor="gltf-upload" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 8,
            padding: '6px 12px',
            color: '#fff',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}>
            ↑ Upload Model
          </label>

          {modelLoaded && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--status-success)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}>
              <span style={{
                background: 'var(--success-muted)',
                border: '1px solid var(--success-border)',
                borderRadius: 4,
                padding: '2px 7px',
                fontSize: 8,
                fontWeight: 700,
              }}>
                {modelLoaded.format || 'GLTF'}
              </span>
              {modelLoaded.memberCount} elements
            </div>
          )}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ display: 'flex', flex: 1, gap: 0, overflow: 'hidden' }}>
        {/* LEFT PANEL — Member List (collapsible) */}
        {members.length > 0 && (
          <div style={{
            width: leftPanelOpen ? 220 : 0,
            minWidth: leftPanelOpen ? 220 : 0,
            background: 'var(--bg-surface-low)',
            borderRight: leftPanelOpen ? '1px solid rgba(255,255,255,0.07)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'width 0.2s ease, min-width 0.2s ease',
          }}>
            <div style={{
              padding: '10px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--status-warning)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              MEMBERS ({filteredMembers.length})
            </div>

            <input
              type="text"
              placeholder="Search..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              style={{
                padding: '8px 10px',
                margin: '8px 8px',
                background: 'var(--bg-sidebar)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: 'var(--text-primary)',
                outline: 'none',
                }}
                />

                <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                padding: '8px 10px',
                margin: '0 8px 8px',
                background: 'var(--bg-sidebar)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: 'var(--text-primary)',
              }}
            >
              <option value="all">All Types</option>
              <option value="COLUMN">Columns</option>
              <option value="BEAM">Beams</option>
              <option value="GIRDER">Girders</option>
              <option value="SLAB">Slabs</option>
              <option value="BRACE">Braces</option>
            </select>

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
              {filteredMembers.map((member) => (
                <div
                  key={member.id}
                  onClick={() => setSelectedMember(member)}
                  onMouseEnter={(e) => {
                    if (sceneRef.current.renderer) {
                      sceneRef.current.renderer.domElement.addEventListener('click', handleCanvasClick);
                    }
                  }}
                  style={{
                    padding: '8px 10px',
                    marginBottom: 4,
                    borderRadius: 6,
                    background: selectedMember?.id === member.id ? 'rgba(245,158,11,0.12)' : 'transparent',
                    borderLeft: selectedMember?.id === member.id ? '2px solid var(--status-warning)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      selectedMember?.id === member.id ? 'rgba(245,158,11,0.12)' : 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: `#${member.color.toString(16).padStart(6, '0')}`,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--text-secondary)',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={member.name}
                    >
                      {member.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CENTER — 3D Canvas */}
        <div
          ref={mountRef}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: 'var(--bg-sidebar)',
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={(e) => {
            if (colorByStatus) {
              handleStatusClick(e);
            } else if (members.length > 0) {
              handleCanvasClick(e);
            }
          }}
        >
          {/* Upload zone overlay */}
          {members.length === 0 && !loadingModel.active && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 50,
              }}
            >
              <div
                style={{
                  background: 'rgba(20,20,22,0.85)',
                  border: `2px dashed ${isDragging ? 'var(--status-warning)' : 'rgba(245,158,11,0.4)'}`,
                  borderRadius: 16,
                  padding: 40,
                  textAlign: 'center',
                  maxWidth: 400,
                  transition: 'all 0.2s',
                  transform: isDragging ? 'scale(1.01)' : 'scale(1)',
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 16 }}>↑</div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: '#F2F4F8',
                  marginBottom: 4,
                }}>
                  Drop GLTF / GLB / IFC here
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  marginBottom: 16,
                }}>
                  or click to browse
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  marginBottom: 16,
                }}>
                  Supported: .gltf .glb .ifc
                </div>
                <label htmlFor="gltf-upload" style={{
                  display: 'inline-block',
                  padding: '6px 14px',
                  background: 'var(--status-warning)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}>
                  Browse Files
                </label>
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {loadingModel.active && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(8,11,18,0.95)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 20,
              zIndex: 100,
            }}>
              <div style={{
                width: 60,
                height: 60,
                border: '2px solid rgba(245,158,11,0.2)',
                borderTop: '3px solid var(--status-warning)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />

              <div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  marginBottom: 4,
                  textAlign: 'center',
                  }}>
                  {loadingModel.status}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                }}>
                  {loadingModel.fileName}
                </div>
              </div>

              <div style={{
                width: 360,
                height: 6,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 3,
                overflow: 'hidden',
                border: '1px solid var(--warning-muted)',
              }}>
                <div style={{
                  height: '100%',
                  width: `${loadingModel.progress}%`,
                  background: 'var(--status-warning)',
                  boxShadow: '0 0 12px rgba(245,158,11,0.4)',
                  transition: 'width 0.3s ease',
                }} />
              </div>

              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--status-warning)',
                fontWeight: 700,
              }}>
                {loadingModel.progress}%
              </div>
            </div>
          )}

          {/* Error overlay */}
          {uploadError && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(13,17,23,0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}>
              <div style={{
                background: 'var(--bg-surface-low)',
                border: '1px solid rgba(255,61,61,0.30)',
                borderRadius: 12,
                padding: 20,
                maxWidth: 400,
                textAlign: 'center',
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  color: 'var(--status-error)',
                  fontWeight: 700,
                  marginBottom: 8,
                }}>
                  Upload Error
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'rgba(220,225,240,0.72)',
                  marginBottom: 16,
                }}>
                  {uploadError}
                </div>
                <button
                  onClick={() => setUploadError(null)}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(245,158,11,0.12)',
                    border: '1px solid rgba(245,158,11,0.40)',
                    borderRadius: 6,
                    color: 'var(--status-warning)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Status Legend Overlay */}
          {colorByStatus && Object.keys(statusCounts).length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(8px)',
              borderRadius: 8,
              padding: '12px 16px',
              zIndex: 60,
              minWidth: 160,
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.6)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}>
                STATUS LEGEND
              </div>
              {Object.entries(STATUS_COLORS).map(([key, def]) => (
                <div key={key} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                }}>
                  <div style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: def.cssColor,
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: '#FFFFFF',
                    flex: 1,
                  }}>
                    {def.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.45)',
                  }}>
                    {statusCounts[key] || 0}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Click-to-identify info panel */}
          {selectedElement && colorByStatus && (
            <div
              onClick={(e) => { e.stopPropagation(); setSelectedElement(null); }}
              style={{
                position: 'fixed',
                left: Math.min(selectedElement.screenX + 12, window.innerWidth - 240),
                top: Math.min(selectedElement.screenY - 20, window.innerHeight - 120),
                background: 'rgba(0,0,0,0.85)',
                backdropFilter: 'blur(10px)',
                borderRadius: 8,
                padding: '10px 14px',
                zIndex: 200,
                minWidth: 180,
                border: `1px solid ${STATUS_COLORS[selectedElement.status]?.cssColor || 'rgba(255,255,255,0.15)'}`,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                cursor: 'pointer',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: '#FFFFFF',
                fontWeight: 700,
                marginBottom: 6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 200,
              }}>
                {selectedElement.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: STATUS_COLORS[selectedElement.status]?.cssColor || '#6B7280',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: STATUS_COLORS[selectedElement.status]?.cssColor || '#6B7280',
                  fontWeight: 600,
                }}>
                  {STATUS_COLORS[selectedElement.status]?.label || selectedElement.status}
                </span>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: 'rgba(255,255,255,0.35)',
              }}>
                Click anywhere to dismiss
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL — Inspector (collapsible) */}
        {selectedMember && (
          <div style={{
            width: rightPanelOpen ? 300 : 0,
            minWidth: rightPanelOpen ? 300 : 0,
            background: 'var(--bg-surface-low)',
            borderLeft: rightPanelOpen ? '3px solid var(--status-warning)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'width 0.2s ease, min-width 0.2s ease',
          }}>
            <div style={{
              padding: '12px 14px',
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 700,
              color: '#F2F4F8',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              {selectedMember.name}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}>
                  Properties
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.8,
                }}>
                  <div>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'var(--text-muted)',
                      }}>
                      Type:{" "}
                    </span>
                    <span>{selectedMember.type}</span>
                  </div>
                  <div>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'var(--text-muted)',
                      }}>
                      Color:{" "}
                    </span>
                    <span style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: `#${selectedMember.color.toString(16).padStart(6, '0')}`,
                      marginRight: 4,
                      verticalAlign: 'middle',
                    }} />
                    #{selectedMember.color.toString(16).padStart(6, '0').toUpperCase()}
                  </div>
                  {selectedMember.ifcType && (
                    <div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>IFC Type:{' '}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)' }}>{selectedMember.ifcType}</span>
                    </div>
                  )}
                  {selectedMember.expressId && (
                    <div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>Express ID:{' '}</span>
                      <span>{selectedMember.expressId}</span>
                    </div>
                  )}
                  </div>
                  {selectedMember.ifcProps && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)',
                      letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6,
                    }}>
                      IFC Properties
                    </div>
                    {Object.entries(selectedMember.ifcProps)
                      .filter(([k, v]) => v && typeof v !== 'object')
                      .slice(0, 10)
                      .map(([k, v]) => (
                        <div key={k} style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>{k}:{' '}</span>
                          {String(v?.value ?? v)}
                        </div>
                      ))
                    }
                  </div>
                  )}
              </div>
            </div>

            <button
              onClick={() => setSelectedMember(null)}
              style={{
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                cursor: 'pointer',
                margin: '8px 12px',
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
