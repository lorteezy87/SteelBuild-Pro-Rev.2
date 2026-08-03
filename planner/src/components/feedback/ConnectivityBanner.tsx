type ConnectivityBannerProps = { online: boolean; connectionVerified?: boolean; hasCachedData?: boolean; pendingCount: number; isSyncing?: boolean; syncError?: string | null; lastSyncedAt?: string | null };

function lastSyncedLabel(value: string | null | undefined): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return `Last synced ${new Date(value).toLocaleString()}`;
}

export default function ConnectivityBanner({ online, connectionVerified = false, hasCachedData = false, pendingCount, isSyncing = false, syncError = null, lastSyncedAt = null }: ConnectivityBannerProps) {
  const syncTime = lastSyncedLabel(lastSyncedAt);
  const changes = `${pendingCount} change${pendingCount === 1 ? "" : "s"}`;
  if (syncError) return <aside className="planner-connectivity-banner planner-connectivity-banner--error" role="alert">Sync failed: {syncError}</aside>;
  const label = isSyncing ? `Syncing ${changes}` : online ? (connectionVerified ? "Online" : "Connection available—verifying") : (hasCachedData ? "Offline—cached data" : "Offline—no cached data");
  return <aside className="planner-connectivity-banner" role="status" aria-live="polite"><strong>{label}</strong>{syncTime && <span>{syncTime}</span>}</aside>;
}
