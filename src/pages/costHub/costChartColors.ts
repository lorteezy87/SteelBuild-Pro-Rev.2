import type { getChartTheme } from "@/components/shared/RechartsThemeConfig";

type ChartTheme = ReturnType<typeof getChartTheme>;

/**
 * Stable per-category pie fills using chart theme tokens.
 * Falls back to palette index only for unknown category names.
 */
export function getCategoryPieColor(
  categoryName: string,
  chartTheme: ChartTheme,
  paletteIndex: number,
): string {
  const known: Record<string, string | undefined> = {
    Labor: chartTheme.colors.warning,
    Materials: chartTheme.colors.info,
    Subcontractor: chartTheme.colors.chart4,
    Equipment: chartTheme.colors.primary,
    "Misc.": chartTheme.text.muted,
    Overhead: chartTheme.colors.success,
  };

  const mapped = known[categoryName];
  if (mapped) return mapped;

  return chartTheme.palette[paletteIndex % chartTheme.palette.length];
}
