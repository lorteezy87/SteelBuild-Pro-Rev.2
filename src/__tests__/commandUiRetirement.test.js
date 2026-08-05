import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

defineTestSuite();

function defineTestSuite() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.resolve(here, "..");
  const retiredFlag = ["command", "ui"].join("_");
  const retiredCamel = ["command", "Ui"].join("");
  const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

  function collect(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") return [];
        return collect(absolute);
      }
      if (!extensions.has(path.extname(entry.name))) return [];
      if (/\.test\.[^.]+$/.test(entry.name)) return [];
      return [absolute];
    });
  }

  const readRuntimeSource = () => collect(srcRoot)
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  it("removes the retired presentation flag from runtime code", () => {
    const source = readRuntimeSource();
    expect(source).not.toContain(retiredFlag);
    expect(source).not.toContain(retiredCamel);
    expect(source).not.toContain(`useFlag("${retiredFlag}")`);
  });
}
