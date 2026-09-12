/**
 * Byte-exact text decoding for user-supplied import files.
 *
 * `Blob.text()` always decodes as UTF-8. Browsers disagree on whether it
 * honours a UTF-16 byte-order mark (Chrome does; the spec and Node do not),
 * and none detect BOM-less UTF-16. A misread UTF-16 export carries U+0000
 * between characters, and Postgres rejects U+0000 in json/jsonb/text with
 * 22P05 ("unsupported Unicode escape sequence") — Sentry JAVASCRIPT-REACT-2C.
 *
 * Pure module: no DOM or Buffer, so it runs identically in browsers and tests.
 */

export type TextEncodingLabel = "utf-8" | "utf-16le" | "utf-16be";

export type DecodedText = {
  text: string;
  encoding: TextEncodingLabel;
  /** U+0000 characters removed from the decoded text. */
  nulsRemoved: number;
};

export class TextDecodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextDecodingError";
  }
}

const RESAVE_HINT = 'Re-save it as "CSV UTF-8" and import it again.';
/** Bytes inspected when sniffing BOM-less UTF-16. */
const SNIFF_LIMIT = 4096;
/** Above both limits, embedded NULs mean binary data rather than stray padding. */
const MAX_STRIPPED_NULS = 16;
const MAX_NUL_RATIO = 0.01;
// Built at runtime: no literal NUL in the source, and no regex (no-control-regex).
const NUL = String.fromCharCode(0);
/**
 * Signatures of binary containers users pick by mistake. A real-size .xlsx
 * carries too few NULs for the ratio check to catch, so its zip bytes would
 * decode, lose their NULs, and stage as garbage rows.
 */
const BINARY_SIGNATURES: readonly (readonly number[])[] = [
  [0x50, 0x4b, 0x03, 0x04], // zip: .xlsx, .docx
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // OLE: legacy .xls
  [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
];

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return (
    bytes.length >= prefix.length &&
    prefix.every((byte, index) => bytes[index] === byte)
  );
}

/** BOM-less UTF-16: Latin text has a 0x00 in one byte of nearly every code unit. */
function sniffUtf16(bytes: Uint8Array): TextEncodingLabel | null {
  const length = Math.min(bytes.length, SNIFF_LIMIT) & ~1;
  if (length < 4) return null;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let index = 0; index < length; index += 2) {
    if (bytes[index] === 0) evenZeros += 1;
    if (bytes[index + 1] === 0) oddZeros += 1;
  }
  const units = length / 2;
  if (oddZeros / units >= 0.3 && evenZeros / units <= 0.05) return "utf-16le";
  if (evenZeros / units >= 0.3 && oddZeros / units <= 0.05) return "utf-16be";
  return null;
}

function detectEncoding(bytes: Uint8Array): TextEncodingLabel {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) return "utf-8";
  if (startsWith(bytes, [0xff, 0xfe])) return "utf-16le";
  if (startsWith(bytes, [0xfe, 0xff])) return "utf-16be";
  return sniffUtf16(bytes) ?? "utf-8";
}

/**
 * Decode file bytes by byte-order mark or UTF-16 sniff, then remove U+0000.
 * Throws `TextDecodingError` for UTF-32 and for data that is not text.
 */
export function decodeTextBytes(input: ArrayBuffer | Uint8Array): DecodedText {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (
    startsWith(bytes, [0xff, 0xfe, 0x00, 0x00]) ||
    startsWith(bytes, [0x00, 0x00, 0xfe, 0xff])
  ) {
    throw new TextDecodingError(
      `This file is saved as UTF-32 text, which can't be imported. ${RESAVE_HINT}`,
    );
  }
  if (BINARY_SIGNATURES.some((signature) => startsWith(bytes, signature))) {
    throw new TextDecodingError(
      `This file doesn't look like a text export. ${RESAVE_HINT}`,
    );
  }
  const encoding = detectEncoding(bytes);
  // A UTF-16 file can end on one stray byte (a 0x00 terminator, or a LF some
  // tool appended). Decoding the half code unit yields U+FFFD — a phantom row
  // or a corrupted last field — so drop it, counting a dropped 0x00 as a NUL.
  let payload = bytes;
  let droppedNul = 0;
  if (encoding !== "utf-8" && bytes.length % 2 === 1) {
    droppedNul = bytes[bytes.length - 1] === 0 ? 1 : 0;
    payload = bytes.subarray(0, bytes.length - 1);
  }
  // TextDecoder drops a leading BOM that matches its encoding. Non-fatal on
  // purpose: legacy Windows-1252 CSVs keep importing (as U+FFFD) like today.
  const decoded = new TextDecoder(encoding).decode(payload);

  let end = decoded.length;
  while (end > 0 && decoded.charCodeAt(end - 1) === 0) end -= 1; // NUL padding
  const body = decoded.slice(0, end);
  const embedded = body.split(NUL).length - 1;
  if (embedded > MAX_STRIPPED_NULS && embedded / body.length > MAX_NUL_RATIO) {
    throw new TextDecodingError(
      `This file doesn't look like a text export. ${RESAVE_HINT}`,
    );
  }
  const text = embedded > 0 ? body.split(NUL).join("") : body;
  return { text, encoding, nulsRemoved: decoded.length - text.length + droppedNul };
}

export async function readFileText(file: Blob): Promise<DecodedText> {
  return decodeTextBytes(await file.arrayBuffer());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Remove U+0000 from every string value and key of plain JSON-shaped data.
 * Recurses only into arrays and plain objects; Dates, Blobs, numbers and
 * other values pass through untouched. Only U+0000 is removed — other C0
 * controls are storable in Postgres and are left as they are.
 */
export function stripNulDeep<T>(input: T): { value: T; removed: number } {
  let removed = 0;
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (!value.includes(NUL)) return value;
      const next = value.split(NUL).join("");
      removed += value.length - next.length;
      return next;
    }
    if (Array.isArray(value)) return value.map((entry) => visit(entry));
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [visit(key) as string, visit(entry)]),
      );
    }
    return value;
  };
  const value = visit(input) as T;
  return { value, removed };
}
