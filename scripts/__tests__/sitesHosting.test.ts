import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const hostingManifestPath = path.join(repositoryRoot, ".openai", "hosting.json");
const forbiddenKeys = new Set([
  "env",
  "secrets",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectKeys);
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, nestedValue]) => [
    key,
    ...collectKeys(nestedValue),
  ]);
}

describe("Sites hosting contract", () => {
  it("pins the Sites project to the Vite dist artifact", () => {
    expect(fs.existsSync(hostingManifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(hostingManifestPath, "utf8")) as {
      project_id?: unknown;
      static?: { directory?: unknown };
    };

    expect(typeof manifest.project_id).toBe("string");
    expect((manifest.project_id as string).trim().length).toBeGreaterThan(0);
    expect(manifest.static).toEqual({ directory: "dist" });
    expect(collectKeys(manifest).filter((key) => forbiddenKeys.has(key))).toEqual([]);
  });
});
