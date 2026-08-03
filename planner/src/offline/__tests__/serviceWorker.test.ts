import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const worker = readFileSync(fileURLToPath(new URL("../../../public/sw.js", import.meta.url)), "utf8");

describe("Planner service worker static cache contract", () => {
  it("pre-caches only the known shell files", () => {
    expect(worker).toContain('const SHELL = ["/index.html", "/manifest.webmanifest", "/planner-icon.svg", "/planner-icon-maskable.svg"]');
  });

  it("keeps navigation network-first without storing navigation responses", () => {
    const navigationBranch = worker.split('if (request.mode === "navigate") {')[1]?.split("if (isCacheableStaticAsset")[0] ?? "";
    expect(navigationBranch).toMatch(/fetch\(request\)[\s\S]*caches\.match\("\/index\.html"\)/);
    expect(navigationBranch).not.toContain("cache.put(request");
  });

  it("uses a strict hashed asset matcher instead of caching every assets path", () => {
    expect(worker).toContain("HASHED_ASSET_PATH");
    expect(worker).not.toContain('url.pathname.startsWith("/assets/")');
  });
});
