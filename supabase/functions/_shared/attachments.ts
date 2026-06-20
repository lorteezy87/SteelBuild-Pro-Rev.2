// Shared attachment guards for the email functions (#7).
//
// Inbound (email-ingest) and outbound (email-send) attachments both land in
// Storage at `<project>/<message>/<filename>`. The filename comes from an
// external sender (ingest) or a user (send), so it MUST be sanitized before it
// touches a storage path (otherwise a name like "../x" or "a/b" escapes the
// intended prefix), and each file must be bounded + denylisted so a webhook
// caller can't push executables or unbounded blobs into storage.

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_ATTACHMENTS_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB per message
export const MAX_ATTACHMENT_COUNT = 25;

// Executable / script extensions that must never be written to storage.
export const DANGEROUS_ATTACHMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  "exe", "msi", "msix", "com", "scr", "pif", "cpl", "dll", "sys", "drv",
  "bat", "cmd", "vbs", "vbe", "vb", "wsf", "wsh", "ws", "hta", "ps1", "psm1", "psd1",
  "reg", "scf", "lnk", "inf", "ins", "isp", "msc", "msp", "mst", "gadget",
  "sh", "bash", "zsh", "ksh", "csh", "run", "bin", "elf",
  "app", "dmg", "pkg", "deb", "rpm", "apk", "jar", "jnlp",
  "js", "mjs", "cjs", "jse", "php", "phar", "phtml", "asp", "aspx", "jsp", "jspx",
  "cgi", "pl", "py", "pyc", "rb", "html", "htm", "xhtml", "shtml", "swf",
]);

/** Lowercase extension (no dot) for a filename, or "" when there is none. */
export function attachmentExtension(name: string | null | undefined): string {
  if (!name) return "";
  const parts = String(name).split(/[\\/]/);
  const base = parts[parts.length - 1] || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function isDangerousAttachment(name: string | null | undefined): boolean {
  const ext = attachmentExtension(name);
  return ext !== "" && DANGEROUS_ATTACHMENT_EXTENSIONS.has(ext);
}

/** Drop control characters (0x00–0x1F and 0x7F) without using a regex escape. */
function stripControlChars(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 32 && code !== 127) out += ch;
  }
  return out;
}

/**
 * Make an attachment filename safe to embed in a storage path: drop any
 * directory components, strip control chars, neutralize leading dots ("..",
 * dotfiles), and bound the length. Always returns a non-empty name so the
 * storage path stays well-formed.
 */
export function sanitizeAttachmentName(name: string | null | undefined): string {
  if (!name) return "attachment";
  const parts = String(name).split(/[\\/]/);
  let base = parts[parts.length - 1] || "";
  base = stripControlChars(base);
  base = base.replace(/^\.+/, ""); // leading dots: "..", ".bashrc"
  base = base.trim();
  if (!base) return "attachment";
  const MAX = 200;
  if (base.length > MAX) {
    const ext = attachmentExtension(base);
    const suffix = ext ? `.${ext}` : "";
    base = base.slice(0, MAX - suffix.length) + suffix;
  }
  return base;
}
