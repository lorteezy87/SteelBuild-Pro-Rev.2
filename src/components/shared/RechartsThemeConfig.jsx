/**
 * Recharts Theme Configuration
 * Provides color palettes, tooltips, and axis styling that matches the app's CSS variable system
 * for seamless dark/light mode support across all charts
 */

export const getChartTheme = () => {
  // Get colors from computed CSS variables
  const getVar = (name) => {
    if (typeof window === 'undefined') return '#3B82F6'; // Server-side fallback
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };

  return {
    colors: {
      primary: getVar('--accent'),
      success: getVar('--status-success'),
      warning: getVar('--status-warning'),
      error: getVar('--status-error'),
      info: getVar('--status-info'),
      chart1: getVar('--chart-1'),
      chart2: getVar('--chart-2'),
      chart3: getVar('--chart-3'),
      chart4: getVar('--chart-4'),
      chart5: getVar('--chart-5'),
    },
    palette: [
      getVar('--chart-1'),
      getVar('--chart-2'),
      getVar('--chart-3'),
      getVar('--chart-4'),
      getVar('--chart-5'),
      getVar('--accent'),
    ],
    axis: {
      fill: getVar('--text-muted'),
      fontSize: 12,
      fontFamily: "'IBM Plex Mono', monospace",
    },
    tooltip: {
      background: getVar('--bg-elevated'),
      border: `1px solid ${getVar('--border-default')}`,
      borderRadius: 8,
      color: getVar('--text-primary'),
      fontFamily: "'IBM Plex Mono', monospace",
    },
    text: {
      primary: getVar('--text-primary'),
      secondary: getVar('--text-secondary'),
      muted: getVar('--text-muted'),
    },
    background: {
      surface: getVar('--bg-surface'),
      secondary: getVar('--bg-surface-secondary'),
    },
  };
};

export const chartComponentStyles = {
  xAxis: {
    tick: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 },
  },
  yAxis: {
    tick: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 },
  },
  tooltip: {
    contentStyle: {
      background: "var(--bg-elevated)",
      border: "1px solid var(--border-default)",
      borderRadius: 8,
      fontFamily: "'IBM Plex Mono', monospace",
      color: "var(--text-primary)",
    },
  },
};

export default getChartTheme;