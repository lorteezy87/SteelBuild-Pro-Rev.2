export type AttachmentContentDecision =
  | { allowed: false; reason: string }
  | { allowed: true; contentType: string; inlineSafe: boolean; disposition: 'attachment' };

const ACTIVE_EXTENSIONS = new Set(['html', 'htm', 'xhtml', 'svg', 'svgz', 'xml', 'js', 'mjs', 'cjs', 'css', 'json', 'wasm', 'exe', 'com', 'bat', 'cmd', 'ps1', 'vbs', 'scr', 'hta']);
const DOWNLOAD_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'dwg', 'dxf', 'ifc', 'ifczip', 'zip', 'txt', 'csv', 'rtf', 'nc', 'nc1', 'dst', 'dstv', 'step', 'stp', 'dgn', 'stl']);
const IMAGE_EXTENSIONS: Record<string, string[]> = {
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/gif': ['gif'], 'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};

/** Admission/classification only, not a malware scanner or archive inspector.
 * Unknown construction binaries are download-only octet streams; sender MIME
 * never controls the served type. Callers must retain attachment disposition. */
export function classifyAttachmentContent({ filename, contentType, bytes }: {
  filename: string; contentType?: string | null; bytes: Uint8Array;
}): AttachmentContentDecision {
  const extension = filename.toLowerCase().split('.').pop() || '';
  const declared = (contentType || '').split(';')[0].trim().toLowerCase();
  const deny = (reason: string): AttachmentContentDecision => ({ allowed: false, reason });
  // XML media types use /xml or +xml; "openxmlformats" is an Office ZIP
  // container label, not an active XML document served by the browser.
  if (ACTIVE_EXTENSIONS.has(extension) || /(?:html|svg|javascript|ecmascript)|(?:\/|\+)xml$/i.test(declared) || declared === 'text/css') {
    return deny('Active web content is not accepted as an attachment');
  }
  if (bytes.length === 0) return deny('Attachment is empty');
  const head = bytes.subarray(0, 4096);
  const decoder = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  const text = new TextDecoder(decoder).decode(head).replace(/^\uFEFF/, '');
  if (/^\s*(?:<!--[\s\S]*?-->\s*)*<(?:!doctype\s+html|\?xml|[a-z][\w:-]*(?:\s|>|\/))/i.test(text)) {
    return deny('Attachment content is HTML/XML rather than the named document');
  }
  const begins = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  let detected: string | null = null;
  if (begins(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) detected = 'image/png';
  else if (begins(0xff, 0xd8, 0xff)) detected = 'image/jpeg';
  else if (/^GIF8[79]a/.test(text)) detected = 'image/gif';
  else if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') detected = 'image/webp';
  else if (text.startsWith('%PDF-')) detected = 'application/pdf';
  if (detected) {
    if (!IMAGE_EXTENSIONS[detected].includes(extension)) return deny('Attachment extension does not match its content');
    if (declared && declared !== 'application/octet-stream' && declared !== detected && !(detected === 'image/jpeg' && declared === 'image/jpg')) {
      return deny('Attachment MIME type does not match its content');
    }
    return { allowed: true, contentType: detected, inlineSafe: true, disposition: 'attachment' };
  }
  if (!DOWNLOAD_EXTENSIONS.has(extension)) return deny('Unsupported or mismatched attachment content');
  return { allowed: true, contentType: 'application/octet-stream', inlineSafe: false, disposition: 'attachment' };
}
