// Pure helpers extracted from TaskDetailDrawer.jsx — byte-identical bodies.
import { parseDependencies } from "../../services/scheduleCascade";

/** Coerce JSONB values that may come back from Postgres as strings or null. */
export function asIdArray(v) {
  if (Array.isArray(v)) return v.filter((id) => typeof id === "string" && id.length > 0);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id.length > 0) : [];
    } catch { return []; }
  }
  return [];
}

/** Compare two id-arrays for equality (order-insensitive). */
export function sameIdSet(a, b) {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (aa.length !== bb.length) return false;
  const sa = new Set(aa);
  for (const id of bb) if (!sa.has(id)) return false;
  return true;
}

/** Parse the upgraded `dependencies` TEXT column (link objects or legacy ids). */
export function parseDeps(raw) {
  return parseDependencies(raw);
}
