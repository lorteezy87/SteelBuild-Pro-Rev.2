/**
 * Recharts Theme Configuration
 * Provides color palettes, tooltips, and axis styling that matches the app's CSS variable system
 * for seamless dark/light mode support across all charts
 */

export const getChartTheme = () => {
  // Get colors from computed CSS variables
  const getVar = (name, fallback = 'var(--accent)') => {
    if (typeof window === 'undefined') return fallback; // Server-side fallback
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  };

  return {
    colors: {
      primary: getVar('--accent'),
      success: getVar('--status-success', 'var(--status-success)'),
      warning: getVar('--status-warning', 'var(--status-warning)'),
      error: getVar('--status-error', 'var(--status-error)'),
      info: getVar('--status-info', 'var(--status-info)'),
      review: getVar('--status-review', 'var(--status-review)'),
      chart1: getVar('--chart-1', 'var(--accent)'),
      chart2: getVar('--chart-2', 'var(--status-info)'),
      chart3: getVar('--chart-3', 'var(--status-success)'),
      chart4: getVar('--chart-4', 'var(--status-warning)'),
      chart5: getVar('--chart-5', 'var(--status-review)'),
    },
    palette: [
      getVar('--chart-1', 'var(--accent)'),
      getVar('--chart-2', 'var(--status-info)'),
      getVar('--chart-3', 'var(--status-success)'),
      getVar('--chart-4', 'var(--status-warning)'),
      getVar('--chart-5', 'var(--status-review)'),
      getVar('--accent'),
    ],
    axis: {
      fill: getVar('--text-muted', 'var(--text-muted)'),
      fontSize: 12,
      fontFamily: "'IBM Plex Mono', monospace",
    },
    tooltip: {
      background: getVar('--bg-elevated', 'var(--bg-elevated)'),
      border: `1px solid ${getVar('--border-default', 'var(--border-default)')}`,
      borderRadius: 8,
      color: getVar('--text-primary', 'var(--text-primary)'),
      fontFamily: "'IBM Plex Mono', monospace",
    },
    text: {
      primary: getVar('--text-primary', 'var(--text-primary)'),
      secondary: getVar('--text-secondary', 'var(--text-secondary)'),
      muted: getVar('--text-muted', 'var(--text-muted)'),
    },
    background: {
      surface: getVar('--bg-surface', 'var(--bg-surface)'),
      secondary: getVar('--bg-surface-secondary', 'var(--bg-surface-secondary)'),
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