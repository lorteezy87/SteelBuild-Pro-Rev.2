import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useOrg } from "@/components/shared/OrgContext";
import { useAuth } from "@/lib/AuthContext";
import { queryClientInstance } from "@/lib/query-client";
import ConnectivityBanner from "@planner/components/feedback/ConnectivityBanner";
import { enqueuePlannerOutboxOperation, executePlannerOutboxOperation, loadPlannerOutbox, removePlannerOutboxOperation, replayPlannerOutbox, type PlannerOutboxOperation } from "./plannerOutbox";
import { clearPlannerTenantState, loadPlannerSnapshot, savePlannerSnapshot, type PlannerOfflineScope, type PlannerSnapshot, type PlannerSnapshotRow } from "./plannerSnapshots";

type PlannerOfflineContextValue = {
  online: boolean;
  pendingCount: number;
  hasCachedData: boolean;
  markConnectionVerified: () => void;
  saveSnapshot: (key: string, rows: readonly PlannerSnapshotRow[], syncedAt?: string) => Promise<void>;
  loadSnapshot: (key: string) => Promise<PlannerSnapshot | null>;
  queueOperation: (operation: PlannerOutboxOperation) => Promise<void>;
  syncNow: () => Promise<void>;
};
type PlannerOfflineProviderProps = { children: ReactNode };
type PlannerOrganization = { id: string } | null;
type ReplayOperation = (operation: PlannerOutboxOperation) => Promise<void>;

const unavailableOfflineContext: PlannerOfflineContextValue = {
  online: true,
  pendingCount: 0,
  hasCachedData: false,
  markConnectionVerified: () => undefined,
  saveSnapshot: async () => undefined,
  loadSnapshot: async () => null,
  queueOperation: async () => { throw new Error("Planner offline state is unavailable outside the Planner application shell."); },
  syncNow: async () => undefined,
};

const PlannerOfflineContext = createContext<PlannerOfflineContextValue>(unavailableOfflineContext);
const scopeFlights = new Map<string, Promise<void>>();
const mountedScopeCounts = new Map<string, number>();

function scopeFrom(userId: string | undefined, organization: PlannerOrganization): PlannerOfflineScope | null {
  return userId?.trim() && organization?.id?.trim() ? { userId, organizationId: organization.id } : null;
}

function isOnline(): boolean { return typeof navigator === "undefined" || navigator.onLine !== false; }

function isPlannerQuery(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === "string" && queryKey[0].startsWith("planner-");
}

function scopeKey(scope: PlannerOfflineScope): string { return `${scope.userId}:${scope.organizationId}`; }

/** Tenant-scoped snapshot/outbox lifecycle. It exposes no credential persistence and never expands the offline write allow-list. */
export default function PlannerOfflineProvider({ children }: PlannerOfflineProviderProps) {
  const { user } = useAuth();
  const { currentOrg } = useOrg() as { currentOrg: PlannerOrganization };
  const [online, setOnline] = useState(isOnline);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [hasCachedData, setHasCachedData] = useState(false);
  const [connectionVerified, setConnectionVerified] = useState(false);
  const scope = useMemo(() => scopeFrom(user?.id, currentOrg), [currentOrg?.id, user?.id]);
  const replayRef = useRef<ReplayOperation>(executePlannerOutboxOperation);
  const scopeRef = useRef<PlannerOfflineScope | null>(scope);
  const generationRef = useRef(0);

  scopeRef.current = scope;

  const refreshPending = useCallback(async (currentScope: PlannerOfflineScope | null, generation = generationRef.current) => {
    const count = currentScope ? (await loadPlannerOutbox(currentScope)).length : 0;
    if (generation === generationRef.current && scopeRef.current === currentScope) setPendingCount(count);
  }, []);

  const syncNow = useCallback(async () => {
    if (!scope || !isOnline()) return;
    const activeScope = scope;
    const activeKey = scopeKey(activeScope);
    const activeGeneration = generationRef.current;
    const existingFlight = scopeFlights.get(activeKey);
    if (existingFlight) return existingFlight;
    const isCurrent = () => generationRef.current === activeGeneration && scopeRef.current === activeScope;
    const sync = (async () => {
      if (isCurrent()) { setIsSyncing(true); setSyncError(null); }
      try {
        const operations = await loadPlannerOutbox(activeScope);
        const result = await replayPlannerOutbox(operations, replayRef.current);
        for (const id of result.synced) await removePlannerOutboxOperation(activeScope, id);
        await refreshPending(activeScope, activeGeneration);
        if (!isCurrent()) return;
        if (result.state !== "complete") setSyncError(result.error instanceof Error ? result.error.message : "A queued change needs attention before sync can continue.");
        else if (result.synced.length > 0) setConnectionVerified(true);
      } catch (error) {
        if (isCurrent()) setSyncError(error instanceof Error ? error.message : "Planner sync failed before queued changes could be verified.");
      } finally {
        if (isCurrent()) setIsSyncing(false);
        if (scopeFlights.get(activeKey) === sync) scopeFlights.delete(activeKey);
      }
    })();
    scopeFlights.set(activeKey, sync);
    return sync;
  }, [refreshPending, scope]);

  useEffect(() => {
    let active = true;
    const activeScope = scope;
    const activeKey = activeScope ? scopeKey(activeScope) : null;
    const activeGeneration = generationRef.current + 1;
    generationRef.current = activeGeneration;
    if (activeKey) mountedScopeCounts.set(activeKey, (mountedScopeCounts.get(activeKey) ?? 0) + 1);
    setPendingCount(0);
    setIsSyncing(false);
    setSyncError(null);
    setLastSyncedAt(null);
    setHasCachedData(false);
    setConnectionVerified(false);
    const prepareScope = async () => {
      const operations = activeScope ? await loadPlannerOutbox(activeScope) : [];
      if (!active || generationRef.current !== activeGeneration || scopeRef.current !== activeScope) return;
      setPendingCount(operations.length);
      if (isOnline() && operations.length > 0) void syncNow();
    };
    void prepareScope();
    return () => {
      active = false;
      if (!activeScope || !activeKey) return;
      mountedScopeCounts.set(activeKey, Math.max(0, (mountedScopeCounts.get(activeKey) ?? 1) - 1));
      queueMicrotask(() => {
        if ((mountedScopeCounts.get(activeKey) ?? 0) !== 0) return;
        mountedScopeCounts.delete(activeKey);
        queryClientInstance.removeQueries({ predicate: (query) => isPlannerQuery(query.queryKey) });
        void clearPlannerTenantState(activeScope.userId, activeScope.organizationId);
      });
    };
  }, [scope, syncNow]);

  useEffect(() => {
    const goOnline = () => { setOnline(true); setConnectionVerified(false); void syncNow(); };
    const goOffline = () => { setOnline(false); setConnectionVerified(false); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, [syncNow]);

  const value = useMemo<PlannerOfflineContextValue>(() => ({
    online,
    pendingCount,
    hasCachedData,
    markConnectionVerified: () => setConnectionVerified(true),
    saveSnapshot: async (key, rows, syncedAt = new Date().toISOString()) => {
      if (!scope) return;
      await savePlannerSnapshot(scope, key, rows, syncedAt);
      setLastSyncedAt(syncedAt);
      setHasCachedData(true);
    },
    loadSnapshot: async (key) => {
      if (!scope) return null;
      const snapshot = await loadPlannerSnapshot(scope, key);
      if (snapshot) { setLastSyncedAt(snapshot.syncedAt); setHasCachedData(true); }
      return snapshot;
    },
    queueOperation: async (operation) => {
      if (!scope) throw new Error("An authenticated Planner organization is required for offline changes.");
      await enqueuePlannerOutboxOperation(scope, operation);
      await refreshPending(scope);
    },
    syncNow,
  }), [hasCachedData, online, pendingCount, refreshPending, scope, syncNow]);

  return <PlannerOfflineContext.Provider value={value}>{children}<ConnectivityBanner online={online} connectionVerified={connectionVerified} hasCachedData={hasCachedData} pendingCount={pendingCount} isSyncing={isSyncing} syncError={syncError} lastSyncedAt={lastSyncedAt} /></PlannerOfflineContext.Provider>;
}

export function usePlannerOffline(): PlannerOfflineContextValue {
  return useContext(PlannerOfflineContext);
}
