/**
 * Pure helpers for RFI PDF attachment Document rows + upload toast copy.
 * Keep auth / integrations / React Query / toast / setState out of this module.
 */

export type RfiAttachmentRecord = {
  id?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  rfi_number?: string | null;
  discipline?: string | null;
};

export type RfiAttachmentFileLike = {
  name: string;
  size: number;
  type?: string | null;
};

/** True when the upload loop has a saved RFI and at least one file. */
export function canUploadRfiAttachments(
  rfiRecord: RfiAttachmentRecord | null | undefined,
  files: unknown[] | null | undefined,
): boolean {
  return Boolean(rfiRecord?.id && files && files.length > 0);
}

/** Match historical `Math.max(1, Math.round(file.size / 1024))`. */
export function rfiAttachmentSizeKb(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}

/**
 * Shape the Document.create fields for one uploaded RFI PDF (before project stamp).
 */
export function buildRfiAttachmentDocumentFields(opts: {
  rfiRecord: RfiAttachmentRecord;
  file: RfiAttachmentFileLike;
  fileUrl: string;
  projectName: string;
  uploadedBy: string;
  nowIso: string;
}): Record<string, unknown> {
  const { rfiRecord, file, fileUrl, projectName, uploadedBy, nowIso } = opts;
  return {
    project_name: rfiRecord.project_name || projectName || "",
    rfi_id: rfiRecord.id,
    display_name: file.name,
    description: `Attachment for ${rfiRecord.rfi_number || "RFI"}`,
    file_name: file.name,
    file_url: fileUrl,
    file_type: "pdf",
    file_size_kb: rfiAttachmentSizeKb(file.size),
    mime_type: file.type || "application/pdf",
    category: "RFI",
    document_type: "RFI Attachment",
    discipline: rfiRecord.discipline || "Other",
    status: "Current",
    revision_number: "0",
    revision_date: nowIso.slice(0, 10),
    uploaded_by: uploadedBy || "Unknown",
    uploaded_date: nowIso,
    tags: ["RFI", rfiRecord.rfi_number || rfiRecord.id].filter(Boolean),
  };
}

export type RfiAttachmentToast = {
  level: "success" | "warning" | "error";
  message: string;
};

/**
 * Toast copy after an attachment batch. Returns null when nothing was attempted
 * (caller already early-returned).
 */
export function formatRfiAttachmentUploadToast(
  succeeded: number,
  failedCount: number,
  rfiNumber?: string | null,
): RfiAttachmentToast | null {
  if (succeeded === 0 && failedCount === 0) return null;
  if (failedCount > 0 && succeeded > 0) {
    return {
      level: "warning",
      message: `${succeeded} PDF${succeeded === 1 ? "" : "s"} attached; ${failedCount} failed. RFI was saved.`,
    };
  }
  if (failedCount > 0) {
    return {
      level: "error",
      message: `RFI was saved, but ${failedCount} PDF attachment${failedCount === 1 ? "" : "s"} failed.`,
    };
  }
  return {
    level: "success",
    message: `${succeeded} PDF${succeeded === 1 ? "" : "s"} attached to ${rfiNumber || "RFI"}`,
  };
}
