/**
 * drawingHub/setLock.js — Set-level edit lock for drawing_sets.
 *
 * Migration 071 added is_locked / locked_at / locked_by / locked_reason on
 * drawing_sets. When a set is locked, the DB now enforces a write barrier
 * across the core hub mutation tables (drawings, drawing_zones,
 * drawing_links, and drawing_zone_dependencies) via triggers.
 * This module's `assertSetUnlocked()` guard is a defense-in-depth layer
 * for interactive clients, while DB-level enforcement blocks service-role
 * and direct DB writes too.
 *
 * Lock granularity is the SET, not the sheet. A sheet's drawing row points
 * back to drawing_sets via drawing_set_id; we resolve the set and check
 * its is_locked flag. Sheets that aren't part of any set (legacy uploads
 * with drawing_set_id = NULL) are always considered unlocked, since
 * there's no parent record to flip.
 *
 * Admin-only unlock is gated client-side via usePermissions().isAdmin in
 * the UI layer; this module enforces nothing about WHO can lock or
 * unlock — RLS handles project membership and the UI gates the action.
 */

import { supabase } from "@/lib/supabase";

/** Lock actor, timestamp and permission are enforced by the server command. */
async function setLock({ setId, locked, reason, expectedUpdatedAt }) {
  if (!setId) throw new Error("setId required");
  if (!locked && !reason?.trim()) throw new Error("Unlock reason required.");
  if (!expectedUpdatedAt) throw new Error("Reviewed set version required. Reload the drawing set.");
  if (new TextEncoder().encode(reason || "").length > 65536) throw new Error("Lock reason exceeds the supported limit.");
  const { data, error } = await supabase.rpc("set_drawing_set_lock", {
    p_set_id: setId, p_locked: locked, p_reason: reason || null,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw error;
  return data;
}
export async function lockSet({ setId, reason = null, expectedUpdatedAt = null } = {}) {
  return setLock({ setId, locked: true, reason, expectedUpdatedAt });
}
export async function unlockSet({ setId, reason = null, expectedUpdatedAt = null } = {}) {
  return setLock({ setId, locked: false, reason, expectedUpdatedAt });
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
