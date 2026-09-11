import { describe, expect, it } from "vitest";
import {
  decodeTextBytes,
  readFileText,
  stripNulDeep,
  TextDecodingError,
} from "../textDecoding";

const NUL = String.fromCharCode(0);
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);
const CSV = "piece_mark,quantity,profile\r\nB1,2,W12X26\r\nC2,1,W10X33\r\n";

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function utf16(text: string, order: "le" | "be", bom = false): Uint8Array<ArrayBuffer> {
  const out: number[] = bom ? (order === "le" ? [0xff, 0xfe] : [0xfe, 0xff]) : [];
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (order === "le") out.push(unit & 0xff, unit >> 8);
    else out.push(unit >> 8, unit & 0xff);
  }
  return new Uint8Array(out);
}

function utf32(text: string, order: "le" | "be"): Uint8Array {
  const out: number[] = order === "le" ? [0xff, 0xfe, 0, 0] : [0, 0, 0xfe, 0xff];
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const le = [code & 0xff, (code >> 8) & 0xff, (code >> 16) & 0xff, 0];
    out.push(...(order === "le" ? le : le.reverse()));
  }
  return new Uint8Array(out);
}

describe("decodeTextBytes", () => {
  it.each([
    ["UTF-8", "utf-8", utf8(CSV)],
    ["UTF-8 with a BOM", "utf-8", new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(CSV)])],
    ["UTF-16LE with a BOM", "utf-16le", utf16(CSV, "le", true)],
    ["UTF-16BE with a BOM", "utf-16be", utf16(CSV, "be", true)],
    ["UTF-16LE without a BOM", "utf-16le", utf16(CSV, "le")],
    ["UTF-16BE without a BOM", "utf-16be", utf16(CSV, "be")],
  ] as const)("decodes %s as %s with no U+0000 left", (_label, encoding, bytes) => {
    const decoded = decodeTextBytes(bytes);
    expect(decoded.encoding).toBe(encoding);
    expect(decoded.text).toBe(CSV);
    expect(decoded.nulsRemoved).toBe(0);
  });

  it("accepts an ArrayBuffer as well as a Uint8Array", () => {
    const bytes = utf16(CSV, "le");
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    expect(decodeTextBytes(buffer).text).toBe(CSV);
  });

  it.each([
    ["UTF-32LE", utf32(CSV, "le")],
    ["UTF-32BE", utf32(CSV, "be")],
  ])("rejects %s by name with re-save guidance", (_label, bytes) => {
    expect(() => decodeTextBytes(bytes)).toThrow(TextDecodingError);
    // Named, not just caught by the binary-data guard further down.
    expect(() => decodeTextBytes(bytes)).toThrow(/UTF-32.*CSV UTF-8/);
  });

  it("treats 3,800 bytes of trailing NUL padding as padding, not binary", () => {
    const decoded = decodeTextBytes(new Uint8Array([...utf8(CSV), ...new Uint8Array(3800)]));
    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.text).toBe(CSV);
    expect(decoded.nulsRemoved).toBe(3800);
  });

  it("strips a few embedded NULs and counts them", () => {
    const bytes = new Uint8Array([...utf8("piece_mark\r\nB"), 0, ...utf8("1\r\n"), 0, 0]);
    const decoded = decodeTextBytes(bytes);
    expect(decoded.text).toBe("piece_mark\r\nB1\r\n");
    expect(decoded.text.includes(NUL)).toBe(false);
    expect(decoded.nulsRemoved).toBe(3);
  });

  it("rejects data with many embedded NULs as not a text export", () => {
    // Zeros on both parities, so it is neither UTF-16 nor text.
    const binary = new Uint8Array(
      Array.from({ length: 400 }, (_, index) => (index % 4 < 2 ? 0x41 + (index % 26) : 0)),
    );
    expect(() => decodeTextBytes(binary)).toThrow(TextDecodingError);
    expect(() => decodeTextBytes(binary)).toThrow(/doesn't look like a text export.*CSV UTF-8/);
  });

  it("keeps decoding a Windows-1252 byte as U+FFFD instead of failing", () => {
    const decoded = decodeTextBytes(new Uint8Array([...utf8("PL1/2"), 0xbd]));
    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.text).toBe(`PL1/2${REPLACEMENT_CHARACTER}`);
  });
});

describe("readFileText", () => {
  it("decodes a Blob from its bytes rather than as UTF-8", async () => {
    await expect(readFileText(new Blob([utf16(CSV, "le")]))).resolves.toEqual({
      text: CSV,
      encoding: "utf-16le",
      nulsRemoved: 0,
    });
  });
});

describe("stripNulDeep", () => {
  it("cleans string values, keys and nested arrays and counts each removal", () => {
    const when = new Date("2026-09-08T04:50:00.000Z");
    const input: Record<string, unknown> = {
      [`piece${NUL}_mark`]: `B${NUL}1`,
      quantity: 2,
      when,
      nested: [{ note: `a${NUL}${NUL}b` }, 3, null],
      flag: true,
    };
    const { value, removed } = stripNulDeep(input);
    expect(value).toEqual({
      piece_mark: "B1",
      quantity: 2,
      when,
      nested: [{ note: "ab" }, 3, null],
      flag: true,
    });
    expect(value.when).toBe(when);
    expect(removed).toBe(4);
  });

  it("reports zero removals for clean data", () => {
    const rows = [{ piece_mark: "B1", quantity: 2 }];
    const { value, removed } = stripNulDeep(rows);
    expect(value).toEqual(rows);
    expect(removed).toBe(0);
  });
});

describe("decodeTextBytes — review follow-ups", () => {
  it("drops a stray final byte on odd-length UTF-16 instead of decoding U+FFFD", () => {
    for (const bom of [true, false]) {
      const base = utf16(CSV, "le", bom);
      const trailingNul = decodeTextBytes(new Uint8Array([...base, 0x00]));
      expect(trailingNul.encoding).toBe("utf-16le");
      expect(trailingNul.text).toBe(CSV);
      expect(trailingNul.nulsRemoved).toBe(1);

      const trailingLf = decodeTextBytes(new Uint8Array([...base, 0x0a]));
      expect(trailingLf.text).toBe(CSV);
      expect(trailingLf.text).not.toContain("\uFFFD");
      expect(trailingLf.nulsRemoved).toBe(0);
    }
  });

  it("rejects zip, OLE and PDF containers by signature, however few NULs they carry", () => {
    const signatures = [
      [0x50, 0x4b, 0x03, 0x04],
      [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
      [0x25, 0x50, 0x44, 0x46, 0x2d],
    ];
    for (const signature of signatures) {
      // No NULs at all: only the signature can give it away.
      const bytes = new Uint8Array([...signature, ...new TextEncoder().encode("x".repeat(5000))]);
      expect(() => decodeTextBytes(bytes)).toThrow(/doesn't look like a text export.*CSV UTF-8/);
    }
  });
});
