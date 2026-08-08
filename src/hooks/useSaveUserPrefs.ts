import { useCallback, useContext, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { auth } from "@/api/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import {
  DEFAULT_USER_PREFERENCES,
  sanitizeUserPreferences,
  type UserPreferences,
} from "@/lib/userPreferences/schema";
import { PRESET_OWNED_KEYS } from "@/lib/userPreferences/presets";

export type PreferenceSyncState = "idle" | "saving" | "saved" | "error";
export type PreferenceSaveResult =
  | { status: "persisted" }
  | { status: "superseded" }
  | { status: "failed"; confirmed: Partial<UserPreferences> };

type PreferenceMutation = {
  id: number;
  patch: Partial<UserPreferences>;
  revisions: Record<string, number>;
  resolve: Array<(result: PreferenceSaveResult) => void>;
};

type QueuedPreferenceWrite = Omit<PreferenceMutation, "id"> & {
  timer: ReturnType<typeof setTimeout> | null;
};

type ConfirmedPreference = { present: boolean; value: unknown };

type PreferenceCoordinator = {
  nextOperationId: number;
  latestRevisionByKey: Record<string, number>;
  pendingOperations: number;
  failedKeys: Set<string>;
  queuedWrite: QueuedPreferenceWrite | null;
  confirmedByKey: Record<string, ConfirmedPreference>;
  supersededResolvers: Array<(result: PreferenceSaveResult) => void>;
  syncState: PreferenceSyncState;
  lastError: string | null;
  listeners: Set<() => void>;
};

const SAVE_COALESCE_MS = 80;
const preferenceCoordinators = new Map<string, PreferenceCoordinator>();

function getPreferenceCoordinator(userId: string | undefined): PreferenceCoordinator {
  const key = userId ?? "anonymous";
  const existing = preferenceCoordinators.get(key);
  if (existing) return existing;
  const created: PreferenceCoordinator = {
    nextOperationId: 0,
    latestRevisionByKey: {},
    pendingOperations: 0,
    failedKeys: new Set<string>(),
    queuedWrite: null,
    confirmedByKey: {},
    supersededResolvers: [],
    syncState: "idle",
    lastError: null,
    listeners: new Set(),
  };
  preferenceCoordinators.set(key, created);
  return created;
}

function notifyCoordinator(coordinator: PreferenceCoordinator): void {
  coordinator.listeners.forEach((listener) => listener());
}

export function useSaveUserPrefs() {
  const authContext = useContext(AuthContext);
  const userId = authContext?.user?.id;
  const queryClient = useQueryClient();
  const coordinator = getPreferenceCoordinator(userId);
  const [, rerenderFromCoordinator] = useState(0);

  useEffect(() => {
    const listener = () => rerenderFromCoordinator((version) => version + 1);
    coordinator.listeners.add(listener);
    return () => { coordinator.listeners.delete(listener); };
  }, [coordinator]);

  const mutation = useMutation({
    mutationFn: ({ patch }: PreferenceMutation) => auth.updateMe(patch),
    scope: { id: `user-preferences-${userId ?? "anonymous"}` },
    onSuccess: (_saved, variables) => {
      for (const key of Object.keys(variables.patch)) {
        coordinator.confirmedByKey[key] = { present: true, value: variables.patch[key as keyof UserPreferences] };
        if (coordinator.latestRevisionByKey[key] === variables.revisions[key]) coordinator.failedKeys.delete(key);
      }
      const resolvers = [...coordinator.supersededResolvers, ...variables.resolve];
      coordinator.supersededResolvers = [];
      resolvers.forEach((resolve) => resolve({ status: "persisted" }));
    },
    onError: (error, variables) => {
      const currentKeys = Object.keys(variables.patch).filter(
        (key) => coordinator.latestRevisionByKey[key] === variables.revisions[key],
      );
      if (currentKeys.length === 0) {
        // The request was replaced by a newer write for the same keys. Its
        // callers must follow that successor's actual outcome: migration
        // cleanup, in particular, is safe only if the authoritative successor
        // reaches the server.
        coordinator.supersededResolvers.push(...variables.resolve);
        return;
      }
      currentKeys.forEach((key) => coordinator.failedKeys.add(key));
      const confirmed = {} as Partial<UserPreferences>;
      if (userId) {
        queryClient.setQueryData<Record<string, unknown>>(["user-settings", userId], (current) => {
          const restored = { ...(current ?? {}) };
          for (const key of currentKeys) {
            const snapshot = coordinator.confirmedByKey[key];
            if (snapshot?.present) {
              restored[key] = snapshot.value;
              confirmed[key as keyof UserPreferences] = snapshot.value as never;
            } else {
              delete restored[key];
            }
          }
          return restored;
        });
      }
      const resolvers = [...coordinator.supersededResolvers, ...variables.resolve];
      coordinator.supersededResolvers = [];
      resolvers.forEach((resolve) => resolve({ status: "failed", confirmed }));
      const message = error instanceof Error ? error.message : "Could not save settings";
      coordinator.lastError = message;
      notifyCoordinator(coordinator);
      toast.error("Could not save settings. Your previous choices were restored.");
    },
    onSettled: () => {
      coordinator.pendingOperations = Math.max(0, coordinator.pendingOperations - 1);
      if (coordinator.pendingOperations === 0 && coordinator.queuedWrite === null) {
        coordinator.syncState = coordinator.failedKeys.size > 0 ? "error" : "saved";
        notifyCoordinator(coordinator);
      }
    },
  });

  const dispatchQueuedWrite = useCallback(() => {
    const queued = coordinator.queuedWrite;
    if (!queued) return;
    if (queued.timer) clearTimeout(queued.timer);
    coordinator.queuedWrite = null;
    const id = ++coordinator.nextOperationId;
    coordinator.pendingOperations += 1;
    mutation.mutate({ id, patch: queued.patch, revisions: queued.revisions, resolve: queued.resolve });
  }, [coordinator, mutation]);

  const persist = useCallback((patch: Partial<UserPreferences>, previous: Record<string, unknown> | undefined, immediate = false): Promise<PreferenceSaveResult> =>
    new Promise((resolve) => {
      if (coordinator.pendingOperations === 0 && coordinator.queuedWrite === null) {
        coordinator.failedKeys.clear();
        coordinator.confirmedByKey = {};
        coordinator.lastError = null;
      }
      for (const key of Object.keys(patch)) {
        if (Object.prototype.hasOwnProperty.call(coordinator.confirmedByKey, key)) continue;
        coordinator.confirmedByKey[key] = {
          present: !!previous && Object.prototype.hasOwnProperty.call(previous, key),
          value: previous?.[key],
        };
      }
      const revisions = Object.fromEntries(Object.keys(patch).map((key) => {
        const next = (coordinator.latestRevisionByKey[key] ?? 0) + 1;
        coordinator.latestRevisionByKey[key] = next;
        return [key, next];
      }));
      const existing = coordinator.queuedWrite;
      if (existing?.timer) clearTimeout(existing.timer);
      coordinator.queuedWrite = existing
        ? { ...existing, patch: { ...existing.patch, ...patch }, revisions: { ...existing.revisions, ...revisions }, resolve: [...existing.resolve, resolve], timer: null }
        : { patch, revisions, resolve: [resolve], timer: null };
      coordinator.syncState = "saving";
      notifyCoordinator(coordinator);
      if (immediate) {
        dispatchQueuedWrite();
      } else if (coordinator.queuedWrite) {
        coordinator.queuedWrite.timer = setTimeout(dispatchQueuedWrite, SAVE_COALESCE_MS);
      }
    }), [coordinator, dispatchQueuedWrite]);

  const savePatchConfirmed = useCallback((input: Partial<UserPreferences>) => {
    const current = queryClient.getQueryData<Record<string, unknown>>(["user-settings", userId]) ?? authContext?.user ?? {};
    const manualEdit = input.workspace_preset === undefined &&
      Object.keys(input).some((key) => PRESET_OWNED_KEYS.has(key as keyof UserPreferences));
    const sanitized = sanitizeUserPreferences({
      ...current,
      ...input,
      ...(manualEdit ? { workspace_preset: "custom" } : {}),
    });
    const patch = Object.fromEntries(
      [...Object.keys(input), ...(manualEdit ? ["workspace_preset"] : [])]
        .map((key) => [key, sanitized[key as keyof UserPreferences]]),
    ) as Partial<UserPreferences>;
    const previous = userId
      ? queryClient.getQueryData<Record<string, unknown>>(["user-settings", userId])
      : undefined;
    if (userId) {
      void queryClient.cancelQueries({ queryKey: ["user-settings", userId] });
      queryClient.setQueryData(["user-settings", userId], { ...(previous ?? {}), ...patch });
    }
    return persist(patch, previous);
  }, [authContext?.user, persist, queryClient, userId]);

  const savePatch = useCallback((input: Partial<UserPreferences>) => {
    void savePatchConfirmed(input);
  }, [savePatchConfirmed]);

  const saveAll = useCallback((input: UserPreferences) => {
    const patch = sanitizeUserPreferences(input);
    const previous = userId
      ? queryClient.getQueryData<Record<string, unknown>>(["user-settings", userId])
      : undefined;
    if (userId) queryClient.setQueryData(["user-settings", userId], { ...(previous ?? {}), ...patch });
    void persist(patch, previous, true);
  }, [persist, queryClient, userId]);

  const resetKeys = useCallback((keys: Array<keyof UserPreferences>) => {
    const patch = Object.fromEntries(keys.map((key) => [key, DEFAULT_USER_PREFERENCES[key]])) as Partial<UserPreferences>;
    savePatch(patch);
  }, [savePatch]);

  return {
    savePatch,
    savePatchConfirmed,
    saveAll,
    resetKeys,
    isSaving: coordinator.syncState === "saving",
    lastError: coordinator.lastError,
    syncState: coordinator.syncState,
  };
}
