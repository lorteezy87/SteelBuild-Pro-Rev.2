/**
 * Load + persist drawing markup (redlines, shapes, clouds, stamps, notes).
 *
 * Ownership model (v2): one ROW PER MARKUP ITEM in `drawing_markups`
 * (migration 20260611140000) instead of the old drawings.markup JSONB blob.
 * That makes concurrent redlining safe — two reviewers adding marks at the
 * same time are independent INSERTs, not a whole-array last-writer-wins —
 * and stamps every mark with its author + timestamp.
 *
 * Realtime: the viewer subscribes to postgres_changes on drawing_markups,
 * so marks added by another user appear within a second or two without a
 * manual refresh.
 *
 * Column mapping (legacy columns reused — see migration header):
 *   kind     <-> markup_type        pdf_page <-> page_number
 *   text     <-> comment            geometry + extras <-> payload jsonb
 *
 * Item shape handed to AnnotationLayer (superset of the legacy shape):
 *   {
 *     id, kind, pdf_page, color, geom, text?, status, stamp?,
 *     created_at, author_id, author,          // display attribution
 *   }
 *
 * Mutations are optimistic against the React Query cache; text edits are
 * debounced per-item so the note editor doesn't fire an UPDATE per keystroke.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { assertSetUnlocked } from "@/lib/drawingHub";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

const UPDATE_DEBOUNCE_MS = 450;

// Reserved keys live in real columns; everything else rides in payload.
const RESERVED = new Set(["id", "kind", "pdf_page", "status", "text", "color", "created_at", "author_id", "author", "author_email"]);

function rowToItem(row) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  return {
    ...payload,
    id: row.id,
    kind: row.markup_type,
    pdf_page: row.page_number || 1,
    status: row.status || "open",
    text: row.comment ?? payload.text ?? "",
    color: row.color || payload.color,
    created_at: row.created_at,
    author_id: row.author_id || null,
    author: row.author_name || row.author_email || null,
  };
}

function itemToPayload(item) {
  const payload = {};
  for (const [key, value] of Object.entries(item || {})) {
    if (!RESERVED.has(key)) payload[key] = value;
  }
  return payload;
}

/** Resolve the signed-in user once per session for author attribution. */
let cachedAuthor = null;
async function resolveAuthor() {
  if (cachedAuthor) return cachedAuthor;
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    cachedAuthor = {
      id: user?.id || null,
      email: user?.email || null,
      name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || null,
    };
  } catch {
    cachedAuthor = { id: null, email: null, name: null };
  }
  return cachedAuthor;
}

export function useMarkup({ drawingId, projectId, drawingRevisionId = null }) {
  const qc = useQueryClient();
  const [pendingOps, setPendingOps] = useState(0);
  const [saveError, setSaveError] = useState(null);
  const queryKey = useMemo(() => ["drawing-markups", "viewer", drawingId], [drawingId]);

  const { data: items = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drawing_markups")
        .select("*")
        .eq("drawing_id", drawingId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map(rowToItem);
    },
    enabled: !!drawingId,
    staleTime: 15_000,
  });

  // Concurrent visibility: another reviewer's add/edit/delete invalidates
  // this drawing's markup cache (and the compare-modal family) live.
  useRealtimeInvalidation("drawing_markups", projectId, [queryKey]);

  useEffect(() => {
    setSaveError(null);
  }, [drawingId]);

  const trackOp = useCallback(async (op) => {
    setPendingOps((n) => n + 1);
    setSaveError(null);
    try {
      await op();
    } catch (err) {
      setSaveError(err?.message || "Save failed");
      // Refetch server truth so the optimistic cache can't drift after a
      // rejected write (lock, RLS, network).
      qc.invalidateQueries({ queryKey });
      throw err;
    } finally {
      setPendingOps((n) => Math.max(0, n - 1));
    }
  }, [qc, queryKey]);

  const setCache = useCallback((updater) => {
    qc.setQueryData(queryKey, (prev) => updater(Array.isArray(prev) ? prev : []));
  }, [qc, queryKey]);

  // ── add ────────────────────────────────────────────────────────────
  const addItem = useCallback((item) => {
    if (!drawingId || !projectId || !item) return;
    const id = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic = {
      ...item,
      id,
      status: item.status || "open",
      created_at: item.created_at || new Date().toISOString(),
    };
    setCache((prev) => [...prev, optimistic]);
    trackOp(async () => {
      await assertSetUnlocked(drawingId);
      const author = await resolveAuthor();
      const { error } = await supabase.from("drawing_markups").insert({
        id,
        project_id: projectId,
        drawing_id: drawingId,
        drawing_revision_id: drawingRevisionId || null,
        markup_type: optimistic.kind,
        page_number: optimistic.pdf_page || 1,
        status: optimistic.status,
        comment: optimistic.text || null,
        color: optimistic.color || null,
        payload: itemToPayload(optimistic),
        author_id: author.id,
        author_email: author.email,
        author_name: author.name,
      });
      if (error) throw error;
      // Stamp the author onto the optimistic item so attribution shows
      // immediately (the realtime echo would do it eventually).
      setCache((prev) => prev.map((m) => (
        m.id === id ? { ...m, author_id: author.id, author: author.name || author.email } : m
      )));
    }).catch(() => {
      setCache((prev) => prev.filter((m) => m.id !== id));
    });
  }, [drawingId, projectId, drawingRevisionId, setCache, trackOp]);

  // ── remove ─────────────────────────────────────────────────────────
  const removeItem = useCallback((id) => {
    if (!id) return;
    let removed = null;
    setCache((prev) => {
      removed = prev.find((m) => m.id === id) || null;
      return prev.filter((m) => m.id !== id);
    });
    trackOp(async () => {
      await assertSetUnlocked(drawingId);
      const { error } = await supabase.from("drawing_markups").delete().eq("id", id);
      if (error) throw error;
    }).catch(() => {
      if (removed) setCache((prev) => [...prev, removed]);
    });
  }, [drawingId, setCache, trackOp]);

  // ── update (debounced per item — note typing fires per keystroke) ──
  const updateTimersRef = useRef(new Map()); // id -> { timer, patch }

  const flushUpdate = useCallback((id) => {
    const entry = updateTimersRef.current.get(id);
    if (!entry) return;
    updateTimersRef.current.delete(id);
    const merged = (qc.getQueryData(queryKey) || []).find((m) => m.id === id);
    if (!merged) return;
    trackOp(async () => {
      await assertSetUnlocked(drawingId);
      const { error } = await supabase
        .from("drawing_markups")
        .update({
          status: merged.status || "open",
          comment: merged.text || null,
          color: merged.color || null,
          page_number: merged.pdf_page || 1,
          payload: itemToPayload(merged),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    }).catch(() => { /* cache already refetched by trackOp */ });
  }, [drawingId, qc, queryKey, trackOp]);

  const updateItem = useCallback((id, patch) => {
    if (!id || !patch) return;
    setCache((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    const existing = updateTimersRef.current.get(id);
    if (existing?.timer) clearTimeout(existing.timer);
    const timer = setTimeout(() => flushUpdate(id), UPDATE_DEBOUNCE_MS);
    updateTimersRef.current.set(id, { timer });
  }, [setCache, flushUpdate]);

  // Flush pending debounced updates on unmount / drawing switch so an
  // in-progress note edit survives navigation.
  useEffect(() => {
    const timers = updateTimersRef.current;
    return () => {
      for (const id of [...timers.keys()]) {
        const entry = timers.get(id);
        if (entry?.timer) clearTimeout(entry.timer);
        flushUpdate(id);
      }
    };
  }, [drawingId, flushUpdate]);

  return {
    items,
    saving: pendingOps > 0,
    saveError,
    addItem,
    removeItem,
    updateItem,
  };
}
