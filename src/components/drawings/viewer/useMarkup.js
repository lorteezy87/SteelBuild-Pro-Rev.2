/**
 * Load + persist drawing markup (redlines, shapes, arrows, notes).
 *
 * Ownership model: markup lives in `drawings.markup` JSONB (migration 045).
 * The hook keeps a local working copy (optimistic) and debounces writes
 * back to Supabase. Every markup entry is the full shape — we replace the
 * whole array each save. Drawings rarely have more than ~50 markup items,
 * so the JSONB write is cheap.
 *
 * Each entry shape:
 *   {
 *     id: string,           // newMarkupId()
 *     kind: "pen" | "rect" | "arrow" | "note",
 *     pdf_page: number,     // which page of the source PDF
 *     color: string,        // hex (default varies per tool)
 *     geom: {...}           // kind-specific; see AnnotationLayer render paths
 *     text?: string,        // notes only
 *     created_at: ISO string,
 *     created_by?: string,  // reserved for future
 *   }
 *
 * A markup entry is per-pdf_page. When rendering on a given page we
 * filter `items.filter(m => m.pdf_page === currentPage)`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { assertSetUnlocked } from "@/lib/drawingHub";

const SAVE_DEBOUNCE_MS = 500;

export function useMarkup({ drawingId, initialMarkup }) {
  const [items, setItems] = useState(() => normalize(initialMarkup));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const saveTimerRef = useRef(null);
  const latestRef = useRef(items);
  const dirtyRef = useRef(false);
  const drawingIdRef = useRef(drawingId);

  // When the active drawing changes, reload from the fresh markup array.
  // We also cancel any pending save to avoid writing stale data to the
  // previously-active drawing.
  useEffect(() => {
    setItems(normalize(initialMarkup));
    latestRef.current = normalize(initialMarkup);
    dirtyRef.current = false;
    drawingIdRef.current = drawingId;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaving(false);
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingId]);

  // Persist latestRef.current to Supabase for the drawing id that was
  // active when the timer fired. If the user has since switched drawings
  // (drawingIdRef diverged), we silently drop the write — the new
  // drawing's hook instance will reload fresh data anyway.
  const flush = useCallback(async () => {
    saveTimerRef.current = null;
    const targetId = drawingIdRef.current;
    if (!targetId || !dirtyRef.current) return;
    const payload = latestRef.current;
    dirtyRef.current = false;

    setSaving(true);
    setSaveError(null);
    try {
      // Lock guard. If the parent set is locked, surface a recognisable
      // error to the UI and stop attempting writes — re-marking dirty
      // would just retry into another rejection.
      await assertSetUnlocked(targetId);
      const { error } = await supabase
        .from("drawings")
        .update({ markup: payload })
        .eq("id", targetId);
      if (error) throw error;
    } catch (err) {
      setSaveError(err.message || "Save failed");
      // For lock rejections, do NOT re-mark dirty — retrying just
      // burns a write per debounce until the user gives up.
      if (err?.code !== "DRAWING_SET_LOCKED") {
        dirtyRef.current = true;
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  const mutate = useCallback((updater) => {
    setItems((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      latestRef.current = next;
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  const addItem = useCallback((item) => {
    // Default status to "open" so the resolution-status filter has a
    // value to match against. Notes lean on this to render a status
    // pill; other kinds carry the field as inert metadata.
    const withDefaults = item && item.status === undefined
      ? { ...item, status: "open" }
      : item;
    mutate((prev) => [...prev, withDefaults]);
  }, [mutate]);

  const removeItem = useCallback((id) => {
    mutate((prev) => prev.filter((m) => m.id !== id));
  }, [mutate]);

  const updateItem = useCallback((id, patch) => {
    mutate((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, [mutate]);

  // Flush on unmount so in-flight edits survive tab close / nav away.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        if (dirtyRef.current) {
          // fire-and-forget; we can't await in a cleanup.
          flush();
        }
      }
    };
  }, [flush]);

  return {
    items,
    saving,
    saveError,
    addItem,
    removeItem,
    updateItem,
  };
}

function normalize(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((m) => m && typeof m === "object" && m.id && m.kind);
}
