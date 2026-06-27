/**
 * ModelRegistry — BIM Model Registry page.
 *
 * Provides a project-scoped registry of IFC/GLTF/GLB/RVT model files with:
 *   - Table view of all registered models
 *   - "Register" flow to link existing documents as models
 *   - "Add Autodesk Reference" for cloud model links (no OAuth)
 *   - Detail panel with metadata, version history, linked entities
 *   - "Link to..." action to connect models to RFIs/Drawings/WPs
 */

import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { toast } from "sonner";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import EmptyStateAction from "@/components/shared/EmptyStateAction";
import {
  registerModel,
  listModels,
  updateModelMetadata,
  linkToEntity,
  unlinkFromEntity,
  supersede,
  archiveModel,
  registerAutodeskReference,
  countLinkedEntities,
  MODEL_FILE_TYPES,
  MODEL_STATUSES,
  inferFileType,
} from "@/lib/integrations/modelRegistry";

// ─── Styles ───────────────────────────────��──────────────────────────

const pageStyle = {
  display: "flex", flexDirection: "column", height: "100%", flex: 1,
  minHeight: 0, background: "var(--bg-page)",
};

const topBarStyle = {
  height: 44, flexShrink: 0, display: "flex", alignItems: "center",
  justifyContent: "space-between", padding: "0 14px",
  borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)",
};

const btnPrimary = {
  padding: "5px 12px", borderRadius: 6, background: "var(--accent)", color: "#fff",
  fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, cursor: "pointer",
  border: "none", display: "inline-flex", alignItems: "center", gap: 4,
};

const btnSecondary = {
  padding: "5px 12px", borderRadius: 6, background: "rgba(245,158,11,0.08)",
  border: "1px solid rgba(245,158,11,0.3)", color: "var(--accent)",
  fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 4,
};

const btnGhost = {
  padding: "4px 8px", borderRadius: 4, background: "transparent",
  border: "1px solid var(--border-default)", color: "var(--text-muted)",
  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, cursor: "pointer",
  letterSpacing: "0.06em", textTransform: "uppercase",
};

const chipStyle = (color = "var(--text-muted)") => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "2px 8px", borderRadius: 4,
  background: `color-mix(in srgb, ${color} 10%, transparent)`,
  border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
  color, letterSpacing: "0.06em", textTransform: "uppercase",
});

const STATUS_COLORS = {
  active: "var(--status-success)",
  superseded: "var(--status-warning)",
  archived: "var(--text-muted)",
};

const SOURCE_LABELS = {
  local: "Local Upload",
  autodesk_cloud: "Autodesk Cloud",
  revit_export: "Revit Export",
};

// ─── Component ───────────────────────────────────────────────────────

export default function ModelRegistry() {
  const { currentProject } = useProjectContext();
  const projectId = currentProject?.id;
  const queryClient = useQueryClient();

  // UI state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAutodeskModal, setShowAutodeskModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(null); // model id
  const [selectedModel, setSelectedModel] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");

  // ─── Data fetching ───────────────────────────────────────────────
  const { data: models = [], isLoading } = useQuery({
    queryKey: ["model-registry", projectId],
    queryFn: () => listModels(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Documents for the "Register" picker (IFC/GLTF/GLB files)
  const { data: documents = [] } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => base44.entities.Document.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // RFIs, Drawings, Work Packages for linking
  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis-for-link", projectId],
    queryFn: () => base44.entities.RFI.filter({ project_id: projectId }),
    enabled: !!projectId && !!showLinkModal,
  });
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings-for-link", projectId],
    queryFn: () => base44.entities.Drawing.filter({ project_id: projectId }),
    enabled: !!projectId && !!showLinkModal,
  });
  const { data: workPackages = [] } = useQuery({
    queryKey: ["wps-for-link", projectId],
    queryFn: () => base44.entities.WorkPackage.filter({ project_id: projectId }),
    enabled: !!projectId && !!showLinkModal,
  });

  // ─── Mutations ────────────────────────────────���────────────────────

  const registerMut = useMutation({
    mutationFn: (entry) => registerModel(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-registry", projectId] });
      toast.success("Model registered");
      setShowRegisterModal(false);
    },
    onError: (err) => toast.error("Failed to register: " + err.message),
  });

  const autodeskMut = useMutation({
    mutationFn: (ref) => registerAutodeskReference(ref),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-registry", projectId] });
      toast.success("Autodesk reference added");
      setShowAutodeskModal(false);
    },
    onError: (err) => toast.error("Failed to add reference: " + err.message),
  });

  const linkMut = useMutation({
    mutationFn: ({ modelId, entityType, entityId }) => linkToEntity(modelId, entityType, entityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-registry", projectId] });
      toast.success("Entity linked");
      setShowLinkModal(null);
    },
    onError: (err) => toast.error("Failed to link: " + err.message),
  });

  const unlinkMut = useMutation({
    mutationFn: ({ modelId, entityType, entityId }) => unlinkFromEntity(modelId, entityType, entityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-registry", projectId] });
      toast.success("Entity unlinked");
    },
    onError: (err) => toast.error("Unlink failed: " + err.message),
  });

  const archiveMut = useMutation({
    mutationFn: (modelId) => archiveModel(modelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-registry", projectId] });
      toast.success("Model archived");
      setSelectedModel(null);
    },
  });

  // ─── Filtered list ─────────────────────────────────────────────────

  const filteredModels = useMemo(() => {
    if (statusFilter === "all") return models;
    return models.filter((m) => m.status === statusFilter);
  }, [models, statusFilter]);

  // Model-eligible documents (IFC/GLTF/GLB that aren't already registered)
  const registeredDocIds = useMemo(() => new Set(models.map((m) => m.document_id).filter(Boolean)), [models]);
  const eligibleDocs = useMemo(() => {
    return documents.filter((doc) => {
      const ext = (doc.file_name || doc.name || "").split(".").pop()?.toUpperCase();
      if (!["IFC", "GLTF", "GLB", "RVT"].includes(ext)) return false;
      if (registeredDocIds.has(doc.id)) return false;
      return true;
    });
  }, [documents, registeredDocIds]);

  // ─── Render ────────────────────────────────────────────────────────

  if (!projectId) {
    return (
      <div style={pageStyle}>
        <div style={{ ...topBarStyle, justifyContent: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            Select a project to view the model registry.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* TOP BAR */}
      <div style={topBarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.12em" }}>
            MODEL REGISTRY
          </span>
          <span style={chipStyle("var(--nc-accent-cyan)")}>
            {filteredModels.length} MODEL{filteredModels.length !== 1 ? "S" : ""}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "4px 8px", borderRadius: 4, background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)", fontFamily: "var(--font-mono)",
              fontSize: 9, color: "var(--text-primary)", cursor: "pointer",
            }}
          >
            <option value="all">All Statuses</option>
            {MODEL_STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          <button onClick={() => setShowAutodeskModal(true)} style={btnSecondary}>
            + Autodesk Reference
          </button>
          <button onClick={() => setShowRegisterModal(true)} style={btnPrimary}>
            + Register Model
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {/* TABLE */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {isLoading ? (
            <LoadingSkeleton />
          ) : filteredModels.length === 0 ? (
            <EmptyStateAction
              title="No models registered"
              subtitle="Register an IFC, GLTF, or GLB file from your documents, or add an Autodesk cloud reference."
              actionLabel="Register Model"
              onAction={() => setShowRegisterModal(true)}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Table header */}
              <div style={{
                display: "grid", gridTemplateColumns: "2fr 80px 80px 100px 120px 80px 60px",
                gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border-default)",
                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase",
              }}>
                <span>FILE NAME</span>
                <span>TYPE</span>
                <span>REV</span>
                <span>SOURCE</span>
                <span>UPLOADED</span>
                <span>STATUS</span>
                <span>LINKS</span>
              </div>

              {/* Rows */}
              {filteredModels.map((model) => (
                <div
                  key={model.id}
                  onClick={() => setSelectedModel(model)}
                  style={{
                    display: "grid", gridTemplateColumns: "2fr 80px 80px 100px 120px 80px 60px",
                    gap: 8, padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                    background: selectedModel?.id === model.id ? "rgba(245,158,11,0.08)" : "var(--bg-surface)",
                    border: selectedModel?.id === model.id ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                    transition: "all 0.1s", alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
                    <span style={{
                      fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600,
                      color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }} title={model.file_name}>
                      {model.file_name}
                    </span>
                    {model.cloud_url && (
                      <a
                        href={model.cloud_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--nc-accent-cyan)", textDecoration: "none" }}
                      >
                        View in Autodesk
                      </a>
                    )}
                  </div>
                  <span style={chipStyle()}>{model.file_type}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
                    v{model.version || "1.0"} r{model.revision_number || 1}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    {SOURCE_LABELS[model.source] || model.source}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    {model.upload_date ? new Date(model.upload_date).toLocaleDateString() : "-"}
                  </span>
                  <span style={chipStyle(STATUS_COLORS[model.status] || "var(--text-muted)")}>
                    {model.status}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", textAlign: "center" }}>
                    {countLinkedEntities(model)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DETAIL PANEL */}
        {selectedModel && (
          <ModelDetailPanel
            model={selectedModel}
            onClose={() => setSelectedModel(null)}
            onLink={() => setShowLinkModal(selectedModel.id)}
            onUnlink={(entityType, entityId) => unlinkMut.mutate({ modelId: selectedModel.id, entityType, entityId })}
            onArchive={() => archiveMut.mutate(selectedModel.id)}
          />
        )}
      </div>

      {/* MODALS */}
      {showRegisterModal && (
        <RegisterModelModal
          eligibleDocs={eligibleDocs}
          projectId={projectId}
          onSubmit={(entry) => registerMut.mutate(entry)}
          onClose={() => setShowRegisterModal(false)}
          loading={registerMut.isPending}
        />
      )}

      {showAutodeskModal && (
        <AutodeskReferenceModal
          projectId={projectId}
          onSubmit={(ref) => autodeskMut.mutate(ref)}
          onClose={() => setShowAutodeskModal(false)}
          loading={autodeskMut.isPending}
        />
      )}

      {showLinkModal && (
        <LinkEntityModal
          modelId={showLinkModal}
          rfis={rfis}
          drawings={drawings}
          workPackages={workPackages}
          onSubmit={({ entityType, entityId }) => linkMut.mutate({ modelId: showLinkModal, entityType, entityId })}
          onClose={() => setShowLinkModal(null)}
          loading={linkMut.isPending}
        />
      )}
    </div>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────

function ModelDetailPanel({ model, onClose, onLink, onUnlink, onArchive }) {
  const meta = model.metadata || {};
  const linkedRfis = Array.isArray(model.linked_rfis) ? model.linked_rfis : [];
  const linkedDrawings = Array.isArray(model.linked_drawings) ? model.linked_drawings : [];
  const linkedWps = Array.isArray(model.linked_work_packages) ? model.linked_work_packages : [];

  return (
    <div style={{
      width: 320, minWidth: 320, background: "var(--bg-surface-low)",
      borderLeft: "3px solid var(--accent)", display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {model.file_name}
        </span>
        <button onClick={onClose} style={{ ...btnGhost, padding: "2px 6px" }}>X</button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Metadata */}
        <Section title="Model Info">
          <InfoRow label="Type" value={model.file_type} />
          <InfoRow label="Version" value={`v${model.version || "1.0"} r${model.revision_number || 1}`} />
          <InfoRow label="Source" value={SOURCE_LABELS[model.source] || model.source} />
          <InfoRow label="Status" value={model.status} />
          <InfoRow label="Coordinate System" value={model.coordinate_system || "Not set"} />
          {model.cloud_url && (
            <div style={{ marginTop: 4 }}>
              <a href={model.cloud_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--nc-accent-cyan)" }}>
                Open in Autodesk Construction Cloud
              </a>
            </div>
          )}
        </Section>

        {/* Extended metadata */}
        {(meta.building || meta.discipline || meta.author || meta.software_version) && (
          <Section title="Details">
            {meta.building && <InfoRow label="Building" value={meta.building} />}
            {meta.discipline && <InfoRow label="Discipline" value={meta.discipline} />}
            {meta.author && <InfoRow label="Author" value={meta.author} />}
            {meta.software_version && <InfoRow label="Software" value={meta.software_version} />}
          </Section>
        )}

        {/* Linked Entities */}
        <Section title={`Linked Entities (${linkedRfis.length + linkedDrawings.length + linkedWps.length})`}>
          {linkedRfis.length === 0 && linkedDrawings.length === 0 && linkedWps.length === 0 ? (
            <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>
              No linked entities yet.
            </span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {linkedRfis.map((id) => (
                <LinkedChip key={id} type="RFI" id={id} onUnlink={() => onUnlink("rfi", id)} />
              ))}
              {linkedDrawings.map((id) => (
                <LinkedChip key={id} type="Drawing" id={id} onUnlink={() => onUnlink("drawing", id)} />
              ))}
              {linkedWps.map((id) => (
                <LinkedChip key={id} type="Work Package" id={id} onUnlink={() => onUnlink("work_package", id)} />
              ))}
            </div>
          )}
          <button onClick={onLink} style={{ ...btnSecondary, marginTop: 8, width: "100%", justifyContent: "center" }}>
            + Link to Entity
          </button>
        </Section>
      </div>

      {/* Actions */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--divider)", display: "flex", gap: 8 }}>
        {model.status === "active" && (
          <button onClick={onArchive} style={{ ...btnGhost, flex: 1, justifyContent: "center" }}>ARCHIVE</button>
        )}
        <button onClick={onClose} style={{ ...btnGhost, flex: 1, justifyContent: "center" }}>CLOSE</button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>{value}</span>
    </div>
  );
}

function LinkedChip({ type, id, onUnlink }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "4px 8px", borderRadius: 4, background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>
        {type}: {id.slice(0, 8)}...
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onUnlink(); }}
        style={{ background: "none", border: "none", color: "var(--status-error)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9 }}
      >
        X
      </button>
    </div>
  );
}

// ─── Register Model Modal ─────────────────��──────────────────────────

function RegisterModelModal({ eligibleDocs, projectId, onSubmit, onClose, loading }) {
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [version, setVersion] = useState("1.0");
  const [coordSystem, setCoordSystem] = useState("");
  const [building, setBuilding] = useState("");
  const [discipline, setDiscipline] = useState("");

  const handleSubmit = () => {
    if (!selectedDoc) { toast.error("Select a document"); return; }
    const fileType = inferFileType(selectedDoc.file_name || selectedDoc.name);
    if (!fileType) { toast.error("Cannot determine file type"); return; }

    onSubmit({
      project_id: projectId,
      file_name: selectedDoc.file_name || selectedDoc.name,
      file_url: selectedDoc.file_url || selectedDoc.fileUrl,
      file_type: fileType,
      version,
      revision_number: 1,
      source: "local",
      coordinate_system: coordSystem || null,
      document_id: selectedDoc.id,
      metadata: {
        building: building || undefined,
        discipline: discipline || undefined,
      },
    });
  };

  return (
    <ModalOverlay onClose={onClose} title="Register Model">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={labelStyle}>
          Select Document
          <select
            value={selectedDoc?.id || ""}
            onChange={(e) => setSelectedDoc(eligibleDocs.find((d) => d.id === e.target.value) || null)}
            style={inputStyle}
          >
            <option value="">-- Select an IFC/GLTF/GLB file --</option>
            {eligibleDocs.map((doc) => (
              <option key={doc.id} value={doc.id}>{doc.file_name || doc.name}</option>
            ))}
          </select>
          {eligibleDocs.length === 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", marginTop: 4 }}>
              No eligible documents found. Upload an IFC/GLTF/GLB file to the Document Repository first.
            </span>
          )}
        </label>
        <label style={labelStyle}>
          Version
          <input type="text" value={version} onChange={(e) => setVersion(e.target.value)} style={inputStyle} placeholder="1.0" />
        </label>
        <label style={labelStyle}>
          Coordinate System
          <input type="text" value={coordSystem} onChange={(e) => setCoordSystem(e.target.value)} style={inputStyle} placeholder="e.g. Project North, True North" />
        </label>
        <label style={labelStyle}>
          Building / Area
          <input type="text" value={building} onChange={(e) => setBuilding(e.target.value)} style={inputStyle} placeholder="e.g. Building A, Phase 2" />
        </label>
        <label style={labelStyle}>
          Discipline
          <input type="text" value={discipline} onChange={(e) => setDiscipline(e.target.value)} style={inputStyle} placeholder="e.g. Structural, MEP" />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !selectedDoc} style={{ ...btnPrimary, opacity: loading || !selectedDoc ? 0.5 : 1 }}>
            {loading ? "Registering..." : "Register"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── Autodesk Reference Modal ───────────────────────────────���────────

function AutodeskReferenceModal({ projectId, onSubmit, onClose, loading }) {
  const [cloudUrl, setCloudUrl] = useState("");
  const [fileName, setFileName] = useState("");

  const handleSubmit = () => {
    if (!cloudUrl.trim()) { toast.error("Paste an Autodesk Construction Cloud URL"); return; }
    onSubmit({
      project_id: projectId,
      cloud_url: cloudUrl.trim(),
      file_name: fileName.trim() || undefined,
    });
  };

  return (
    <ModalOverlay onClose={onClose} title="Add Autodesk Cloud Reference">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
          Paste a link to a model in Autodesk Construction Cloud. No login required — this creates a reference link for tracking purposes.
        </p>
        <label style={labelStyle}>
          Autodesk Cloud URL *
          <input type="url" value={cloudUrl} onChange={(e) => setCloudUrl(e.target.value)} style={inputStyle} placeholder="https://acc.autodesk.com/..." />
        </label>
        <label style={labelStyle}>
          Display Name (optional)
          <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} style={inputStyle} placeholder="e.g. Phase 2 Structural Model" />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !cloudUrl.trim()} style={{ ...btnPrimary, opacity: loading || !cloudUrl.trim() ? 0.5 : 1 }}>
            {loading ? "Adding..." : "Add Reference"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── Link Entity Modal ───────────────────────────────────────────────

function LinkEntityModal({ modelId, rfis, drawings, workPackages, onSubmit, onClose, loading }) {
  const [entityType, setEntityType] = useState("rfi");
  const [entityId, setEntityId] = useState("");

  const entities = entityType === "rfi" ? rfis
    : entityType === "drawing" ? drawings
    : workPackages;

  const getLabel = (item) => {
    if (entityType === "rfi") return `RFI-${item.rfi_number || ""}: ${item.subject || item.title || ""}`.trim();
    if (entityType === "drawing") return `${item.drawing_number || ""} - ${item.title || item.name || ""}`.trim();
    return `${item.wp_number || ""} - ${item.description || item.name || ""}`.trim();
  };

  const handleSubmit = () => {
    if (!entityId) { toast.error("Select an entity to link"); return; }
    onSubmit({ entityType, entityId });
  };

  return (
    <ModalOverlay onClose={onClose} title="Link Model to Entity">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={labelStyle}>
          Entity Type
          <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setEntityId(""); }} style={inputStyle}>
            <option value="rfi">RFI</option>
            <option value="drawing">Drawing</option>
            <option value="work_package">Work Package</option>
          </select>
        </label>
        <label style={labelStyle}>
          Select {entityType === "rfi" ? "RFI" : entityType === "drawing" ? "Drawing" : "Work Package"}
          <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={inputStyle}>
            <option value="">-- Select --</option>
            {entities.map((item) => (
              <option key={item.id} value={item.id}>{getLabel(item)}</option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !entityId} style={{ ...btnPrimary, opacity: loading || !entityId ? 0.5 : 1 }}>
            {loading ? "Linking..." : "Link"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── Shared Modal Overlay ────────────────────────���───────────────────

function ModalOverlay({ onClose, title, children }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(8,11,18,0.75)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-default)",
        borderRadius: 12, padding: 24, width: 440, maxHeight: "80vh", overflowY: "auto",
        boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
      }}>
        <div style={{
          fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700,
          color: "var(--text-primary)", marginBottom: 16,
        }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Shared form styles ──────────────────────────────────────────────

const labelStyle = {
  display: "flex", flexDirection: "column", gap: 4,
  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
  color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase",
};

const inputStyle = {
  padding: "8px 10px", borderRadius: 6, background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)", fontFamily: "var(--font-body)",
  fontSize: 12, color: "var(--text-primary)", outline: "none", width: "100%",
};
