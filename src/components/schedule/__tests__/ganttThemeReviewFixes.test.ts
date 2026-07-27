import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readRepoFile(...parts: string[]) {
  return readFileSync(path.join(repoRoot, ...parts), "utf8");
}

function cssBlock(source: string, selector: string) {
  const start = source.lastIndexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);

  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`Unclosed CSS block for ${selector}`);
}

const GANTT_CUSTOM_PROPERTIES = [
  "--sbd-gantt-bg",
  "--sbd-gantt-panel",
  "--sbd-gantt-panel-strong",
  "--sbd-gantt-header",
  "--sbd-gantt-left",
  "--sbd-gantt-row",
  "--sbd-gantt-row-alt",
  "--sbd-gantt-row-hover",
  "--sbd-gantt-grid",
  "--sbd-gantt-grid-strong",
  "--sbd-gantt-weekend",
  "--sbd-gantt-today",
  "--sbd-gantt-today-soft",
  "--sbd-gantt-preconstruction",
  "--sbd-gantt-detailing",
  "--sbd-gantt-procurement",
  "--sbd-gantt-fabrication",
  "--sbd-gantt-delivery",
  "--sbd-gantt-installation",
  "--sbd-gantt-closeout",
];

describe("dual-theme Gantt review fixes", () => {
  it("defines the Gantt custom properties directly on the light data-theme block", () => {
    const tokens = readRepoFile("src", "styles", "tokens.css");
    const lightBlock = cssBlock(tokens, "[data-theme=\"light\"]");

    for (const property of GANTT_CUSTOM_PROPERTIES) {
      expect(lightBlock).toContain(`${property}:`);
    }
    expect(lightBlock).not.toMatch(/--sbd-gantt-(bg|panel|panel-strong|header|left|row):\s*#0[0-9A-Fa-f]{5}/);
  });

  it("keeps the steelbuild-light class carrying the same Gantt property names", () => {
    const steelbuildLight = readRepoFile("src", "styles", "steelbuild-light.css");
    const lightClassBlock = cssBlock(steelbuildLight, ".steelbuild-light");

    for (const property of GANTT_CUSTOM_PROPERTIES) {
      expect(lightClassBlock).toContain(`${property}:`);
    }
  });

  it("uses theme variables for ScheduleGantt delivery and critical-row chrome", () => {
    const scheduleGantt = readRepoFile("src", "components", "schedule", "ScheduleGantt.jsx");

    expect(scheduleGantt).not.toContain("GANTT_PHASE_HEX");
    expect(scheduleGantt).toContain("GANTT_PHASE_VAR");
    expect(scheduleGantt).toContain("color-mix(in srgb, ${GANTT_PHASE_VAR.Delivery}");
    expect(scheduleGantt).toContain("color-mix(in srgb, ${GANTT_PHASE_VAR.Procurement}");
  });

  it("does not use the black keyword in Rivet or Gantt color-mix expressions", () => {
    const sources = [
      readRepoFile("src", "components", "schedule", "rivetBriefStyles.js"),
      readRepoFile("src", "components", "schedule", "scheduleGanttBars.jsx"),
    ];

    for (const source of sources) {
      expect(source).not.toMatch(/color-mix\([^)]*\bblack\b/);
    }
  });
});
