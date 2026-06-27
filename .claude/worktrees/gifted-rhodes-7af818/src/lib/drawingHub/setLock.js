/**
 * drawingHub/setLock.js — Set-level edit lock for drawing_sets.
 *
 * Migration 071 added is_locked / locked_at / locked_by / locked_reason on
 * drawing_sets. When a set is locked, every write path that mutates a
 * sheet's zones, links, dependencies, or markup MUST refuse to proceed.
 * The DB does NOT enforce the lock — RLS only checks project membership —
 * so this module's `assertSetUnlocked()` guard is the single source of
 * truth for the rule.
 *
 * Lock granularity is the SET, not the sheet. A sheet's drawing row points
 * back to drawing_sets via drawing_set_id; we resolve the set and check
 * its is_locked flag. Sheets that aren't part of any set (legacy uploads
 * with drawing_set_id = NULL) are always considered unlocked, since
 * there's no parent record to flip.
 *
 * Admin-only unlock is gated client-side via useAppSecurity().isAdmin in
 * the UI layer; this module enforces nothing about WHO can lock or
 * unlock — RLS handles project membership and the UI gates the action.
 */

import { supabase } from "@/lib/supabase";

/**
 * Mark a drawing set locked. Idempotent — calling lock on an already-locked
 * set just refreshes locked_reason / locked_at. Returns the updated row.
 */
export async function lockSet({ setId, reason = null, userId = null } = {}) {
  if (!setId) throw new Error("lockSet: setId required");
  const { data, error } = await supabase
    .from("drawing_sets")
    .update({
      is_locked:     true,
      locked_at:     new Date().toISOString(),
      locked_by:     userId,
      locked_reason: reason ? String(reason).slice(0, 2000) : null,
    })
    .eq("id", setId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Clear the lock. The audit columns (locked_at / locked_by / locked_reason)
 * are nulled out so a future lock pass starts fresh. Returns the updated
 * row.
 */
export async function unlockSet({ setId } = {}) {
  if (!setId) throw new Error("unlockSet: setId required");
  const { data, error } = await supabase
    .from("drawing_sets")
    .update({
      is_locked:     false,
      locked_at:     null,
      locked_by:     null,
      locked_reason: null,
    })
    .eq("id", setId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Pure predicate over a drawing_sets row. Truthy when the row is locked.
 * Tolerates missing/legacy rows by returning false — callers that already
 * have the row don't need to defend against null.
 */
export function isSetLocked(set) {
  return !!(set && set.is_locked === true);
}

/**
 * Look up `drawing_id → drawing.drawing_set_id → drawing_sets.is_locked`
 * and throw a recognisable error if the set is locked. Service-layer
 * write paths (createZone, updateZone, deleteZone, createLink, removeLink,
 * addZoneDependency, removeZoneDependency, useMarkup write paths) call
 * this before mutating anything.
 *
 * Sheets without a parent set (drawing_set_id NULL) resolve as unlocked.
 *
 * Throws an Error whose message starts with "DRAWING_SET_LOCKED:" so the
 * UI can recognise the rejection reason without string-matching the rest
 * of the message.
 */
export async function assertSetUnlocked(drawingId) {
  if (!drawingId) return; // nothing to check; caller's earlier validation will catch missing IDs

  const { data: drawing, error: dErr } = await supabase
    .from("drawings")
    .select("id, drawing_set_id")
    .eq("id", drawingId)
    .maybeSingle();
  if (dErr) throw dErr;
  // If we can't see the drawing, RLS or a stale ID — let the original
  // mutation surface its own clearer error rather than throwing a lock
  // error here.
  if (!drawing) return;
  if (!drawing.drawing_set_id) return;

  const { data: set, error: sErr } = await supabase
    .from("drawing_sets")
    .select("id, is_locked, locked_reason, set_name")
    .eq("id", drawing.drawing_set_id)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!set) return;

  if (isSetLocked(set)) {
    const tag = set.set_name ? ` "${set.set_name}"` : "";
    const reason = set.locked_reason ? ` — ${set.locked_reason}` : "";
    const err = new Error(
      `DRAWING_SET_LOCKED: This drawing's set${tag} is locked from edits${reason}. ` +
      `An admin must unlock the set before changes can be made.`
    );
    err.code = "DRAWING_SET_LOCKED";
    err.drawingSetId = set.id;
    throw err;
  }
}
