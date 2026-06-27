/**
 * modelRegistry.js — Service layer for the BIM/IFC model registry.
 *
 * Provides CRUD operations for model entries and element-level links.
 * All reads/writes go through base44.entities.ModelRegistry and
 * base44.entities.ModelElementLink, which route through Supabase with
 * RLS enforced via user_has_project_access(project_id).
 *
 * Data model:
 *   model_registry — one row per model file (IFC/GLTF/GLB/RVT)
 *   model_element_links — links a specific element (by IFC GlobalId or name)
 *                          to an RFI, Drawing, or Work Package
 */

import { base44 } from "@/api/base44Client";

// ─── Constants ───────────────────────────────────────────────────────

export const MODEL_FILE_TYPES = ["IFC", "GLTF", "GLB", "RVT"];
export const MODEL_SOURCES = ["local", "autodesk_cloud", "revit_export"];
export const MODEL_STATUSES = ["active", "superseded", "archived"];
export const LINK_ENTITY_TYPES = ["rfi", "drawing", "work_package"];

// ─── Model Registry CRUD ─────────────────────────────────────────────

/**
 * Register a new model in the registry.
 * @param {Object} entry
 * @param {string} entry.project_id
 * @param {string} entry.file_name
 * @param {string} [entry.file_url]
 * @param {string} entry.file_type - IFC | GLTF | GLB | RVT
 * @param {string} [entry.version]
 * @param {number} [entry.revision_number]
 * @param {string} [entry.source] - local | autodesk_cloud | revit_export
 * @param {string} [entry.coordinate_system]
 * @param {string} [entry.cloud_url]
 * @param {string} [entry.cloud_model_id]
 * @param {Object} [entry.metadata] - { building, discipline, author, software_version }
 * @param {string} [entry.document_id] - link to existing document record
 * @returns {Promise<Object>}
 */
export async function registerModel(entry) {
  if (!entry.project_id) throw new Error("project_id is required");
  if (!entry.file_name) throw new Error("file_name is required");
  if (!entry.file_type || !MODEL_FILE_TYPES.includes(entry.file_type)) {
    throw new Error(`file_type must be one of: ${MODEL_FILE_TYPES.join(", ")}`);
  }

  const record = {
    project_id: entry.project_id,
    file_name: entry.file_name,
    file_url: entry.file_url || null,
    file_type: entry.file_type,
    version: entry.version || "1.0",
    revision_number: entry.revision_number || 1,
    source: entry.source || "local",
    coordinate_system: entry.coordinate_system || null,
    cloud_url: entry.cloud_url || null,
    cloud_model_id: entry.cloud_model_id || null,
    metadata: entry.metadata || {},
    document_id: entry.document_id || null,
    status: "active",
    linked_drawings: [],
    linked_rfis: [],
    linked_work_packages: [],
  };

  return base44.entities.ModelRegistry.create(record);
}

/**
 * List all models for a project (non-deleted, ordered by upload_date desc).
 * @param {string} projectId
 * @param {Object} [opts]
 * @param {string} [opts.status] - filter by status
 * @returns {Promise<Object[]>}
 */
export async function listModels(projectId, opts = {}) {
  const filters = { project_id: projectId };
  if (opts.status) filters.status = opts.status;
  const models = await base44.entities.ModelRegistry.filter(filters);
  // Sort by upload_date descending (newest first)
  return (models || []).sort((a, b) => {
    const da = new Date(a.upload_date || a.created_at || 0);
    const db = new Date(b.upload_date || b.created_at || 0);
    return db - da;
  });
}

/**
 * Get a single model by ID.
 * @param {string} modelId
 * @returns {Promise<Object>}
 */
export async function getModel(modelId) {
  return base44.entities.ModelRegistry.get(modelId);
}

/**
 * Update model metadata (coordinate_system, metadata blob, version, etc.).
 * @param {string} modelId
 * @param {Object} updates
 * @returns {Promise<Object>}
 */
export async function updateModelMetadata(modelId, updates) {
  const allowed = [
    "file_name", "version", "revision_number", "coordinate_system",
    "metadata", "cloud_url", "cloud_model_id", "source", "status",
  ];
  const filtered = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }
  return base44.entities.ModelRegistry.update(modelId, filtered);
}

/**
 * Link a model to an entity (RFI, Drawing, or Work Package) at the model level.
 * Updates the JSONB array on the model record.
 * @param {string} modelId
 * @param {string} entityType - rfi | drawing | work_package
 * @param {string} entityId
 * @returns {Promise<Object>}
 */
export async function linkToEntity(modelId, entityType, entityId) {
  if (!LINK_ENTITY_TYPES.includes(entityType)) {
    throw new Error(`entityType must be one of: ${LINK_ENTITY_TYPES.join(", ")}`);
  }

  const model = await getModel(modelId);
  const field = entityType === "rfi" ? "linked_rfis"
    : entityType === "drawing" ? "linked_drawings"
    : "linked_work_packages";

  const current = Array.isArray(model[field]) ? model[field] : [];
  if (current.includes(entityId)) return model; // already linked

  return base44.entities.ModelRegistry.update(modelId, {
    [field]: [...current, entityId],
  });
}

/**
 * Unlink a model from an entity.
 * @param {string} modelId
 * @param {string} entityType - rfi | drawing | work_package
 * @param {string} entityId
 * @returns {Promise<Object>}
 */
export async function unlinkFromEntity(modelId, entityType, entityId) {
  if (!LINK_ENTITY_TYPES.includes(entityType)) {
    throw new Error(`entityType must be one of: ${LINK_ENTITY_TYPES.join(", ")}`);
  }

  const model = await getModel(modelId);
  const field = entityType === "rfi" ? "linked_rfis"
    : entityType === "drawing" ? "linked_drawings"
    : "linked_work_packages";

  const current = Array.isArray(model[field]) ? model[field] : [];
  const updated = current.filter((id) => id !== entityId);

  return base44.entities.ModelRegistry.update(modelId, {
    [field]: updated,
  });
}

/**
 * Mark an existing model as superseded by a newer version.
 * Sets status = 'superseded' and links to the new model.
 * @param {string} oldModelId
 * @param {string} newModelId
 * @returns {Promise<Object>}
 */
export async function supersede(oldModelId, newModelId) {
  return base44.entities.ModelRegistry.update(oldModelId, {
    status: "superseded",
    superseded_by: newModelId,
  });
}

/**
 * Archive a model (soft removal from active views).
 * @param {string} modelId
 * @returns {Promise<Object>}
 */
export async function archiveModel(modelId) {
  return base44.entities.ModelRegistry.update(modelId, { status: "archived" });
}

// ─── Element-Level Links ─────────────────────────────────────────────

/**
 * Create an element-level link (IFC GlobalId or mesh name -> entity).
 * @param {Object} link
 * @param {string} link.model_id
 * @param {string} link.element_id - IFC GlobalId or mesh name
 * @param {string} link.entity_type - rfi | drawing | work_package
 * @param {string} link.entity_id
 * @param {string} [link.note]
 * @param {string} link.project_id
 * @returns {Promise<Object>}
 */
export async function createElementLink(link) {
  if (!link.model_id) throw new Error("model_id is required");
  if (!link.element_id) throw new Error("element_id is required");
  if (!link.entity_type || !LINK_ENTITY_TYPES.includes(link.entity_type)) {
    throw new Error(`entity_type must be one of: ${LINK_ENTITY_TYPES.join(", ")}`);
  }
  if (!link.entity_id) throw new Error("entity_id is required");
  if (!link.project_id) throw new Error("project_id is required");

  return base44.entities.ModelElementLink.create({
    model_id: link.model_id,
    element_id: link.element_id,
    entity_type: link.entity_type,
    entity_id: link.entity_id,
    note: link.note || null,
    project_id: link.project_id,
  });
}

/**
 * List element links for a model.
 * @param {string} modelId
 * @returns {Promise<Object[]>}
 */
export async function listElementLinks(modelId) {
  return base44.entities.ModelElementLink.filter({ model_id: modelId });
}

/**
 * Delete an element link.
 * @param {string} linkId
 * @returns {Promise<void>}
 */
export async function deleteElementLink(linkId) {
  return base44.entities.ModelElementLink.delete(linkId);
}

/**
 * List element links for a specific entity (e.g., all elements linked to an RFI).
 * @param {string} entityType - rfi | drawing | work_package
 * @param {string} entityId
 * @returns {Promise<Object[]>}
 */
export async function listLinksForEntity(entityType, entityId) {
  return base44.entities.ModelElementLink.filter({
    entity_type: entityType,
    entity_id: entityId,
  });
}

// ─── Autodesk Cloud Reference ────────────────────────────────────────

/**
 * Register an Autodesk Construction Cloud model reference.
 * No OAuth — just stores the URL and metadata for linking.
 * @param {Object} ref
 * @param {string} ref.project_id
 * @param {string} ref.cloud_url - ACC model URL
 * @param {string} [ref.cloud_model_id] - extracted model ID if parseable
 * @param {string} [ref.file_name] - display name
 * @returns {Promise<Object>}
 */
export async function registerAutodeskReference(ref) {
  if (!ref.project_id) throw new Error("project_id is required");
  if (!ref.cloud_url) throw new Error("cloud_url is required");

  // Try to extract model ID from ACC URL patterns
  let cloudModelId = ref.cloud_model_id || null;
  if (!cloudModelId && ref.cloud_url) {
    // Common ACC URL pattern: https://acc.autodesk.com/docs/files/projects/{pid}/folders/{fid}/detail/{modelId}
    const match = ref.cloud_url.match(/detail\/([a-zA-Z0-9_-]+)/);
    if (match) cloudModelId = match[1];
  }

  const fileName = ref.file_name || extractFileNameFromUrl(ref.cloud_url);

  return registerModel({
    project_id: ref.project_id,
    file_name: fileName,
    file_type: "RVT", // Autodesk cloud models are typically Revit
    source: "autodesk_cloud",
    cloud_url: ref.cloud_url,
    cloud_model_id: cloudModelId,
    metadata: {
      origin: "Autodesk Construction Cloud",
      registered_at: new Date().toISOString(),
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractFileNameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "Autodesk Cloud Model";
  } catch {
    return "Autodesk Cloud Model";
  }
}

/**
 * Infer file type from extension.
 * @param {string} fileName
 * @returns {string|null}
 */
export function inferFileType(fileName) {
  if (!fileName) return null;
  const ext = fileName.split(".").pop()?.toUpperCase();
  if (MODEL_FILE_TYPES.includes(ext)) return ext;
  return null;
}

/**
 * Count linked entities for a model.
 * @param {Object} model - model record with linked_* arrays
 * @returns {number}
 */
export function countLinkedEntities(model) {
  const rfis = Array.isArray(model.linked_rfis) ? model.linked_rfis.length : 0;
  const drawings = Array.isArray(model.linked_drawings) ? model.linked_drawings.length : 0;
  const wps = Array.isArray(model.linked_work_packages) ? model.linked_work_packages.length : 0;
  return rfis + drawings + wps;
}
