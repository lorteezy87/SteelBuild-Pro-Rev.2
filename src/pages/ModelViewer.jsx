import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

      // Scene — lighter background so steel is visible
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0D1117);
      // Lighter fog, pushed far back so model isn't washed out
      scene.fog = new THREE.FogExp2(0x0D1117, 0.0008);

      // Camera — elevated and pulled back for better framing
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 5000);
      camera.position.set(40, 30, 50);

      // Renderer
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
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.6;
      mountRef.current.appendChild(renderer.domElement);

      // Controls — target slightly above grid so model appears elevated
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 0.5;
      controls.maxDistance = 1000;
      controls.target.set(0, 5, 0);

      // Lights — much brighter to illuminate steel surfaces
      scene.add(new THREE.AmbientLight(0x8090B0, 2.0));
      const sun = new THREE.DirectionalLight(0xFFEED8, 3.0);
      sun.position.set(60, 120, 80);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      scene.add(sun);
      // Back-fill light for depth
      const fill = new THREE.DirectionalLight(0xC8D0E0, 1.2);
      fill.position.set(-40, 60, -30);
      scene.add(fill);
      scene.add(new THREE.HemisphereLight(0x6080C0, 0x203040, 1.5));

      // Grid — visible but subtle, placed at Y=0 (model sits above it)
      const grid = new THREE.GridHelper(200, 40, 0x2A3040, 0x1A2030);
      grid.material.opacity = 0.6;
      grid.material.transparent = true;
      scene.add(grid);

      // Animation loop
      let animFrameId;
      const animate = () => {
        animFrameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Resize handler
      const onResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth || width;
        const h = mountRef.current.clientHeight || height;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      // Store refs
      sceneRef.current = { 
        scene, camera, renderer, controls, 
        initialized: true, animFrameId, onResize 
      };
    });

    // Cleanup
    return () => {
      cancelAnimationFrame(rafInit);
      if (sceneRef.current.initialized) {
        cancelAnimationFrame(sceneRef.current.animFrameId);
        if (sceneRef.current.onResize) window.removeEventListener('resize', sceneRef.current.onResize);
        sceneRef.current.controls?.dispose();
        sceneRef.current.renderer?.dispose();
        if (mountRef.current && sceneRef.current.renderer?.domElement?.parentNode === mountRef.current) {
          mountRef.current.removeChild(sceneRef.current.renderer.domElement);
        }
        sceneRef.current = {};
      }
    };
  }, []);

  // ─── KEYBOARD SHORTCUTS ──────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '[') setLeftPanelOpen(p => !p);
      if (e.key === ']') setRightPanelOpen(p => !p);
      if (e.key === 'f' || e.key === 'F') {
        // Fit view
        const { scene, camera, controls } = sceneRef.current;
        if (!scene || !camera) return;
        const box = new THREE.Box3().setFromObject(scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length();
        if (size > 0) {
          controls.target.copy(center);
          camera.position.set(center.x + size * 0.6, center.y + size * 0.4, center.z + size * 0.6);
          camera.lookAt(center);
          controls.update();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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

  const TYPE_COLORS = {
    COLUMN: 0xF59E0B,
    GIRDER: 0xF59E0B,
    BEAM: 0x3B82F6,
    SLAB: 0x8B5CF6,
    BRACE: 0x00D68F,
    STAIR: 0xFFB020,
    WALL: 0x6B7A8D,
    MEMBER: 0x2A3040,
  };

  const getStatusColor = (type) => {
    return TYPE_COLORS[type] || TYPE_COLORS.MEMBER;
  };

  // ─── COLOR MODE APPLICATION ───────────────────────────────────
  const applyColorMode = useCallback((memberList, mode) => {
    if (!sceneRef.current.scene || !memberList) return;

    memberList.forEach((member) => {
      let color = TYPE_COLORS[member.type] || TYPE_COLORS.MEMBER;

      if (mode === "workpackage" && member.mesh?.material?.color) {
        member.mesh.material.color.setHex(color);
      } else if (member.mesh?.material?.color) {
        member.mesh.material.color.setHex(color);
      }
    });
  }, []);

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

        // Fit camera to model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        const dist = Math.abs(maxDim / Math.sin(fov / 2)) * 0.8;

        // Center model at origin
        model.position.sub(center);

        camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
        camera.near = dist * 0.001;
        camera.far = dist * 10;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();

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

        // Auto-frame the model so it sits visibly above the grid
        { const bb = new THREE.Box3().setFromObject(scene);
          const ctr = bb.getCenter(new THREE.Vector3());
          const span = bb.getSize(new THREE.Vector3()).length();
          if (span > 0) {
            controls.target.copy(ctr);
            camera.position.set(ctr.x + span * 0.6, ctr.y + span * 0.4, ctr.z + span * 0.6);
            camera.lookAt(ctr);
            controls.update();
          }
        }

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
          });

          const mesh = new THREE.Mesh(geom, mat);
          mesh.applyMatrix4(new THREE.Matrix4().fromArray(placement.flatTransformation));
          mesh.userData.expressID = flatMesh.expressID;
          model.add(mesh);

          ifcGeom.delete();
        }
      }

      ifcApi.CloseModel(modelID);

      setLoadingModel(p => ({ ...p, progress: 85, status: 'Indexing elements...' }));

      scene.add(model);
      sceneRef.current.loadedModel = model;

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      const dist = Math.abs(maxDim / Math.sin(fov / 2)) * 0.8;

      model.position.sub(center);
      camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
      camera.near = dist * 0.001;
      camera.far = dist * 10;
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.update();

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

      // Auto-frame the IFC model
      { const bb2 = new THREE.Box3().setFromObject(scene);
        const ctr2 = bb2.getCenter(new THREE.Vector3());
        const span2 = bb2.getSize(new THREE.Vector3()).length();
        if (span2 > 0) {
          controls.target.copy(ctr2);
          camera.position.set(ctr2.x + span2 * 0.6, ctr2.y + span2 * 0.4, ctr2.z + span2 * 0.6);
          camera.lookAt(ctr2);
          controls.update();
        }
      }

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

          {/* Fit to view */}
          {modelLoaded && (
            <button
              onClick={() => {
                const { scene, camera, controls } = sceneRef.current;
                if (!scene || !camera) return;
                const box = new THREE.Box3().setFromObject(scene);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3()).length();
                controls.target.copy(center);
                camera.position.set(center.x + size * 0.6, center.y + size * 0.4, center.z + size * 0.6);
                camera.lookAt(center);
                controls.update();
              }}
              style={{
                padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent', color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ⊞ FIT VIEW
            </button>
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
          onClick={members.length > 0 ? handleCanvasClick : undefined}
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
