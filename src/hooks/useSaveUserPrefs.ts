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

type PreferenceMutation = {
  id: number;
  patch: Partial<UserPreferences>;
  previous: Record<string, unknown> | undefined;
  revisions: Record<string, number>;
};

type QueuedPreferenceWrite = Omit<PreferenceMutation, "id"> & {
  timer: ReturnType<typeof setTimeout> | null;
};

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

  const mutation = useMutation({
    mutationFn: ({ patch }: PreferenceMutation) => auth.updateMe(patch),
    scope: { id: `user-preferences-${userId ?? "anonymous"}` },
    onSuccess: (_saved, variables) => {
      for (const key of Object.keys(variables.patch)) {
        if (latestRevisionByKey.current[key] === variables.revisions[key]) failedKeys.current.delete(key);
      }
    },
    onError: (error, variables) => {
      const currentKeys = Object.keys(variables.patch).filter(
        (key) => latestRevisionByKey.current[key] === variables.revisions[key],
      );
      if (currentKeys.length === 0) return;
      currentKeys.forEach((key) => failedKeys.current.add(key));
      if (userId) {
        queryClient.setQueryData<Record<string, unknown>>(["user-settings", userId], (current) => {
          const restored = { ...(current ?? {}) };
          for (const key of currentKeys) {
            if (variables.previous && Object.prototype.hasOwnProperty.call(variables.previous, key)) {
              restored[key] = variables.previous[key];
            } else {
              delete restored[key];
            }
          }
          return restored;
        });
      }
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
    mutation.mutate({ id, patch: queued.patch, previous: queued.previous, revisions: queued.revisions });
  }, [mutation]);

  const persist = useCallback((patch: Partial<UserPreferences>, previous: Record<string, unknown> | undefined, immediate = false) => {
    if (pendingOperations.current === 0 && queuedWrite.current === null) {
      failedKeys.current.clear();
      setLastError(null);
    }
    const revisions = Object.fromEntries(Object.keys(patch).map((key) => {
      const next = (latestRevisionByKey.current[key] ?? 0) + 1;
      latestRevisionByKey.current[key] = next;
      return [key, next];
    }));
    const existing = queuedWrite.current;
    if (existing?.timer) clearTimeout(existing.timer);
    queuedWrite.current = existing
      ? { ...existing, patch: { ...existing.patch, ...patch }, revisions: { ...existing.revisions, ...revisions }, timer: null }
      : { patch, previous, revisions, timer: null };
    setSyncState("saving");
    if (immediate) {
      dispatchQueuedWrite();
    } else if (queuedWrite.current) {
      queuedWrite.current.timer = setTimeout(dispatchQueuedWrite, SAVE_COALESCE_MS);
    }
  }, [dispatchQueuedWrite]);

  const savePatch = useCallback((input: Partial<UserPreferences>) => {
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
    persist(patch, previous);
  }, [authContext?.user, persist, queryClient, userId]);

  const saveAll = useCallback((input: UserPreferences) => {
    const patch = sanitizeUserPreferences(input);
    const previous = userId
      ? queryClient.getQueryData<Record<string, unknown>>(["user-settings", userId])
      : undefined;
    if (userId) queryClient.setQueryData(["user-settings", userId], { ...(previous ?? {}), ...patch });
    persist(patch, previous, true);
  }, [persist, queryClient, userId]);

  const resetKeys = useCallback((keys: Array<keyof UserPreferences>) => {
    const patch = Object.fromEntries(keys.map((key) => [key, DEFAULT_USER_PREFERENCES[key]])) as Partial<UserPreferences>;
    savePatch(patch);
  }, [savePatch]);

  return {
    savePatch,
    saveAll,
    resetKeys,
    isSaving: syncState === "saving",
    lastError,
    syncState,
  };
}
