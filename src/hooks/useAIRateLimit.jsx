import { useCallback, useEffect } from "react";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_CALLS = 30;
const STORAGE_KEY = "sbp_ai_calls";

export { MAX_CALLS };

function getCallLog() {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCallLog(log) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    try {
      const trimmed = log.slice(Math.floor(log.length / 2));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }
}

export function useAIRateLimit() {
  const getRecentCalls = useCallback(() => {
    const now = Date.now();
    return getCallLog().filter((t) => now - t < WINDOW_MS);
  }, []);

  const checkLimit = useCallback(
    () => getRecentCalls().length < MAX_CALLS,
    [getRecentCalls]
  );

  const recordCall = useCallback(() => {
    const recent = getRecentCalls();
    saveCallLog([...recent, Date.now()]);
  }, [getRecentCalls]);

  const remaining = useCallback(
    () => Math.max(0, MAX_CALLS - getRecentCalls().length),
    [getRecentCalls]
  );

  const resetInSeconds = useCallback(() => {
    const recent = getRecentCalls();
    if (recent.length < MAX_CALLS) return 0;
    const oldest = Math.min(...recent);
    return Math.ceil((oldest + WINDOW_MS - Date.now()) / 1000);
  }, [getRecentCalls]);

  const resetLimit = useCallback(() => {
    saveCallLog([]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.__sbpResetAILimit = resetLimit;
    return () => {
      delete window.__sbpResetAILimit;
    };
  }, [resetLimit]);

  return {
    checkLimit,
    recordCall,
    remaining,
    resetInSeconds,
    MAX_CALLS,
  };
}
