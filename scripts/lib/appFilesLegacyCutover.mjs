export const BUCKET = "app-files";
export const LEGACY_PREFIX = "uploads/";

export const SCALAR_REFERENCE_COLUMNS = Object.freeze([
  ["drawings", "file_url"],
  ["drawings", "thumbnail_url"],
  ["drawing_sets", "file_url"],
  ["drawing_revisions", "file_url"],
  ["drawing_analyses", "file_url"],
  ["drawing_analyses", "storage_path"],
  ["drawing_signoffs", "signature_url"],
  ["submittals", "file_url"],
  ["submittal_rounds", "file_url"],
  ["submittal_rounds", "markup_file_url"],
  ["submittal_sheet_responses", "markup_file_url"],
  ["documents", "file_url"],
  ["photos", "file_url"],
  ["expenses", "receipt_url"],
  ["model_registry", "file_url"],
  ["model_registry", "cloud_url"],
  ["scope_items", "file_url"],
  ["scope_items", "storage_path"],
  ["mitigation_actions", "proof_url"],
  ["deliveries", "shipping_ticket_path"],
  ["deliveries", "shipping_ticket_url"],
  ["uploaded_files", "file_url"],
  ["user_profiles", "avatar_url"],
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value, label = "value") {
  if (!UUID_PATTERN.test(value || "")) {
    throw new Error(`${label} must be a UUID.`);
  }
  return value.toLowerCase();
}

export function isLegacyPath(value) {
  return typeof value === "string" && value.startsWith(LEGACY_PREFIX);
}

export function destinationPath(orgId, sourcePath) {
  const normalizedOrgId = assertUuid(orgId, "FOUNDING_ORG_ID");
  if (!isLegacyPath(sourcePath)) {
    throw new Error(`Not a legacy app-files path: ${sourcePath}`);
  }
  return `${normalizedOrgId}/${sourcePath}`;
}

function rewriteJsonValue(value, orgId, paths) {
  if (typeof value === "string") {
    if (!isLegacyPath(value)) return value;
    paths.add(value);
    return destinationPath(orgId, value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteJsonValue(entry, orgId, paths));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, rewriteJsonValue(entry, orgId, paths)]),
    );
  }
  return value;
}

function rewriteCommaSeparatedValue(value, orgId, paths) {
  const parts = value.split(/(,\s*)/);
  let changed = false;
  const rewritten = parts.map((part, index) => {
    if (index % 2 === 1) return part;
    const leading = part.match(/^\s*/)?.[0] || "";
    const trailing = part.match(/\s*$/)?.[0] || "";
    const token = part.trim();
    if (!isLegacyPath(token)) return part;
    paths.add(token);
    changed = true;
    return `${leading}${destinationPath(orgId, token)}${trailing}`;
  });
  return { changed, value: rewritten.join("") };
}

export function rewriteAttachmentReferences(value, orgId) {
  if (value == null || value === "") {
    return { changed: false, value, legacyPaths: [] };
  }
  if (typeof value !== "string") {
    throw new Error("change_orders.attachments must be text.");
  }

  const paths = new Set();
  const trimmed = value.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error(`Attachments look like JSON but cannot be parsed: ${error.message}`);
    }
    const rewritten = rewriteJsonValue(parsed, orgId, paths);
    const nextValue = paths.size > 0 ? JSON.stringify(rewritten) : value;
    return { changed: paths.size > 0, value: nextValue, legacyPaths: [...paths] };
  }

  const result = rewriteCommaSeparatedValue(value, orgId, paths);
  if (value.includes(LEGACY_PREFIX) && !result.changed) {
    throw new Error(
      "Attachments contain an embedded uploads/ path that is not a JSON value or comma-separated token.",
    );
  }
  return { ...result, legacyPaths: [...paths] };
}

export function comparableObjectMetadata(info) {
  const size = Number(info?.size ?? info?.metadata?.size);
  const etag = info?.etag ?? info?.eTag ?? info?.metadata?.etag ?? info?.metadata?.eTag ?? null;
  return {
    size: Number.isFinite(size) ? size : null,
    etag: typeof etag === "string" ? etag.replaceAll('"', "") : null,
  };
}
