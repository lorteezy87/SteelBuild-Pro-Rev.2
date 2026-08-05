/**
 * tapeStore.js — pure, node-testable tape persistence helpers.
 *
 * All functions that touch storage accept an optional `storage` argument
 * (defaults to globalThis.localStorage when available) so tests can inject
 * a fake without touching real browser globals.
 */

/** @param {Storage|null} [storage] */
function getStorage(storage) {
  if (storage !== undefined) return storage;
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

/**
 * Load tape rows from storage.
 * @param {string} key
 * @param {Storage|null} [storage]
 * @returns {Array}
 */
export function load(key, storage) {
  const store = getStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(key);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save tape rows to storage.
 * @param {string} key
 * @param {Array} rows
 * @param {Storage|null} [storage]
 */
export function save(key, rows, storage) {
  const store = getStorage(storage);
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(rows));
  } catch {
    // quota exceeded or private mode — silently swallow
  }
}

/**
 * Prepend entry to rows, capping the array at limit.
 * Pure — returns a new array; does NOT mutate rows.
 * @param {Array} rows
 * @param {*} entry
 * @param {number} limit
 * @returns {Array}
 */
export function pushRow(rows, entry, limit) {
  const next = [entry, ...rows];
  return next.length > limit ? next.slice(0, limit) : next;
}
