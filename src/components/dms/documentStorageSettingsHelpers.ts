export function syncStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "success":
      return "Synced";
    case "error":
      return "Error";
    case "pending":
      return "Pending";
    case "unavailable":
      return "Unavailable";
    default:
      return "Never";
  }
}

export function syncStatusColor(status: string | null | undefined): string {
  switch (status) {
    case "success":
      return "var(--success)";
    case "error":
      return "var(--status-error)";
    case "pending":
      return "var(--warning)";
    default:
      return "var(--text-muted)";
  }
}
