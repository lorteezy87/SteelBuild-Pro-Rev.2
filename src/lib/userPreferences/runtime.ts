import {
  DEFAULT_USER_PREFERENCES,
  sanitizeUserPreferences,
  type UserPreferences,
} from "./schema";

let runtimePreferences: UserPreferences = { ...DEFAULT_USER_PREFERENCES };

export function setRuntimeUserPreferences(input: unknown): UserPreferences {
  runtimePreferences = sanitizeUserPreferences(input);
  return runtimePreferences;
}

export function getRuntimeUserPreferences(): UserPreferences {
  return runtimePreferences;
}
