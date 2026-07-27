import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TARGET_DIRS = [
  "src/components/submittals",
  "src/components/rfis",
  "src/pages/submittals",
  "src/pages/rfis",
];

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}|rgba?\(/;

function collectRuntimeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : collectRuntimeFiles(absolutePath);
    }

    return /\.(css|js|jsx|ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

describe("Submittals and RFIs theme token coverage", () => {
  it("keeps runtime panel and modal chrome free of literal color values", () => {
    const offenders = TARGET_DIRS.flatMap((targetDir) => collectRuntimeFiles(path.resolve(targetDir)))
      .flatMap((filePath) => {
        const source = readFileSync(filePath, "utf8");
        return source
          .split("\n")
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => COLOR_LITERAL.test(line))
          .map(({ line, index }) => `${path.relative(process.cwd(), filePath)}:${index + 1}: ${line.trim()}`);
      });

    expect(offenders).toEqual([]);
  });
});
