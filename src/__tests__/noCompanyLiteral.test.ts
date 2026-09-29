import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * S&H Steel is a private company with no part in the creation, distribution or
 * marketing of this product and no rights in it (owner, 2026-09-21). No
 * vocabulary, class-membership set, default, menu option or generated document
 * may name it.
 *
 * Five separate `BIC_CHOICES` lists offered "S&H" as a ball-in-court party that
 * no DB constraint allowed, so choosing it silently lost the user's save; the
 * .ics PRODID read "-//S&H Steel Co//…", so every calendar any tenant exported
 * carried one company's name; the transmittal PDF hardcoded that company as the
 * sender a GC reads as the fabricator. Each was found and fixed separately,
 * which is the argument for one guard over the whole tree rather than a list of
 * the places someone already thought of.
 *
 * Two things this guard deliberately does NOT do:
 *
 *   * It does not read comments. Prose describing these fixes has to be able to
 *     name what was fixed — `src/lib/ballInCourt.ts` and the migration that
 *     added the constraints both do, correctly.
 *   * It does not ban bare "SHS". In structural steel SHS is a Square Hollow
 *     Section, a standard profile designation alongside RHS and CHS, so a
 *     section type or an imported piece mark may legitimately carry it. Only
 *     the company form "SHS Steel" is matched.
 *
 * Tests are excluded because several of them must assert on the literal to
 * prove it is gone — see `generatedDocumentSender.test.ts` and
 * `generateTransmittal.test.js`. Two non-test readers legitimately parse
 * somebody else's file format whose CONTENT carries the name (`importDrawingLog`
 * reads a GC drawing log's "FABRICATOR NAME : S&H"; `extractIfcRoster` handles a
 * Tekla export quirk). Neither needs an exemption: they match on the header
 * shape, not on the company, so nothing outside a comment names it.
 */

const SRC = join(__dirname, "..");

/**
 * The company's three written forms.
 *
 * `\b` on the ampersand form is load-bearing, not decoration. Unbounded,
 * /S&H/i matches the substring inside a hub query string —
 * "hub_tab=drawings&hub_view=sets" contains "s&h" across the word break — and
 * this module builds those. A guard that fires on every hub URL gets deleted
 * within a week, so it has to be precise to be worth having.
 */
const COMPANY_LITERAL: ReadonlyArray<readonly [string, RegExp]> = [
  ["ampersand form", /\bS&H\b/i],
  ["initialism form", /\bSHS\s+Steel\b/i],
  ["email domain", /shsteel/i],
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

/** Strip comments so prose describing the old defects does not trip the guard. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const rel = (f: string) => f.replace(/.*\/src\//, "src/");

describe("no company literal in executable source", () => {
  const files = sourceFiles(SRC);

  it("scans the whole tree, not a broken glob", () => {
    // Without this, a wrong path makes every assertion below pass vacuously.
    expect(files.length).toBeGreaterThan(1000);
  });

  it.each(COMPANY_LITERAL)("names the company nowhere in code (%s)", (_label, pattern) => {
    const offenders = files
      .filter((f) => pattern.test(stripComments(readFileSync(f, "utf8"))))
      .map(rel);
    expect(
      offenders,
      `these put a private company into the product's own logic:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the guard actually bites", () => {
    // A guard that matches nothing passes forever after a typo. These are the
    // three real defects, as they were written.
    const [amp, initialism, domain] = COMPANY_LITERAL.map(([, p]) => p);
    expect(amp.test('{ value: "S&H", label: "S&H" },')).toBe(true);
    expect(amp.test('lines.push("PRODID:-//S&H Steel Co//SteelBuild Pro//EN");')).toBe(true);
    expect(initialism.test('placeholder="SHS Steel Projects"')).toBe(true);
    expect(domain.test('placeholder="projects@shsteelaz.com"')).toBe(true);
  });

  it("does not flag what it must leave alone", () => {
    const [amp, initialism] = COMPANY_LITERAL.map(([, p]) => p);

    // A hub query string. The unbounded pattern matches this; ours must not.
    expect(amp.test('"/DrawingSubmittalHub?hub_tab=drawings&hub_view=sets"')).toBe(false);
    expect(amp.test("nextTabSearch(\"?hub_tab=drawings&hub_view=reviews\", \"revimpact\")")).toBe(false);

    // Square Hollow Section — a profile, not a company.
    expect(initialism.test('{ profile: "SHS 100x100x6", grade: "A500" }')).toBe(false);
    expect(initialism.test("const SHS_SECTIONS = [...];")).toBe(false);
  });

  it("reads no comments", () => {
    // ballInCourt.ts documents the BIC_CHOICES bug by naming it. That has to
    // stay legal, or the next reader loses the reason the vocabulary is closed.
    const commented = '// "S&H" was the other live bug.\nconst parties = ["GC"];';
    expect(COMPANY_LITERAL[0][1].test(stripComments(commented))).toBe(false);
  });
});
