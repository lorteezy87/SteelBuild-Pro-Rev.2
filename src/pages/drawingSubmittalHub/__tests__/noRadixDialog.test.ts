/**
 * CLAUDE.md: "Never use Radix Dialog." This guards the Detailing Control Center
 * folder so a Radix dialog can't creep back in. It is scoped to this folder on
 * purpose: other areas still carry shadcn/Radix dialogs and move separately.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src/pages/drawingSubmittalHub");

// TODO: EscalateModal still renders Radix Dialog through
// src/pages/submittals/uiCompat. It mints official RFI/PCO numbers
// (get_next_sequence_number), so it moves in its own PR.
const ALLOWLIST = new Set(["EscalateModal.tsx"]);

const RADIX_DIALOG = [
  /from\s+["']@\/components\/ui\/dialog["']/,
  /from\s+["']@radix-ui\/react-dialog["']/,
  /import\s*\{[^}]*\bDialog\w*[^}]*\}\s*from\s+["'][^"']*uiCompat["']/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(name) ? [full] : [];
  });
}

const usesRadixDialog = (file: string) => RADIX_DIALOG.some((re) => re.test(readFileSync(file, "utf8")));

describe("Detailing Control Center: no Radix Dialog", () => {
  const files = sourceFiles(ROOT);

  it("scans the whole folder", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.map((f) => relative(ROOT, f))).toContain("fleetHealthStrip.tsx");
  });

  it("imports no Radix dialog outside the allowlist", () => {
    const offenders = files
      .map((file) => relative(ROOT, file))
      .filter((name) => !ALLOWLIST.has(name))
      .filter((name) => usesRadixDialog(join(ROOT, name)));
    expect(offenders).toEqual([]);
  });

  it("keeps the allowlist honest: every entry still needs it", () => {
    for (const name of ALLOWLIST) {
      expect(usesRadixDialog(join(ROOT, name)), `${name} no longer uses Radix Dialog; drop it from the allowlist`).toBe(true);
    }
  });
});
