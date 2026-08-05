/**
 * SharePoint / OneDrive sync honesty helpers.
 *
 * The connector is not deployed. Linked folders may be saved for setup, but
 * Sync Now must never look like a successful transfer.
 */

/** Patch written when the operator clicks Sync Now while the connector is unavailable. */
export function buildUnavailableSyncStatusPatch() {
  return {
    last_sync_status: "unavailable",
    // Intentionally omit last_sync_at — bumping it made Sync Now look like a real attempt.
  };
}

/** Defaults for creating a linked folder before the connector exists. */
export function buildLinkedFolderSyncDefaults({ syncFrequency = "manual" } = {}) {
  return {
    sync_enabled: false,
    sync_frequency: syncFrequency,
  };
}

export const SYNC_UNAVAILABLE_MESSAGE =
  "SharePoint / OneDrive sync is not connected yet. Folder links are saved for setup, but Sync Now does not transfer files until the connector is deployed.";
