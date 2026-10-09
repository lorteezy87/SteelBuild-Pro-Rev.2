import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { resolveFileUrl } from "@/api/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import { getActiveOrgGeneration, subscribeActiveOrgChange } from "@/lib/activeOrg";
import { SIGNED_URL_REUSE_MS } from "@/lib/fileUrlLifetime";

export function useResolvedFileUrl(fileUrl) {
  const auth = useContext(AuthContext);
  const orgGeneration = useSyncExternalStore(subscribeActiveOrgChange, getActiveOrgGeneration, () => 0);
  const ready = auth?.isAuthenticated && auth?.user?.id && !auth?.isLoadingAuth &&
    !auth?.mfaRequired && !auth?.isCheckingMfa && !auth?.mfaStatusDegraded && !auth?.isPasswordRecovery;
  const ownerKey = ready && fileUrl ? `${auth.user.id}:${orgGeneration}:${fileUrl}` : null;
  const [entry, setEntry] = useState(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!ownerKey) { setEntry(null); return; }
    let cancelled = false;
    let timer;
    // Per-mounted-consumer state replaces the unbounded cross-account map.
    // Count lifetime from request START so network latency cannot extend it.
    const expiresAt = Date.now() + SIGNED_URL_REUSE_MS;
    setEntry({ ownerKey, url: null, loading: true, error: null, expiresAt });
    resolveFileUrl(fileUrl)
      .then((resolved) => {
        if (cancelled) return;
        setEntry({ ownerKey, url: resolved || null, loading: false, error: null, expiresAt });
        if (resolved) timer = setTimeout(() => setRefresh(value => value + 1), Math.max(0, expiresAt - Date.now()));
      })
      .catch((error) => {
        if (cancelled) return;
        setEntry({ ownerKey, url: null, loading: false, error, expiresAt });
      });
    const onResume = () => {
      if (Date.now() >= expiresAt) setRefresh(value => value + 1);
    };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [fileUrl, ownerKey, refresh]);

  // Hide stale ownership synchronously on render, before effect cleanup runs.
  const current = ownerKey && entry?.ownerKey === ownerKey ? entry : null;
  return {
    url: current && Date.now() < current.expiresAt ? current.url : null,
    loading: !!ownerKey && (!current || current.loading),
    error: current?.error || null,
  };
}
