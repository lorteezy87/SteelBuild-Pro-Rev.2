import {
  PREFERENCES_VERSION,
  sanitizeUserPreferences,
  USER_PREFERENCE_KEYS,
  type UserPreferences,
} from "./schema";

type ParseResult =
  | { ok: true; preferences: UserPreferences }
  | { ok: false; error: string };

export function serializeUserPreferences(preferences: UserPreferences): string {
  return JSON.stringify({
    product: "SteelBuild Pro",
    version: PREFERENCES_VERSION,
    exported_at: new Date().toISOString(),
    preferences: sanitizeUserPreferences(preferences),
  }, null, 2);
}

export function parseUserPreferencesExport(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "The selected file is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "The selected file does not contain SteelBuild settings." };
  }
  const record = parsed as Record<string, unknown>;
  if (record.version !== PREFERENCES_VERSION) {
    return { ok: false, error: "This settings file uses an unsupported version." };
  }
  if (!record.preferences || typeof record.preferences !== "object") {
    return { ok: false, error: "The selected file does not contain SteelBuild settings." };
  }
  const rawPreferences = record.preferences as Record<string, unknown>;
  const allowedKeys = new Set<string>(USER_PREFERENCE_KEYS);
  const unsupported = Object.keys(rawPreferences).filter((key) => !allowedKeys.has(key)).sort();
  if (unsupported.length > 0) {
    return { ok: false, error: `The settings file contains unsupported fields: ${unsupported.join(", ")}.` };
  }
  const missing = USER_PREFERENCE_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(rawPreferences, key));
  if (missing.length > 0) {
    return { ok: false, error: `The settings file is incomplete; missing ${missing.join(", ")}.` };
  }

  const preferences = sanitizeUserPreferences(rawPreferences);
  for (const key of USER_PREFERENCE_KEYS) {
    if (JSON.stringify(rawPreferences[key]) !== JSON.stringify(preferences[key])) {
      return { ok: false, error: `The settings file contains an invalid value for ${key}.` };
    }
  }
  return { ok: true, preferences };
}
