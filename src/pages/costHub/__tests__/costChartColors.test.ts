import { describe, expect, it } from "vitest";
import { getCategoryPieColor } from "../costChartColors";

const mockTheme = {
  colors: {
    primary: "var(--accent)",
    success: "var(--status-success)",
    warning: "var(--status-warning)",
    error: "var(--status-error)",
    info: "var(--status-info)",
    review: "var(--status-review)",
    chart1: "var(--chart-1)",
    chart2: "var(--chart-2)",
    chart3: "var(--chart-3)",
    chart4: "var(--chart-4)",
    chart5: "var(--chart-5)",
  },
  palette: ["c0", "c1", "c2"],
  axis: { fill: "var(--text-muted)", fontSize: 9, fontFamily: "mono" },
  tooltip: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontFamily: "mono",
  },
  text: {
    primary: "var(--text-primary)",
    secondary: "var(--text-secondary)",
    muted: "var(--text-muted)",
  },
  background: {
    surface: "var(--bg-surface)",
    secondary: "var(--bg-surface-secondary)",
  },
};

describe("getCategoryPieColor", () => {
  it("maps known cost categories to stable theme tokens", () => {
    expect(getCategoryPieColor("Labor", mockTheme, 0)).toBe("var(--status-warning)");
    expect(getCategoryPieColor("Materials", mockTheme, 0)).toBe("var(--status-info)");
    expect(getCategoryPieColor("Subcontractor", mockTheme, 0)).toBe("var(--chart-4)");
    expect(getCategoryPieColor("Equipment", mockTheme, 0)).toBe("var(--accent)");
    expect(getCategoryPieColor("Misc.", mockTheme, 0)).toBe("var(--text-muted)");
    expect(getCategoryPieColor("Overhead", mockTheme, 0)).toBe("var(--status-success)");
  });

  it("falls back to palette index for unknown categories", () => {
    expect(getCategoryPieColor("Custom", mockTheme, 0)).toBe("c0");
    expect(getCategoryPieColor("Custom", mockTheme, 4)).toBe("c1");
  });
});
