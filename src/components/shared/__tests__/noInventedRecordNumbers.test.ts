import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Official record numbers (RFI / CO / submittal / …) come ONLY from the atomic
 * DB RPC get_next_sequence_number. getNextFormattedNumber already fails closed:
 * it retries the server call and then throws. A caller must never catch that
 * failure and invent a replacement number in the browser.
 *
 * ZonePanel once did exactly that:
 *
 *   catch (err) { rfiNumber = `RFI #${String(Date.now()).slice(-6)}`; }
 *
 * One RPC outage could therefore create an official identifier the sequence
 * never issued and could later issue to a different record.
 *
 * The legacy hook only watches numberSequencing paths, so this test is the
 * application-wide CI gate. It deliberately targets assignments/strings that
 * look like official record numbers rather than banning Date.now/Math.random
 * generally; clocks/randomness have legitimate uses for UI keys, cache busters,
 * retry jitter and elapsed-time measurement.
 */

const SRC = join(__dirname, "..", "..", "..");

const CLOCK_OR_RANDOM = String.raw`(?:Date\.now|Math\.random|performance\.now)`;
const OFFICIAL_NUMBER_LHS = String.raw`\b(?:rfi|co|cr|cor|pco|submittal|transmittal|delivery|expense|change(?:_?order|_?request))[_A-Za-z]*number\b`;

const INVENTED_NUMBER: ReadonlyArray<readonly [string, RegExp]> = [
  [
    "official-number assignment",
    new RegExp(`${OFFICIAL_NUMBER_LHS}\\s*[:=]\\s*[^;\\n]{0,180}${CLOCK_OR_RANDOM}`, "i"),
  ],
  [
    "prefixed template literal",
    /`[^`]*(?:RFI|CO|CR|COR|PCO|SUB(?:MITTAL)?|TR(?:ANSMITTAL)?|DEL(?:IVERY)?|EXP(?:ENSE)?)[ #_-]*\$\{[^}]*(?:Date\.now|Math\.random|performance\.now)[^}]*\}/i,
  ],
  [
    "prefixed string concatenation",
    /["'][^"']*(?:RFI|CO|CR|COR|PCO|SUB(?:MITTAL)?|TR(?:ANSMITTAL)?|DEL(?:IVERY)?|EXP(?:ENSE)?)[ #_-]*["']\s*\+\s*[^;\n]{0,80}(?:Date\.now|Math\.random|performance\.now)/i,
  ],
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

/** Strip comments — documenting a removed defect must not trip the guard. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const rel = (file: string) => file.replace(/.*\/src\//, "src/");

describe("no caller invents an official record number", () => {
  const files = sourceFiles(SRC);

  it("scans the whole application source tree, not a broken glob", () => {
    expect(files.length).toBeGreaterThan(1000);
  });

  it.each(INVENTED_NUMBER)("mints no record number in the browser (%s)", (_label, pattern) => {
    const offenders = files
      .filter((file) => pattern.test(stripComments(readFileSync(file, "utf8"))))
      .map(rel);

    expect(
      offenders,
      `these mint an official number the sequence never issued:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the guard actually bites on the shipped defect and no-# variants", () => {
    const [assignment, template, concat] = INVENTED_NUMBER.map(([, pattern]) => pattern);

    expect(assignment.test("rfiNumber = `RFI #${String(Date.now()).slice(-6)}`;")).toBe(true);
    expect(assignment.test("submittal_number: `SUB-${Date.now()}`,")).toBe(true);
    expect(assignment.test("delivery_number = String(performance.now());")).toBe(true);
    expect(template.test("rfi_number: `RFI #${Date.now()}`,")).toBe(true);
    expect(template.test("co_number: `CO-${Math.random()}`,")).toBe(true);
    expect(concat.test('coNumber = "CO-" + Math.random();')).toBe(true);
  });

  it("does not flag legitimate clock/random usage that only reads record data", () => {
    const [assignment, template, concat] = INVENTED_NUMBER.map(([, pattern]) => pattern);

    // React list key: reads rfi_number but does not assign an official number.
    const key = "id: rfi.id || rfi.rfi_number || rfi.title || String(Math.random()),";
    expect(assignment.test(key)).toBe(false);
    expect(template.test(key)).toBe(false);
    expect(concat.test(key)).toBe(false);

    for (const line of [
      "await new Promise((r) => setTimeout(r, 150 * (attempt + 1) + Math.random() * 50));",
      "const url = `${base}?t=${Date.now()}`;",
      "const elapsedMs = Date.now() - startedAt;",
      "return `${prefix}${String(allocated).padStart(padLength, \"0\")}`;",
    ]) {
      expect(assignment.test(line), line).toBe(false);
      expect(template.test(line), line).toBe(false);
      expect(concat.test(line), line).toBe(false);
    }
  });

  it("ignores comments that document the removed defect", () => {
    const commented =
      "// used to mint `RFI #${String(Date.now()).slice(-6)}` here\nconst n = await rpc();";
    for (const [, pattern] of INVENTED_NUMBER) {
      expect(pattern.test(stripComments(commented))).toBe(false);
    }
  });
});
