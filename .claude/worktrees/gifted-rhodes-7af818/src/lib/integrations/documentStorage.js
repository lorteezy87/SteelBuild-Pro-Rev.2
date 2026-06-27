/**
 * documentStorage.js — External Document Storage Integration Service
 *
 * Provides the service layer for linking external storage providers
 * (SharePoint/OneDrive, Google Drive, Dropbox) to SteelBuild projects.
 *
 * Design principles:
 *   1. No OAuth tokens or secrets stored in the browser — folder linking
 *      is URL-based (shared/public folder links).
 *   2. Imports are always human-approved — no automatic file copying.
 *   3. All data flows through the base44 entity layer (ExternalLinkedFolder,
 *      ExternalFileRef, Document) — never bypass with raw SQL.
 *   4. Metadata syncs refresh the file list without importing content.
 */

import { base44 } from "@/api/base44Client";

// ─── Provider definitions ────────────────────────────────────────────────────

export const STORAGE_PROVIDERS = [
  {
    key: "sharepoint",
    name: "SharePoint / OneDrive",
    description: "Microsoft 365 shared folders and team sites",
    urlPatterns: [
      /sharepoint\.com/i,
      /onedrive\.live\.com/i,
      /1drv\.ms/i,
      /my\.sharepoint\.com/i,
    ],
    icon: "SP",
    color: "#0078d4",
  },
  {
    key: "google_drive",
    name: "Google Drive",
    description: "Shared folders and team drives",
    urlPatterns: [
      /drive\.google\.com/i,
      /docs\.google\.com/i,
    ],
    icon: "GD",
    color: "#4285f4",
  },
  {
    key: "dropbox",
    name: "Dropbox",
    description: "Shared folders and Dropbox Business",
    urlPatterns: [
      /dropbox\.com/i,
      /dl\.dropboxusercontent\.com/i,
    ],
    icon: "DB",
    color: "#0061ff",
  },
];

/**
 * Detect provider from a URL string.
 * Returns the provider key or null if unrecognised.
 */
export function detectProvider(url) {
  if (!url || typeof url !== "string") return null;
  for (const provider of STORAGE_PROVIDERS) {
    if (provider.urlPatterns.some((re) => re.test(url))) {
      return provider.key;
    }
  }
  return null;
}

/**
 * Get provider metadata by key.
 */
export function getProvider(key) {
  return STORAGE_PROVIDERS.find((p) => p.key === key) || null;
}

// ─── Folder linking ──────────────────────────────────────────────────────────

/**
 * Link an external folder to a project.
 * Validates the URL against known provider patterns.
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.folderUrl - The shared/public URL of the external folder
 * @param {string} params.folderName - Human-readable name for the folder
 * @param {string} [params.drawingSetId] - Optional drawing set association
 * @param {string} [params.linkedBy] - Email/name of the user creating the link
 * @returns {Promise<Object>} The created linked folder record
 */
export async function linkFolder({ projectId, folderUrl, folderName, drawingSetId, linkedBy }) {
  const provider = detectProvider(folderUrl);
  if (!provider) {
    throw new Error(
      "Unrecognised folder URL. Supported providers: SharePoint/OneDrive, Google Drive, Dropbox."
    );
  }

  const record = await base44.entities.ExternalLinkedFolder.create({
    project_id: projectId,
    provider,
    folder_url: folderUrl.trim(),
    folder_name: (folderName || "Linked Folder").trim(),
    drawing_set_id: drawingSetId || null,
    status: "active",
    linked_by: linkedBy || null,
  });

  return record;
}

/**
 * Unlink (delete) a linked folder. Also soft-deletes all associated file refs.
 *
 * @param {string} folderId - The linked folder record id
 * @param {string} projectId - For fetching associated file refs
 */
export async function unlinkFolder(folderId, projectId) {
  // Get the folder to know its URL for cleaning up file refs
  const folder = await base44.entities.ExternalLinkedFolder.get(folderId);

  // Soft-delete all file refs for this folder
  const refs = await base44.entities.ExternalFileRef.filter({
    project_id: projectId,
    folder_url: folder.folder_url,
    provider: folder.provider,
  });

  for (const ref of refs) {
    await base44.entities.ExternalFileRef.delete(ref.id);
  }

  // Delete the linked folder record (hard delete — no is_deleted column)
  await base44.entities.ExternalLinkedFolder.delete(folderId);
}

/**
 * Get all linked folders for a project.
 *
 * @param {string} projectId
 * @returns {Promise<Array>}
 */
export async function listLinkedFolders(projectId) {
  return base44.entities.ExternalLinkedFolder.filter({ project_id: projectId });
}

// ─── External file references ────────────────────────────────────────────────

/**
 * List external file refs for a specific linked folder.
 *
 * @param {string} projectId
 * @param {string} folderUrl
 * @param {string} provider
 * @returns {Promise<Array>}
 */
export async function listExternalFiles(projectId, folderUrl, provider) {
  return base44.entities.ExternalFileRef.filter({
    project_id: projectId,
    folder_url: folderUrl,
    provider,
  });
}

/**
 * Sync metadata for a linked folder.
 *
 * Since we don't have OAuth tokens to actually list remote files, this
 * creates a placeholder sync state. In a full implementation, this would
 * call the provider's API to list files in the folder.
 *
 * For the URL-based linking approach, users manually add file references
 * or the system can be extended with a backend function that has provider
 * credentials.
 *
 * @param {string} linkedFolderId
 * @param {Array<Object>} [fileEntries] - Optional manually-provided file list
 * @returns {Promise<Object>} Sync result summary
 */
export async function syncMetadata(linkedFolderId, fileEntries = []) {
  const folder = await base44.entities.ExternalLinkedFolder.get(linkedFolderId);
  const projectId = folder.project_id;

  // Get existing refs for this folder to avoid duplicates
  const existingRefs = await listExternalFiles(projectId, folder.folder_url, folder.provider);
  const existingByFilename = new Map(existingRefs.map((r) => [r.filename, r]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of fileEntries) {
    const existing = existingByFilename.get(entry.filename);
    if (existing) {
      // Update metadata if changed
      const hasChanges =
        existing.file_size_bytes !== entry.size ||
        existing.mime_type !== entry.mimeType ||
        existing.last_modified_at !== entry.lastModified;

      if (hasChanges) {
        await base44.entities.ExternalFileRef.update(existing.id, {
          file_size_bytes: entry.size || null,
          mime_type: entry.mimeType || null,
          last_modified_at: entry.lastModified || null,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
          sync_error: null,
        });
        updated++;
      } else {
        skipped++;
      }
    } else {
      // Create new ref
      await base44.entities.ExternalFileRef.create({
        project_id: projectId,
        drawing_set_id: folder.drawing_set_id || null,
        provider: folder.provider,
        folder_url: folder.folder_url,
        folder_name: folder.folder_name,
        external_file_id: entry.externalId || null,
        filename: entry.filename,
        mime_type: entry.mimeType || null,
        file_size_bytes: entry.size || null,
        last_modified_at: entry.lastModified || null,
        sync_status: "synced",
        last_synced_at: new Date().toISOString(),
        created_by: entry.createdBy || null,
      });
      created++;
    }
  }

  // Update folder sync timestamp
  await base44.entities.ExternalLinkedFolder.update(linkedFolderId, {
    last_synced_at: new Date().toISOString(),
    status: "active",
    sync_error: null,
  });

  return { created, updated, skipped, total: fileEntries.length };
}

/**
 * Add a single external file reference manually.
 * Used when a user pastes a direct file link.
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.folderUrl
 * @param {string} params.provider
 * @param {string} params.filename
 * @param {string} [params.mimeType]
 * @param {number} [params.size]
 * @param {string} [params.externalId]
 * @param {string} [params.drawingSetId]
 * @param {string} [params.createdBy]
 * @returns {Promise<Object>}
 */
export async function addExternalFileRef({
  projectId,
  folderUrl,
  provider,
  filename,
  mimeType,
  size,
  externalId,
  drawingSetId,
  createdBy,
}) {
  return base44.entities.ExternalFileRef.create({
    project_id: projectId,
    folder_url: folderUrl,
    provider,
    filename,
    mime_type: mimeType || null,
    file_size_bytes: size || null,
    external_file_id: externalId || null,
    drawing_set_id: drawingSetId || null,
    sync_status: "synced",
    last_synced_at: new Date().toISOString(),
    created_by: createdBy || null,
  });
}

// ─── Import (human-approved) ─────────────────────────────────────────────────

/**
 * Import an external file into SteelBuild's document repository.
 *
 * This is a two-step process:
 *   1. The file content is uploaded to Supabase Storage (via the existing
 *      UploadFile integration).
 *   2. A Document record is created with the standard DMS fields.
 *   3. The ExternalFileRef is updated to reflect the import.
 *
 * The actual file fetching requires a File object (the user downloads from
 * the provider and re-uploads, or a backend function fetches on their behalf).
 *
 * @param {Object} params
 * @param {string} params.externalFileRefId - The file ref to import
 * @param {File} params.file - The file blob to upload
 * @param {Object} [params.metadata] - Optional DMS metadata overrides
 * @returns {Promise<Object>} The created Document record
 */
export async function importFile({ externalFileRefId, file, metadata = {} }) {
  // Mark as importing
  await base44.entities.ExternalFileRef.update(externalFileRefId, {
    sync_status: "importing",
  });

  try {
    const ref = await base44.entities.ExternalFileRef.get(externalFileRefId);

    // Upload to Supabase Storage
    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    // Determine file type from extension
    const ext = (ref.filename || file.name || "").split(".").pop()?.toLowerCase();
    const fileType = ["pdf", "dwg", "dxf", "ifc", "rvt", "jpg", "jpeg", "png", "xlsx", "xls", "docx", "doc"]
      .includes(ext) ? ext : "other";

    // Create the Document record
    const doc = await base44.entities.Document.create({
      project_id: ref.project_id,
      display_name: metadata.displayName || ref.filename,
      description: metadata.description || `Imported from ${getProvider(ref.provider)?.name || ref.provider}`,
      file_name: ref.filename,
      file_url,
      file_type: fileType,
      file_size_kb: Math.round((ref.file_size_bytes || file.size || 0) / 1024),
      mime_type: ref.mime_type || file.type,
      category: metadata.category || "Other",
      discipline: metadata.discipline || "Other",
      status: "Draft",
      revision_number: metadata.revisionNumber || "0",
      revision_date: new Date().toISOString().split("T")[0],
      tags: metadata.tags || [],
      uploaded_by: metadata.uploadedBy || "External Import",
      uploaded_date: new Date().toISOString(),
      folder_id: metadata.folderId || null,
    });

    // Link the file ref to the created document
    await base44.entities.ExternalFileRef.update(externalFileRefId, {
      sync_status: "imported",
      linked_document_id: doc.id,
      last_synced_at: new Date().toISOString(),
      sync_error: null,
    });

    return doc;
  } catch (err) {
    // Roll back sync_status on failure
    await base44.entities.ExternalFileRef.update(externalFileRefId, {
      sync_status: "error",
      sync_error: err?.message || "Import failed",
    }).catch(() => {}); // Don't throw on cleanup failure
    throw err;
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Format file size from bytes to human-readable string.
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Get sync status metadata (label, color) for display.
 */
export function getSyncStatusDisplay(status) {
  switch (status) {
    case "pending":   return { label: "Pending",   color: "var(--text-muted)" };
    case "synced":    return { label: "Synced",    color: "var(--status-success)" };
    case "error":     return { label: "Error",     color: "var(--status-error)" };
    case "importing": return { label: "Importing", color: "var(--status-warning)" };
    case "imported":  return { label: "Imported",  color: "var(--accent)" };
    default:          return { label: status || "Unknown", color: "var(--text-muted)" };
  }
}

/**
 * Get folder status metadata for display.
 */
export function getFolderStatusDisplay(status) {
  switch (status) {
    case "active":       return { label: "Connected", color: "var(--status-success)" };
    case "error":        return { label: "Error",     color: "var(--status-error)" };
    case "disconnected": return { label: "Disconnected", color: "var(--text-muted)" };
    default:             return { label: status || "Unknown", color: "var(--text-muted)" };
  }
}
