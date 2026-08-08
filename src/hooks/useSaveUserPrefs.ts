import { useCallback, useContext, useRef, useState } from "react";
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

const SAVE_COALESCE_MS = 80;

export function useSaveUserPrefs() {
  const authContext = useContext(AuthContext);
  const userId = authContext?.user?.id;
  const queryClient = useQueryClient();
  const [syncState, setSyncState] = useState<PreferenceSyncState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const nextOperationId = useRef(0);
  const latestRevisionByKey = useRef<Record<string, number>>({});
  const pendingOperations = useRef(0);
  const failedKeys = useRef(new Set<string>());
  const queuedWrite = useRef<QueuedPreferenceWrite | null>(null);
  const confirmedByKey = useRef<Record<string, ConfirmedPreference>>({});
  const supersededResolvers = useRef<Array<(result: PreferenceSaveResult) => void>>([]);

  const mutation = useMutation({
    mutationFn: ({ patch }: PreferenceMutation) => auth.updateMe(patch),
    scope: { id: `user-preferences-${userId ?? "anonymous"}` },
    onSuccess: (_saved, variables) => {
      for (const key of Object.keys(variables.patch)) {
        confirmedByKey.current[key] = { present: true, value: variables.patch[key as keyof UserPreferences] };
        if (latestRevisionByKey.current[key] === variables.revisions[key]) failedKeys.current.delete(key);
      }
      const resolvers = [...supersededResolvers.current, ...variables.resolve];
      supersededResolvers.current = [];
      resolvers.forEach((resolve) => resolve({ status: "persisted" }));
    },
    onError: (error, variables) => {
      const currentKeys = Object.keys(variables.patch).filter(
        (key) => latestRevisionByKey.current[key] === variables.revisions[key],
      );
      if (currentKeys.length === 0) {
        // The request was replaced by a newer write for the same keys. Its
        // callers must follow that successor's actual outcome: migration
        // cleanup, in particular, is safe only if the authoritative successor
        // reaches the server.
        supersededResolvers.current.push(...variables.resolve);
        return;
      }
      currentKeys.forEach((key) => failedKeys.current.add(key));
      const confirmed = {} as Partial<UserPreferences>;
      if (userId) {
        queryClient.setQueryData<Record<string, unknown>>(["user-settings", userId], (current) => {
          const restored = { ...(current ?? {}) };
          for (const key of currentKeys) {
            const snapshot = confirmedByKey.current[key];
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
      const resolvers = [...supersededResolvers.current, ...variables.resolve];
      supersededResolvers.current = [];
      resolvers.forEach((resolve) => resolve({ status: "failed", confirmed }));
      const message = error instanceof Error ? error.message : "Could not save settings";
      setLastError(message);
      toast.error("Could not save settings. Your previous choices were restored.");
    },
    onSettled: () => {
      pendingOperations.current = Math.max(0, pendingOperations.current - 1);
      if (pendingOperations.current === 0 && queuedWrite.current === null) {
        setSyncState(failedKeys.current.size > 0 ? "error" : "saved");
      }
    },
  });

  const dispatchQueuedWrite = useCallback(() => {
    const queued = queuedWrite.current;
    if (!queued) return;
    if (queued.timer) clearTimeout(queued.timer);
    queuedWrite.current = null;
    const id = ++nextOperationId.current;
    pendingOperations.current += 1;
    mutation.mutate({ id, patch: queued.patch, revisions: queued.revisions, resolve: queued.resolve });
  }, [mutation]);

  const persist = useCallback((patch: Partial<UserPreferences>, previous: Record<string, unknown> | undefined, immediate = false): Promise<PreferenceSaveResult> =>
    new Promise((resolve) => {
      if (pendingOperations.current === 0 && queuedWrite.current === null) {
        failedKeys.current.clear();
        confirmedByKey.current = {};
        setLastError(null);
      }
      for (const key of Object.keys(patch)) {
        if (Object.prototype.hasOwnProperty.call(confirmedByKey.current, key)) continue;
        confirmedByKey.current[key] = {
          present: !!previous && Object.prototype.hasOwnProperty.call(previous, key),
          value: previous?.[key],
        };
      }
      const revisions = Object.fromEntries(Object.keys(patch).map((key) => {
        const next = (latestRevisionByKey.current[key] ?? 0) + 1;
        latestRevisionByKey.current[key] = next;
        return [key, next];
      }));
      const existing = queuedWrite.current;
      if (existing?.timer) clearTimeout(existing.timer);
      queuedWrite.current = existing
        ? { ...existing, patch: { ...existing.patch, ...patch }, revisions: { ...existing.revisions, ...revisions }, resolve: [...existing.resolve, resolve], timer: null }
        : { patch, revisions, resolve: [resolve], timer: null };
      setSyncState("saving");
      if (immediate) {
        dispatchQueuedWrite();
      } else if (queuedWrite.current) {
        queuedWrite.current.timer = setTimeout(dispatchQueuedWrite, SAVE_COALESCE_MS);
      }
    }), [dispatchQueuedWrite]);

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
    isSaving: syncState === "saving",
    lastError,
    syncState,
  };
}
