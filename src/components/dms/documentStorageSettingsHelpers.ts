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
