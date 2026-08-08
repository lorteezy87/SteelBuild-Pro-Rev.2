import {
  PREFERENCES_VERSION,
  sanitizeUserPreferences,
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
  return { ok: true, preferences: sanitizeUserPreferences(record.preferences) };
}
