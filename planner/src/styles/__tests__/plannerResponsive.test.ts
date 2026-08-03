import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const plannerCss = readFileSync(fileURLToPath(new URL("../planner.css", import.meta.url)), "utf8");

function cssRule(selector: string): string {
  const match = plannerCss.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "s"));
  if (!match) throw new Error(`Missing CSS rule: ${selector}`);
  return match[1];
}

describe("Planner responsive containment", () => {
  it("keeps narrow-width overflow inside the action register scroll wrapper", () => {
    expect(plannerCss).not.toMatch(/body\s*\{[^}]*min-width:/s);
    expect(plannerCss).not.toContain("minmax(44rem, 1fr)");
    expect(cssRule("\\.planner-shell")).not.toMatch(/overflow(?:-x|-y)?:\s*(?:hidden|auto|scroll|clip)/);
    expect(cssRule("\\.planner-main")).toMatch(/min-width:\s*0/);
    expect(cssRule("\\.planner-main")).not.toMatch(/overflow(?:-x|-y)?:\s*(?:hidden|auto|scroll|clip)/);
    expect(cssRule("\\.planner-register__scroll")).toMatch(/max-width:\s*100%/);
    expect(cssRule("\\.planner-register__scroll")).toMatch(/overflow-x:\s*auto/);
    expect(cssRule("\\.planner-topbar")).toMatch(/position:\s*sticky/);
    expect(cssRule("\\.planner-sidebar")).toMatch(/position:\s*sticky/);
  });
});
