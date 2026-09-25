import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Official record numbers (RFI / CO / submittal / …) come ONLY from the atomic
 * DB RPC `get_next_sequence_number`. `getNextFormattedNumber` already fails
 * closed — it retries the server call and then throws — so the way this
 * invariant actually breaks is a CALLER catching that throw and inventing a
 * number in the browser.
 *
 * That is what `ZonePanel.jsx` did:
 *
 *     catch (err) { rfiNumber = `RFI #${String(Date.now()).slice(-6)}`; }
 *
 * The result is not a harmless placeholder. It is an OFFICIAL number the
 * sequence never issued and will later issue to somebody else, on a record the
 * EOR answers and the GC tracks in their log — so one RPC outage produces two
 * different RFIs that will end up sharing a number, and nothing downstream can
 * tell which is which.
 *
 * `.claude/hooks/numbersequencing-guard.sh` only guards files whose path
 * matches `numberSequencing`, so every other caller is unguarded — the rule is
 * the gate, not the hook. Hence a scan of the whole tree.
 *
 * Deliberately NOT banned: bare `Math.random()` / `Date.now()`. Both have
 * legitimate uses all over this tree — React list keys, cache busters, retry
 * jitter, elapsed-time math. `RfiControlCenter.tsx` builds a row key as
 * `rfi.id || rfi.rfi_number || rfi.title || String(Math.random())`, which READS
 * a record number and writes nothing; flagging it would push someone to "fix"
 * a correct line, and a guard that cries wolf gets deleted. What is banned is
 * the shape an invented record number actually has: a prefixed, numbered
 * identifier built from a clock or a random source.
 */

const SRC = join(__dirname, "..", "..", "..");

/**
 * A record-number-shaped string built from a clock or random source: a `#`
 * followed by an interpolation (or concatenation) fed by one.
 *
 *   `RFI #${String(Date.now()).slice(-6)}`   <- the real defect
 *   "CO #" + Math.random()
 */
const CLOCK_OR_RANDOM = String.raw\`(?:Date\\.now|Math\\.random|performance\\.now)\`;
const OFFICIAL_NUMBER_LHS = String.raw\`\\b(?:rfi|co|cr|cor|pco|submittal|transmittal|delivery|expense|change(?:_?order|_?request))[_A-Za-z]*number\\b\`;

const INVENTED_NUMBER: ReadonlyArray<readonly [string, RegExp]> = [
  [
    "official-number assignment",
    new RegExp(\`\${OFFICIAL_NUMBER_LHS}\\s*[:=]\\s*[^;\\n]{0,180}\${CLOCK_OR_RANDOM}\`, "i"),
  ],
  [
    "prefixed template literal",
    /\`[^\`]*(?:RFI|CO|CR|COR|PCO|SUB(?:MITTAL)?|TR(?:ANSMITTAL)?|DEL(?:IVERY)?|EXP(?:ENSE)?)[ #_-]*\\$\\{[^}]*(?:Date\\.now|Math\\.random|performance\\.now)[^}]*\\}/i,
  ],
  [
    "prefixed string concatenation",
    /["'][^"']*(?:RFI|CO|CR|COR|PCO|SUB(?:MITTAL)?|TR(?:ANSMITTAL)?|DEL(?:IVERY)?|EXP(?:ENSE)?)[ #_-]*["']\\s*\\+\\s*[^;\\n]{0,80}(?:Date\\.now|Math\\.random|performance\\.now)/i,
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

/** Strip comments — ZonePanel's own prose quotes the old defect on purpose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const rel = (f: string) => f.replace(/.*\/src\//, "src/");

describe("no caller invents an official record number", () => {
  const files = sourceFiles(SRC);

  it("scans the whole tree, not a broken glob", () => {
    // Without this, a wrong path makes every assertion below pass vacuously.
    expect(files.length).toBeGreaterThan(1000);
  });

  it.each(INVENTED_NUMBER)("mints no record number in the browser (%s)", (_label, pattern) => {
    const offenders = files
      .filter((f) => pattern.test(stripComments(readFileSync(f, "utf8"))))
      .map(rel);
    expect(
      offenders,
      `these mint an official number the sequence never issued:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the guard actually bites", () => {
    // A guard that matches nothing passes forever after a typo. Exercise the
    // shipped ZonePanel defect plus number formats that do not contain "#".
    const [assignment, tpl, concat] = INVENTED_NUMBER.map(([, p]) => p);
    expect(assignment.test("rfiNumber = \`RFI #\${String(Date.now()).slice(-6)}\`;")).toBe(true);
    expect(assignment.test("submittal_number: \`SUB-\${Date.now()}\`,")).toBe(true);
    expect(assignment.test("delivery_number = String(performance.now());")).toBe(true);
    expect(tpl.test("rfi_number: \`RFI #\${Date.now()}\`,")).toBe(true);
    expect(tpl.test("co_number: \`CO-\${Math.random()}\`,")).toBe(true);
    expect(concat.test('coNumber = "CO-" + Math.random();')).toBe(true);
  });

  it("does not flag the legitimate clock and random use it must leave alone", () => {
    const [assignment, tpl, concat] = INVENTED_NUMBER.map(([, p]) => p);

    // A React list key that READS a record number and writes nothing.
    const key = "id: rfi.id || rfi.rfi_number || rfi.title || String(Math.random()),";
    expect(assignment.test(key)).toBe(false);
    expect(tpl.test(key)).toBe(false);
    expect(concat.test(key)).toBe(false);

    // Retry jitter, cache busting, elapsed time, and a legitimately formatted
    // number whose value came from the RPC.
    for (const line of [
      "await new Promise((r) => setTimeout(r, 150 * (attempt + 1) + Math.random() * 50));",
      "const url = `${base}?t=${Date.now()}`;",
      "const elapsedMs = Date.now() - startedAt;",
      "return `${prefix}${String(allocated).padStart(padLength, \"0\")}`;",
    ]) {
      expect(assignment.test(line), line).toBe(false);
      expect(tpl.test(line), line).toBe(false);
      expect(concat.test(line), line).toBe(false);
    }
  });

  it("reads no comments", () => {
    // ZonePanel documents the removed defect by quoting it. That has to stay
    // legal, or the next reader loses the reason the fallback is gone.
    const commented = "// used to mint `RFI #${String(Date.now()).slice(-6)}` here\nconst n = await rpc();";
    expect(INVENTED_NUMBER[0][1].test(stripComments(commented))).toBe(false);
  });
});
