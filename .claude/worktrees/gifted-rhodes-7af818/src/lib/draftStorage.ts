/**
 * draftStorage — lightweight pre-fill cache for cross-page navigation.
 *
 * When one page wants the next page's create form pre-filled (e.g. a
 * Constraint promoting itself to a Mitigation, or an Alert spinning off
 * into a CO request), it `setDraft(key, payload)` before navigating. The
 * destination page calls `takeDraft(key)` once on mount; the read auto-
 * removes the entry so a refresh of the destination doesn't rehydrate
 * the same draft.
 *
 * Key choices:
 *   - sessionStorage, not localStorage: drafts shouldn't survive a tab
 *     close; they're a one-shot navigation handoff.
 *   - Namespaced with "sbp:draft:" so this layer can't collide with the
 *     UI's other persistent prefs (theme, density, project pin).
 *   - Storage access is try/catch wrapped — Safari Private mode and a
 *     handful of embedded webviews throw on first access; we degrade
 *     to "no draft" rather than crashing the navigation.
 */

const NS = "sbp:draft:";

/**
 * Stash a draft payload for the next page to consume. Caller is
 * responsible for using a key the destination page recognises.
 */
export function setDraft<T>(key: string, payload: T): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(NS + key, JSON.stringify(payload));
  } catch {
    /* private mode / quota — silently degrade */
  }
}

/**
 * Read and consume a draft payload. Returns `null` if no draft is
 * stashed under the key, or if storage is unavailable, or if the
 * stored value is unparseable.
 *
 * The entry is removed BEFORE the parse attempt, so a malformed value
 * doesn't keep coming back round after round. A caller that wants to
 * peek without consuming should not exist — that pattern is what
 * caused the localStorage-as-message-bus drift this module replaces.
 */
export function takeDraft<T = unknown>(key: string): T | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(NS + key);
    if (raw == null) return null;
    sessionStorage.removeItem(NS + key);
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Drop a stashed draft without reading it. Useful for cancel paths —
 * a form modal that's been opened with a draft but the user decides
 * not to save can clear it so a later refresh doesn't bring it back.
 *
 * (takeDraft already clears on consume; this exists only for the
 * "I have an open form, I'm closing it without saving" path.)
 */
export function clearDraft(key: string): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(NS + key);
  } catch {
    /* ignore */
  }
}
