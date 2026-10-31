import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { DC_DARK, DC_LIGHT, DC_MASTHEAD, DC_SIGNAL } from "@/pages/documentControl/boardReportTheme";

const css = readFileSync(resolve(process.cwd(), "src/styles/board-report-system.css"), "utf8");
const globalsCss = readFileSync(resolve(process.cwd(), "src/globals.css"), "utf8");

describe("Board Report app-wide design layer", () => {
  it("is imported after every other theme layer", () => {
    const imports = [...globalsCss.matchAll(/@import '([^']+)';/g)].map((m) => m[1]);
    expect(imports[imports.length - 1]).toBe("./styles/board-report-system.css");
  });

  it("uses the Document Control v2 palette for both skins and the masthead", () => {
    for (const value of [DC_LIGHT.pageBg, DC_LIGHT.paneBorder, DC_LIGHT.text, DC_LIGHT.rowHover]) {
      expect(css).toContain(value);
    }
    for (const value of [DC_DARK.pageBg, DC_DARK.paneBg, DC_DARK.paneBorder, DC_DARK.text]) {
      expect(css).toContain(value);
    }
    expect(css).toContain(DC_MASTHEAD.bg);
    expect(css).toContain(DC_SIGNAL.accent);
  });

  it("sets Archivo and IBM Plex Mono as the app fonts", () => {
    expect(css).toMatch(/--font-body:\s+var\(--br-font-ui\)/);
    expect(css).toMatch(/--font-display:\s+var\(--br-font-ui\)/);
    expect(css).toMatch(/--br-font-ui:\s+'Archivo'/);
    expect(css).toMatch(/--br-font-mono:\s+'IBM Plex Mono'/);
    expect(css).not.toContain("Barlow");
  });

  it("keeps --bg-sidebar scoped to the chrome so pages that reuse it stay light", () => {
    const beforeShell = css.slice(0, css.indexOf("── 5. App shell"));
    expect(beforeShell).not.toMatch(/--bg-sidebar:/);
    expect(beforeShell).not.toMatch(/--nav-bg:/);
  });
});

describe("retired type faces stay retired", () => {
  // MarketingLanding is a separately approved marketing design with its own
  // faces; everything else reads the Board Report font tokens.
  const allowed = new Set(["src/styles/marketing-landing.css", "src/components/landing/MarketingLanding.tsx"]);
  const retired = /Barlow|Space Grotesk|JetBrains Mono|['"]Inter['"]/;

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === "__tests__" || name === "node_modules") continue;
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(css|[jt]sx?)$/.test(name)) out.push(full);
    }
    return out;
  }

  it("no app source names Barlow, Space Grotesk, JetBrains Mono or Inter", () => {
    const offenders = walk(resolve(process.cwd(), "src"))
      .map((f) => relative(process.cwd(), f).split(sep).join("/"))
      .filter((f) => !allowed.has(f))
      .filter((f) => retired.test(readFileSync(resolve(process.cwd(), f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("index.html loads only Archivo and IBM Plex Mono", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const families = [...html.matchAll(/family=([A-Za-z+]+)/g)].map((m) => m[1]);
    expect(families).toEqual(["Archivo", "IBM+Plex+Mono"]);
  });
});
