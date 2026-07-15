export const FAB_RELEASE_WP_RECORD_TYPE = "wp_number";

export function canStartFabPackageCreation({
  projectId,
  allocationInFlight,
  modalOpen,
  editing,
}: {
  projectId?: string | null;
  allocationInFlight: boolean;
  modalOpen: boolean;
  editing: unknown;
}) {
  return Boolean(projectId && !allocationInFlight && !modalOpen && !editing);
}

export async function reserveFabReleaseNumber(
  projectId: string,
  allocate: (projectId: string, recordType: string) => Promise<number | string>,
) {
  if (!projectId) throw new Error("projectId is required");
  const next = await allocate(projectId, FAB_RELEASE_WP_RECORD_TYPE);
  return `WP-${String(next).padStart(3, "0")}`;
}
