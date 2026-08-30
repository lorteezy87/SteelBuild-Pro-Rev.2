/**
 * Map browser / Supabase / Postgres "quota exceeded" errors to a
 * short user-facing sentence. The raw WebKit/Supabase text is
 * "The quota has been exceeded." — useless on a change-order upload.
 */

const FILE_QUOTA_RE =
  /quota has been exceeded|quota exceeded|storage quota|disk quota|no space left|payload too large|resource.?exhausted/i;

export const FILE_STORAGE_QUOTA_MESSAGE =
  "File storage is full. Delete unused drawings, 3D models, or documents, then try again.";

export const BROWSER_STORAGE_QUOTA_MESSAGE =
  "This browser is out of local storage. Clear site data for SteelBuild Pro, or try another browser.";

type ErrorLike = {
  name?: string;
  message?: string;
  error?: string;
  details?: string;
  statusCode?: string | number;
  status?: number;
  code?: string;
};

function asErrorLike(err: unknown): ErrorLike {
  if (err && typeof err === "object") return err as ErrorLike;
  return {};
}

function combinedText(err: unknown): string {
  if (typeof err === "string") return err;
  const e = asErrorLike(err);
  return [e.message, e.error, e.details].filter(Boolean).join(" ");
}

/** Safari / WebKit localStorage or IndexedDB QuotaExceededError. */
export function isBrowserQuotaError(err: unknown): boolean {
  const e = asErrorLike(err);
  return e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED";
}

/** Supabase Storage, Postgres disk, or HTTP 413 payload-too-large. */
export function isFileStorageQuotaError(err: unknown): boolean {
  if (isBrowserQuotaError(err)) return false;
  const e = asErrorLike(err);
  if (e.statusCode === "413" || e.statusCode === 413 || e.status === 413) return true;
  if (e.code === "413" || e.code === "54000") return true;
  return FILE_QUOTA_RE.test(combinedText(err));
}

export function isQuotaExceededError(err: unknown): boolean {
  return isBrowserQuotaError(err) || isFileStorageQuotaError(err);
}

/** Friendly copy, or null when this is not a quota error. */
export function quotaExceededUserMessage(err: unknown): string | null {
  if (isBrowserQuotaError(err)) return BROWSER_STORAGE_QUOTA_MESSAGE;
  if (isFileStorageQuotaError(err)) return FILE_STORAGE_QUOTA_MESSAGE;
  return null;
}

/** Re-throw file-storage quota errors with the user-facing message. */
export function remapQuotaError(err: unknown): never {
  const mapped = quotaExceededUserMessage(err);
  throw mapped ? new Error(mapped) : err;
}
