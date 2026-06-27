/**
 * pdfImportQueue.js
 *
 * Shared PDF import review queue service for RFIs, drawings, and markup
 * packages. Implements the "human approval before writes" governance rule
 * from the integrations catalog.
 *
 * Queue items land in a local-state queue (persisted to localStorage per
 * project) until the user explicitly approves or rejects them. On approve,
 * the service calls the appropriate entity creation path (Drawing, RFI,
 * Document) with full source-file lineage attached.
 *
 * No direct DB table needed — this is a client-side staging area that
 * gates the existing base44.entities write surface. If the queue grows
 * beyond a single-user scenario, a Supabase `import_queue` table with
 * RLS can be added later without changing the API shape.
 */

import { supabase } from "@/lib/supabase";

// ── Constants ───────────────────────────────��────────────────────��───────────

export const SOURCE_TYPES = {
  BLUEBEAM_CSV: "bluebeam_csv",
  BLUEBEAM_PDF: "bluebeam_pdf",
  PLANGRID: "plangrid",
  GENERIC_PDF: "generic_pdf",
};

export const QUEUE_STATUSES = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const DETECTED_ITEM_TYPES = {
  RFI: "rfi",
  DRAWING: "drawing",
  MARKUP: "markup",
  DOCUMENT: "document",
};

// ── Storage key ────────────────────────────────��────────────────────────────���

function storageKey(projectId) {
  return `steelbuild_pdf_import_queue_${projectId || "global"}`;
}

// ── Queue model helpers ──────────────────────────────────────────────────────

function generateId() {
  return `piq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function loadQueue(projectId) {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(projectId, items) {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(items));
  } catch (e) {
    console.warn("[pdfImportQueue] localStorage write failed:", e);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a file to the import review queue.
 *
 * @param {object} params
 * @param {string} params.file_name       Original filename
 * @param {string} params.file_url        Storage URL or signed URL
 * @param {string} params.source_type     One of SOURCE_TYPES
 * @param {string} params.project_id      Target project
 * @param {Array}  params.detected_items  Items AI/parser found [{type, title, sheet, confidence}]
 * @param {string} [params.file_hash]     Optional content hash for dedup
 * @returns {object} The created queue item
 */
export function addToQueue({
  file_name,
  file_url,
  source_type,
  project_id,
  detected_items = [],
  file_hash = null,
}) {
  if (!file_name || !project_id) {
    throw new Error("file_name and project_id are required.");
  }

  const queue = loadQueue(project_id);

  // Dedup: if same file_name + file_hash already pending, skip.
  if (file_hash) {
    const existing = queue.find(
      (item) =>
        item.file_hash === file_hash &&
        item.status === QUEUE_STATUSES.PENDING
    );
    if (existing) return existing;
  }

  const item = {
    id: generateId(),
    file_name,
    file_url: file_url || null,
    source_type: source_type || SOURCE_TYPES.GENERIC_PDF,
    project_id,
    upload_date: new Date().toISOString(),
    status: QUEUE_STATUSES.PENDING,
    detected_items: detected_items.map((d, idx) => ({
      id: `${generateId()}_${idx}`,
      type: d.type || DETECTED_ITEM_TYPES.DOCUMENT,
      title: d.title || "",
      sheet: d.sheet || null,
      confidence: typeof d.confidence === "number" ? d.confidence : null,
      data: d.data || null,
    })),
    reviewed_by: null,
    reviewed_at: null,
    file_hash,
  };

  queue.push(item);
  saveQueue(project_id, queue);
  return item;
}

/**
 * List queue items with optional status filter.
 *
 * @param {string} projectId
 * @param {object} [opts]
 * @param {string} [opts.status]  Filter by status (pending/approved/rejected)
 * @returns {Array}
 */
export function listQueueItems(projectId, { status } = {}) {
  const queue = loadQueue(projectId);
  if (!status) return queue;
  return queue.filter((item) => item.status === status);
}

/**
 * Get aggregate stats for the queue.
 *
 * @param {string} projectId
 * @returns {{ total, pending, approved, rejected, bySourceType }}
 */
export function getQueueStats(projectId) {
  const queue = loadQueue(projectId);
  const stats = {
    total: queue.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    bySourceType: {},
  };

  for (const item of queue) {
    stats[item.status] = (stats[item.status] || 0) + 1;
    stats.bySourceType[item.source_type] =
      (stats.bySourceType[item.source_type] || 0) + 1;
  }

  return stats;
}

/**
 * Approve a queue item — creates actual records in the target tables
 * with source-file lineage metadata. Returns the created record ids.
 *
 * @param {string} projectId
 * @param {string} queueItemId
 * @param {object} [opts]
 * @param {string} [opts.reviewed_by]  User name/email
 * @returns {Promise<{ created: Array<{type, id, title}>, item }>}
 */
export async function approveItem(projectId, queueItemId, { reviewed_by } = {}) {
  const queue = loadQueue(projectId);
  const idx = queue.findIndex((i) => i.id === queueItemId);
  if (idx === -1) throw new Error("Queue item not found.");

  const item = queue[idx];
  if (item.status !== QUEUE_STATUSES.PENDING) {
    throw new Error(`Item already ${item.status}.`);
  }

  const created = [];

  // Create records from detected items with lineage.
  for (const detected of item.detected_items) {
    try {
      const lineage = {
        source_file_name: item.file_name,
        source_file_hash: item.file_hash || null,
        import_queue_id: item.id,
        extraction_confidence: detected.confidence,
      };

      const record = await createRecordFromDetected({
        detected,
        projectId,
        lineage,
      });

      if (record) {
        created.push(record);
      }
    } catch (err) {
      console.error(
        `[pdfImportQueue] Failed to create record for detected item:`,
        detected,
        err
      );
    }
  }

  // Mark as approved.
  queue[idx] = {
    ...item,
    status: QUEUE_STATUSES.APPROVED,
    reviewed_by: reviewed_by || null,
    reviewed_at: new Date().toISOString(),
  };
  saveQueue(projectId, queue);

  return { created, item: queue[idx] };
}

/**
 * Reject a queue item — marks it as rejected without creating records.
 *
 * @param {string} projectId
 * @param {string} queueItemId
 * @param {object} [opts]
 * @param {string} [opts.reviewed_by]
 * @returns {{ item }}
 */
export function rejectItem(projectId, queueItemId, { reviewed_by } = {}) {
  const queue = loadQueue(projectId);
  const idx = queue.findIndex((i) => i.id === queueItemId);
  if (idx === -1) throw new Error("Queue item not found.");

  const item = queue[idx];
  if (item.status !== QUEUE_STATUSES.PENDING) {
    throw new Error(`Item already ${item.status}.`);
  }

  queue[idx] = {
    ...item,
    status: QUEUE_STATUSES.REJECTED,
    reviewed_by: reviewed_by || null,
    reviewed_at: new Date().toISOString(),
  };
  saveQueue(projectId, queue);

  return { item: queue[idx] };
}

/**
 * Bulk approve all pending items in a queue.
 *
 * @param {string} projectId
 * @param {object} [opts]
 * @param {string} [opts.reviewed_by]
 * @returns {Promise<{ approved: number, created: Array }>}
 */
export async function bulkApprove(projectId, { reviewed_by } = {}) {
  const pending = listQueueItems(projectId, { status: QUEUE_STATUSES.PENDING });
  let approved = 0;
  const allCreated = [];

  for (const item of pending) {
    try {
      const result = await approveItem(projectId, item.id, { reviewed_by });
      approved += 1;
      allCreated.push(...result.created);
    } catch (err) {
      console.error(`[pdfImportQueue] bulkApprove failed for ${item.id}:`, err);
    }
  }

  return { approved, created: allCreated };
}

/**
 * Remove all non-pending (approved/rejected) items from the queue.
 * Keeps the queue tidy over time.
 */
export function clearProcessed(projectId) {
  const queue = loadQueue(projectId);
  const remaining = queue.filter((i) => i.status === QUEUE_STATUSES.PENDING);
  saveQueue(projectId, remaining);
  return { removed: queue.length - remaining.length };
}

// ── Record creation from detected items ────────────────���─────────────────────

/**
 * Create an actual DB record from a detected item. Routes to the
 * correct table based on detected.type. Returns { type, id, title }
 * on success or null on skip.
 */
async function createRecordFromDetected({ detected, projectId, lineage }) {
  const { type, title, sheet, data } = detected;

  switch (type) {
    case DETECTED_ITEM_TYPES.RFI:
      return createRfiFromDetected({ title, data, projectId, lineage });
    case DETECTED_ITEM_TYPES.DRAWING:
      return createDrawingFromDetected({ title, sheet, data, projectId, lineage });
    case DETECTED_ITEM_TYPES.MARKUP:
      return createMarkupRecord({ title, sheet, data, projectId, lineage });
    case DETECTED_ITEM_TYPES.DOCUMENT:
    default:
      return createDocumentFromDetected({ title, data, projectId, lineage });
  }
}

async function createRfiFromDetected({ title, data, projectId, lineage }) {
  const row = {
    project_id: projectId,
    title: title || "Imported RFI",
    question: data?.question || title || "",
    status: "Draft",
    priority: "Medium",
    ball_in_court: data?.assigned_to || "Engineer",
    assigned_to: data?.assigned_to || null,
    rfi_number: data?.rfi_number || null,
    import_metadata: lineage,
  };

  const { data: created, error } = await supabase
    .from("rfis")
    .insert(row)
    .select("id")
    .single();

  if (error) throw error;
  return { type: "rfi", id: created.id, title: row.title };
}

async function createDrawingFromDetected({ title, sheet, data, projectId, lineage }) {
  const row = {
    project_id: projectId,
    title: title || "Imported Drawing",
    sheet_number: sheet || data?.sheet_number || null,
    stage: "submitted",
    discipline: data?.discipline || "Structural",
    drawing_set_name: data?.set_name || null,
    import_metadata: lineage,
  };

  const { data: created, error } = await supabase
    .from("drawings")
    .insert(row)
    .select("id")
    .single();

  if (error) throw error;
  return { type: "drawing", id: created.id, title: row.title };
}

async function createMarkupRecord({ title, sheet, data, projectId, lineage }) {
  // Markups attach to an existing drawing. If we can't find the parent,
  // fall back to creating a document record.
  if (!data?.drawing_id && !sheet) {
    return createDocumentFromDetected({ title, data, projectId, lineage });
  }

  // If we have a drawing_id, try to append markup data.
  if (data?.drawing_id && data?.markup) {
    const { data: existing, error: fetchErr } = await supabase
      .from("drawings")
      .select("id, markup")
      .eq("id", data.drawing_id)
      .single();

    if (!fetchErr && existing) {
      const currentMarkup = Array.isArray(existing.markup) ? existing.markup : [];
      const newMarkup = Array.isArray(data.markup) ? data.markup : [data.markup];
      const merged = [...currentMarkup, ...newMarkup];

      const { error: updateErr } = await supabase
        .from("drawings")
        .update({ markup: merged, import_metadata: lineage })
        .eq("id", existing.id);

      if (!updateErr) {
        return { type: "markup", id: existing.id, title: title || "Markup added" };
      }
    }
  }

  // Fallback: create a document with the markup reference.
  return createDocumentFromDetected({ title, data, projectId, lineage });
}

async function createDocumentFromDetected({ title, data, projectId, lineage }) {
  const row = {
    project_id: projectId,
    title: title || "Imported Document",
    category: data?.category || "PDF Import",
    file_url: data?.file_url || lineage.source_file_name || null,
    import_metadata: lineage,
  };

  const { data: created, error } = await supabase
    .from("documents")
    .insert(row)
    .select("id")
    .single();

  if (error) throw error;
  return { type: "document", id: created.id, title: row.title };
}

// ── Source type detection ────────────────────────────────────────────────────

/**
 * Infer source_type from filename patterns.
 *
 * @param {string} fileName
 * @returns {string} One of SOURCE_TYPES values
 */
export function detectSourceType(fileName) {
  if (!fileName) return SOURCE_TYPES.GENERIC_PDF;
  const lower = fileName.toLowerCase();

  // Bluebeam CSV exports typically named "Markups_*.csv" or include "bluebeam"
  if (/\.csv$/i.test(lower) && (/markup/i.test(lower) || /bluebeam/i.test(lower))) {
    return SOURCE_TYPES.BLUEBEAM_CSV;
  }

  // Bluebeam Studio PDF exports
  if (/bluebeam/i.test(lower) && /\.pdf$/i.test(lower)) {
    return SOURCE_TYPES.BLUEBEAM_PDF;
  }

  // PlanGrid exports
  if (/plangrid/i.test(lower)) {
    return SOURCE_TYPES.PLANGRID;
  }

  return SOURCE_TYPES.GENERIC_PDF;
}

/**
 * Human-readable label for source types.
 */
export function sourceTypeLabel(sourceType) {
  switch (sourceType) {
    case SOURCE_TYPES.BLUEBEAM_CSV: return "Bluebeam CSV";
    case SOURCE_TYPES.BLUEBEAM_PDF: return "Bluebeam PDF";
    case SOURCE_TYPES.PLANGRID: return "PlanGrid";
    case SOURCE_TYPES.GENERIC_PDF: return "PDF";
    default: return sourceType || "Unknown";
  }
}
