import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

/**
 * Lightweight feature-flag provider.
 *
 * Sources of truth (highest priority first):
 *   1. URL query string — `?ff_flagName=1` (or `=0`) for ad-hoc toggles
 *      during QA / smoke tests without touching localStorage.
 *   2. localStorage — `sbp-feature-flags` JSON blob, persisted across
 *      reloads, editable from devtools or in-app.
 *   3. DEFAULT_FLAGS — the static fallback baked into the bundle.
 *
 * Consumers pull a flag via `useFeatureFlag('name')` and get a boolean.
 * `setFlag('name', true|false)` writes through to localStorage so the
 * choice sticks on reload.
 *
 * This is deliberately NOT an abstraction layer over Sentry/LaunchDarkly
 * — it's just the hook surface the rest of the app will call. A real
 * remote-config client can be swapped in later without touching callers.
 */

const DEFAULT_FLAGS = Object.freeze({
  // Route-specific viewer options
  modelViewerEdgesOverlay: false,
  drawingViewerPdfjsMode: false,
  // Experimental ideas
  aiDraftingAssistant: false,
  betaGanttLayout: false,
});

const STORAGE_KEY = "sbp-feature-flags";

function readStored() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readQueryString() {
  try {
    if (typeof window === "undefined" || !window.location?.search) return {};
    const out = {};
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of params.entries()) {
      if (!key.startsWith("ff_")) continue;
      const name = key.slice(3);
      out[name] = value !== "0" && value !== "false";
    }
    return out;
  } catch {
    return {};
  }
}

const FeatureFlagContext = createContext({
  flags: DEFAULT_FLAGS,
  setFlag: () => {},
  resetFlags: () => {},
});

export function FeatureFlagProvider({ children, overrides }) {
  const [stored, setStored] = useState(readStored);

  // Merge precedence: defaults → stored → query → prop overrides
  const flags = useMemo(() => ({
    ...DEFAULT_FLAGS,
    ...stored,
    ...readQueryString(),
    ...(overrides || {}),
  }), [stored, overrides]);

  const setFlag = useCallback((name, value) => {
    setStored((prev) => {
      const next = { ...prev, [name]: !!value };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const resetFlags = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setStored({});
  }, []);

  // Keep multiple tabs in sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e) => {
      if (e.key === STORAGE_KEY) setStored(readStored());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const value = useMemo(() => ({ flags, setFlag, resetFlags }), [flags, setFlag, resetFlags]);
  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

export function useFeatureFlags() {
  return useContext(FeatureFlagContext);
}

export function useFeatureFlag(name) {
  const { flags } = useContext(FeatureFlagContext);
  return !!flags?.[name];
}

// Test-only helpers
export const _internals = { DEFAULT_FLAGS, STORAGE_KEY, readStored, readQueryString };
