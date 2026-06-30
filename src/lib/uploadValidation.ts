/**
 * Central upload validation — extension allowlist + size cap per workflow,
 * with a fail-closed global backstop (#21).
 *
 * Two layers of defense, both client-side hardening (the real tenant boundary
 * is Supabase RLS + the org-scoped storage path):
 *
 *   1. Per-workflow profiles (allowlist + size cap). Call `validateUpload(file,
 *      workflow)` at the call site BEFORE `integrations.Core.UploadFile` so the
 *      user gets an early, specific message and we never start an upload we'll
 *      reject — and/or pass `{ file, workflow }` to UploadFile so the tighter
 *      profile is enforced at the storage chokepoint.
 *
 *   2. A fail-closed backstop enforced INSIDE `integrations.Core.UploadFile`
 *      (the single storage-write path in the app). Even a call site that never
 *      wires a workflow still cannot push a dangerous executable/script or an
 *      unbounded blob into storage — the `default` profile blocks the dangerous
 *      extension denylist and an absolute size ceiling.
 *
 * This is content/size hardening (DoS + malware/stored-content surface), not
 * access control. Keep the allowlists permissive enough to never reject a file
 * a real steel-project workflow legitimately produces.
 */

export type UploadWorkflow =
  | "drawings" // shop/erection drawing PDFs (sets, revisions, single sheets)
  | "documents" // general DMS document repository — broad construction file mix
  | "photo" // field/progress photos (auto-compressed upstream)
  | "ocr" // images/PDFs sent through OCR extraction
  | "model3d" // IFC / BIM model files
  | "import" // spreadsheet/CSV/XML batch imports stored for audit
  | "attachment" // RFI / scope / misc record attachments
  | "default"; // fail-closed backstop for un-wired call sites

const MB = 1024 * 1024;

export interface UploadProfile {
  /** Human label used in error messages. */
  label: string;
  /**
   * Allowed lowercase extensions (without the dot). `null` means "any
   * extension that is not on the dangerous denylist" — used by the `default`
   * backstop so un-wired paths still upload, just bounded and denylisted.
   */
  allowedExtensions: string[] | null;
  /** Hard maximum size in bytes. */
  maxBytes: number;
}

/**
 * Extensions that must NEVER reach storage regardless of workflow — executables,
 * installers, shells, and web/script payloads that could be served back and run.
 * Applied on top of every profile, including `default`. Intentionally focused on
 * genuinely dangerous types; benign-but-unusual extensions are left to the
 * per-workflow allowlists rather than blanket-blocked here.
 */
export const DANGEROUS_EXTENSIONS: ReadonlySet<string> = new Set([
  // Windows executables / installers / libraries
  "exe", "msi", "msix", "com", "scr", "pif", "cpl", "dll", "sys", "drv",
  "bat", "cmd", "vbs", "vbe", "vb", "wsf", "wsh", "ws", "hta", "ps1", "psm1", "psd1",
  "reg", "scf", "lnk", "inf", "ins", "isp", "msc", "msp", "mst", "gadget",
  // Unix / cross-platform executables & scripts
  "sh", "bash", "zsh", "ksh", "csh", "run", "bin", "out", "elf",
  "app", "dmg", "pkg", "deb", "rpm", "apk", "jar", "jnlp",
  // Server/web script payloads
  "js", "mjs", "cjs", "mts", "cts", "jse", "wasm", "php", "phar", "phtml", "php3", "php4", "php5",
  "asp", "aspx", "jsp", "jspx", "cgi", "pl", "py", "pyc", "rb",
  "html", "htm", "xhtml", "shtml", "swf",
]);

/**
 * Common construction document/image extensions used by the broad "documents"
 * and "attachment" profiles. Kept generous on purpose — the DMS is a catch-all
 * repository for whatever a project produces.
 */
const DOCUMENT_EXTENSIONS = [
  // Documents / office
  "pdf", "doc", "docx", "rtf", "txt", "md", "csv", "tsv",
  "xls", "xlsx", "xlsm", "ppt", "pptx", "odt", "ods", "odp",
  // Images
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "tif", "tiff", "svg",
  // CAD / engineering / models
  "dwg", "dxf", "dwf", "ifc", "ifczip", "ifcxml", "rvt", "rfa", "nwd", "nwc",
  "skp", "step", "stp", "iges", "igs", "3dm", "sat",
  // Archives & data
  "zip", "7z", "rar", "gz", "tgz", "xml", "json",
];

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp", "tif", "tiff"];

/**
 * Per-workflow profiles. Size caps are deliberately generous (DoS ceiling, not a
 * business rule) so they never reject a legitimate file; the extension allowlist
 * is the primary control.
 */
const PROFILES: Record<UploadWorkflow, UploadProfile> = {
  drawings: {
    label: "Drawing uploads",
    allowedExtensions: ["pdf"],
    maxBytes: 150 * MB,
  },
  documents: {
    label: "Document uploads",
    allowedExtensions: DOCUMENT_EXTENSIONS,
    maxBytes: 150 * MB,
  },
  photo: {
    label: "Photo uploads",
    allowedExtensions: IMAGE_EXTENSIONS,
    maxBytes: 50 * MB,
  },
  ocr: {
    label: "OCR uploads",
    allowedExtensions: [...IMAGE_EXTENSIONS, "pdf"],
    maxBytes: 25 * MB,
  },
  model3d: {
    label: "3D model uploads",
    allowedExtensions: ["ifc", "ifczip", "ifcxml"],
    maxBytes: 600 * MB,
  },
  import: {
    label: "Spreadsheet / data imports",
    allowedExtensions: ["csv", "tsv", "txt", "xls", "xlsx", "xlsm", "xml"],
    maxBytes: 60 * MB,
  },
  attachment: {
    label: "Attachments",
    allowedExtensions: [
      "pdf", "doc", "docx", "txt", "csv", "xls", "xlsx",
      ...IMAGE_EXTENSIONS,
    ],
    maxBytes: 100 * MB,
  },
  default: {
    label: "Uploads",
    allowedExtensions: null, // any non-dangerous extension
    maxBytes: 600 * MB,
  },
};

/** Resolve a workflow key to its profile, falling back to the backstop. */
export function getUploadProfile(workflow?: UploadWorkflow | null): UploadProfile {
  return (workflow && PROFILES[workflow]) || PROFILES.default;
}

/** Lowercase extension (no dot) for a filename, or "" when there is none. */
export function fileExtension(name: string | null | undefined): string {
  if (!name) return "";
  const base = String(name).split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  // No dot, or leading-dot dotfile with no real extension → no extension.
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / MB;
  // Whole numbers read cleaner for the caps (e.g. "150 MB"); show one decimal
  // for in-between actual file sizes (e.g. "12.4 MB").
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

function formatExtList(exts: string[]): string {
  const labels = exts.map((e) => `.${e}`);
  if (labels.length <= 1) return labels.join("");
  if (labels.length <= 6) {
    return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
  }
  return `${labels.slice(0, 6).join(", ")} and others`;
}

export interface UploadValidationResult {
  ok: boolean;
  /** User-facing reason when `ok` is false. */
  error?: string;
}

/**
 * Validate a single file against a workflow profile (and the global dangerous
 * extension denylist). Never throws — returns `{ ok, error }` so callers can
 * surface a toast. Use `assertUploadAllowed` when you want a throw instead.
 */
export function validateUpload(
  file: File | { name?: string; size?: number } | null | undefined,
  workflow: UploadWorkflow = "default",
): UploadValidationResult {
  if (!file) return { ok: false, error: "No file provided." };

  const name = "name" in file ? file.name : undefined;
  const size = "size" in file ? file.size : undefined;
  const ext = fileExtension(name);
  const profile = getUploadProfile(workflow);

  // 1. Dangerous extensions are blocked everywhere, including `default`.
  if (ext && DANGEROUS_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Files of type ".${ext}" can't be uploaded for security reasons.` };
  }

  // 2. Per-workflow allowlist (skipped for the `default` backstop, which allows
  //    any non-dangerous extension).
  if (profile.allowedExtensions) {
    if (!ext || !profile.allowedExtensions.includes(ext)) {
      const got = ext ? `".${ext}" isn't supported` : "the file has no recognized extension";
      return {
        ok: false,
        error: `${profile.label} accept ${formatExtList(profile.allowedExtensions)} — ${got}.`,
      };
    }
  }

  // 3. Size ceiling.
  if (typeof size === "number" && size > profile.maxBytes) {
    return {
      ok: false,
      error: `File is too large (${formatBytes(size)}). The limit for ${profile.label.toLowerCase()} is ${formatBytes(profile.maxBytes)}.`,
    };
  }

  return { ok: true };
}

/** Throwing variant of {@link validateUpload} for enforcement at the chokepoint. */
export function assertUploadAllowed(
  file: File | { name?: string; size?: number } | null | undefined,
  workflow: UploadWorkflow = "default",
): void {
  const result = validateUpload(file, workflow);
  if (!result.ok) throw new Error(result.error || "Upload rejected.");
}

/**
 * Make a stored/display filename safe: strip path components, control
 * characters, and null bytes, and bound the length. Normal filenames (spaces,
 * parentheses, hyphens, dots) pass through unchanged. Returns "file" if nothing
 * usable remains.
 */
export function sanitizeFilename(name: string | null | undefined): string {
  if (!name) return "file";
  // Drop any directory components a browser/OS might include.
  let base = String(name).split(/[\\/]/).pop() || "";
  // Remove control chars (incl. NUL) that have no place in a filename.
  base = base.replace(/\p{Cc}/gu, "");
  base = base.trim();
  // Avoid leading dots producing hidden/ambiguous names.
  base = base.replace(/^\.+/, "");
  if (!base) return "file";
  // Bound length while preserving the extension.
  const MAX = 200;
  if (base.length > MAX) {
    const ext = fileExtension(base);
    const suffix = ext ? `.${ext}` : "";
    base = base.slice(0, MAX - suffix.length) + suffix;
  }
  return base;
}
