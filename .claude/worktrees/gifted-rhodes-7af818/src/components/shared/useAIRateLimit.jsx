/**
 * useAIRateLimit.jsx
 * Client-side rate limiter for PMA / AI API calls.
 *
 * Limit: 30 calls per 10-minute rolling window, per browser session.
 * Storage: sessionStorage (cleared automatically on tab close).
 *
 * Emergency admin reset (browser console):
 *   window.__sbpResetAILimit()
 */

import { useCallback } from 'react';

const WINDOW_MS   = 10 * 60 * 1000; // 10 minutes
const MAX_CALLS   = 30;
const STORAGE_KEY = 'sbp_ai_calls';

export { MAX_CALLS };

function getCallLog() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCallLog(log) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // sessionStorage full — drop oldest half and retry
    try {
      const trimmed = log.slice(Math.floor(log.length / 2));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }
}

export function useAIRateLimit() {
  // Returns only calls within the rolling window
  const getRecentCalls = useCallback(() => {
    const now = Date.now();
    return getCallLog().filter(t => now - t < WINDOW_MS);
  }, []);

  // True if user is under the limit
  const checkLimit = useCallback(() => {
    return getRecentCalls().length < MAX_CALLS;
  }, [getRecentCalls]);

  // Call this immediately before every AI request
  const recordCall = useCallback(() => {
    const recent = getRecentCalls();
    saveCallLog([...recent, Date.now()]);
  }, [getRecentCalls]);

  // How many calls remain in this window
  const remaining = useCallback(() => {
    return Math.max(0, MAX_CALLS - getRecentCalls().length);
  }, [getRecentCalls]);

  // Seconds until the oldest call expires (0 if no limit)
  const resetInSeconds = useCallback(() => {
    const recent = getRecentCalls();
    if (recent.length < MAX_CALLS) return 0;
    const oldest = Math.min(...recent);
    return Math.ceil((oldest + WINDOW_MS - Date.now()) / 1000);
  }, [getRecentCalls]);

  // Admin emergency reset — also exposed on window
  const resetLimit = useCallback(() => {
    saveCallLog([]);
  }, []);

  return {
    checkLimit,
    recordCall,
    remaining,
    resetInSeconds,
    MAX_CALLS,
  };
}