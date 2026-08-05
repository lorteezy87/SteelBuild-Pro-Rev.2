/** Pure helpers for FeatureFlagsAdmin page shell. */

export function coerceOverrides(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "boolean" && typeof k === "string" && k.length > 0) {
      out[k.toLowerCase()] = v;
    }
  }
  return out;
}

export function countEnabledFlags(flags: Array<{ enabled?: boolean | null }>): number {
  return (flags || []).filter((f) => f.enabled).length;
}

export function countOverrideEntries(
  flags: Array<{ user_overrides?: unknown }>,
): number {
  return (flags || []).reduce(
    (sum, f) => sum + Object.keys(coerceOverrides(f.user_overrides)).length,
    0,
  );
}

export function isValidOverrideEmail(email: string): boolean {
  const e = (email || "").trim().toLowerCase();
  return e.length > 0 && e.includes("@");
}

export function isValidFlagKey(key: string): boolean {
  return /^[a-z0-9_]+$/.test((key || "").trim());
}

export function mergeOverride(
  current: unknown,
  email: string,
  enabled: boolean,
): Record<string, boolean> {
  const e = (email || "").trim().toLowerCase();
  return { ...coerceOverrides(current), [e]: !!enabled };
}

export function removeOverride(current: unknown, email: string): Record<string, boolean> {
  const overrides = { ...coerceOverrides(current) };
  delete overrides[email];
  return overrides;
}

export function createEmptyFlagDraft(): { flag_key: string; description: string; enabled: boolean } {
  return { flag_key: "", description: "", enabled: false };
}

export function createEmptyOverrideDraft(): { email: string; enabled: boolean } {
  return { email: "", enabled: true };
}
