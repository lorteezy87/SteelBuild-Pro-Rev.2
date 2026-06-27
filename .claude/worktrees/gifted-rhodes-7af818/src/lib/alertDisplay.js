export const SEVERITY_COLOR = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-warning)",
  Low: "var(--text-muted)",
};

export function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
