import { useCallback, useContext, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { auth } from "@/api/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import {
  DEFAULT_USER_PREFERENCES,
  sanitizeUserPreferences,
  type UserPreferences,
} from "@/lib/userPreferences/schema";

export type PreferenceSyncState = "idle" | "saving" | "saved" | "error";

export function useSaveUserPrefs() {
  const authContext = useContext(AuthContext);
  const userId = authContext?.user?.id;
  const queryClient = useQueryClient();
  const [syncState, setSyncState] = useState<PreferenceSyncState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ patch }: { patch: Partial<UserPreferences>; previous: Record<string, unknown> | undefined }) => auth.updateMe(patch),
    onMutate: () => {
      setSyncState("saving");
      setLastError(null);
    },
    onSuccess: (saved) => {
      if (userId) {
        queryClient.setQueryData<Record<string, unknown>>(
          ["user-settings", userId],
          (current) => ({ ...(current ?? {}), ...saved }),
        );
      }
      setSyncState("saved");
    },
    onError: (error, variables) => {
      if (userId && variables.previous !== undefined) {
        queryClient.setQueryData(["user-settings", userId], variables.previous);
      }
      const message = error instanceof Error ? error.message : "Could not save settings";
      setLastError(message);
      setSyncState("error");
      toast.error("Could not save settings. Your previous choices were restored.");
    },
  });

  const savePatch = useCallback((input: Partial<UserPreferences>) => {
    const current = queryClient.getQueryData<Record<string, unknown>>(["user-settings", userId]) ?? authContext?.user ?? {};
    const manualEdit = input.workspace_preset === undefined &&
      Object.keys(input).some((key) => key !== "preferences_version");
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
    mutation.mutate({ patch, previous });
  }, [authContext?.user, mutation, queryClient, userId]);

  const saveAll = useCallback((input: UserPreferences) => {
    const patch = sanitizeUserPreferences(input);
    const previous = userId
      ? queryClient.getQueryData<Record<string, unknown>>(["user-settings", userId])
      : undefined;
    if (userId) queryClient.setQueryData(["user-settings", userId], { ...(previous ?? {}), ...patch });
    mutation.mutate({ patch, previous });
  }, [mutation, queryClient, userId]);

  const resetKeys = useCallback((keys: Array<keyof UserPreferences>) => {
    const patch = Object.fromEntries(keys.map((key) => [key, DEFAULT_USER_PREFERENCES[key]])) as Partial<UserPreferences>;
    savePatch(patch);
  }, [savePatch]);

  return {
    savePatch,
    saveAll,
    resetKeys,
    isSaving: mutation.isPending,
    lastError,
    syncState,
  };
}
