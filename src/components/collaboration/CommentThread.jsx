import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * CommentThread — polymorphic comment thread for any entity in the app.
 *
 * Usage:
 *   <CommentThread
 *     entityType="rfi"
 *     entityId={rfi.id}
 *     projectId={rfi.project_id}
 *   />
 *
 * Any entity_type accepted by the DB CHECK constraint on `comments`
 * (rfi, submittal, schedule_task, delivery, drawing_set, change_order,
 *  change_request, work_package, inspection, punchlist_item, daily_log,
 *  action_item, meeting, project) is supported. Project isolation is
 *  enforced server-side by RLS — we pass projectId for the INSERT path
 *  only so the current user's membership check can pass.
 *
 * Realtime: subscribes to Postgres changes on `comments` filtered by
 * entity so multiple users on the same RFI / task see updates live.
 * Fallback: React Query still polls on a slow interval if realtime is
 * unavailable (e.g. the Supabase instance is on a plan without
 * realtime).
 */

const QKEY = (entityType, entityId) => ["comments", entityType, entityId];

export default function CommentThread({
  entityType,
  entityId,
  projectId,
  currentUserName,     // optional override for author_name caching
  placeholder = "Write a comment…",
  maxRows = 6,
  compact = false,
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const scrollerRef = useRef(null);

  // Fetch
  const { data: comments = [], isLoading } = useQuery({
    queryKey: QKEY(entityType, entityId),
    queryFn: async () => {
      if (!entityId) return [];
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!entityId && !!entityType,
    staleTime: 30_000,
    refetchInterval: 60_000,       // fallback poll in case realtime is off
  });

  // Realtime subscription
  useEffect(() => {
    if (!entityId) return;
    const channel = supabase
      .channel(`comments:${entityType}:${entityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `entity_id=eq.${entityId}`,
        },
        () => {
          // Any insert/update/delete on this entity's comments → refetch.
          // Coarser than merging the payload but robust — the full-thread
          // query is cheap (indexed on entity_type + entity_id).
          qc.invalidateQueries({ queryKey: QKEY(entityType, entityId) });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [entityType, entityId, qc]);

  // Auto-scroll on new comments
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  const postMut = useMutation({
    mutationFn: async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed) throw new Error("Comment cannot be empty");
      const { data: { user } } = await supabase.auth.getUser();
      const authorId = user?.id || null;
      const authorName =
        currentUserName
        || user?.user_metadata?.full_name
        || user?.email?.split("@")[0]
        || "User";
      return await base44.entities.Comment.create({
        project_id:  projectId,
        entity_type: entityType,
        entity_id:   entityId,
        author_id:   authorId,
        author_name: authorName,
        body:        trimmed,
        mentions:    extractMentions(trimmed),
      });
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: QKEY(entityType, entityId) });
    },
    onError: (err) => toast.error(`Comment failed: ${err.message}`),
  });

  const handleSend = async () => {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    try { await postMut.mutateAsync(body); } finally { setSubmitting(false); }
  };

  const handleDelete = async (commentId) => {
    try {
      await base44.entities.Comment.delete(commentId);
      qc.invalidateQueries({ queryKey: QKEY(entityType, entityId) });
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`);
    }
  };

  const onKeyDown = (e) => {
    // Enter = send, Shift+Enter = newline (familiar from Slack/Teams).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: compact ? "8px 10px" : "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: "var(--bg-surface-low)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
        }}
      >
        {isLoading && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            Loading comments…
          </div>
        )}
        {!isLoading && comments.length === 0 && (
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
            No comments yet. Be the first to add context.
          </div>
        )}
        {comments.map((c) => (
          <CommentRow key={c.id} c={c} onDelete={handleDelete} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-end" }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          style={{
            flex: 1,
            resize: "vertical",
            minHeight: 40,
            maxHeight: maxRows * 22,
            padding: "10px 12px",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            background: "var(--bg-input)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!body.trim() || submitting}
          style={{
            padding: "10px 14px",
            background: !body.trim() || submitting ? "var(--bg-surface-high)" : "var(--accent)",
            color: !body.trim() || submitting ? "var(--text-muted)" : "#fff",
            border: "none",
            borderRadius: 6,
            cursor: !body.trim() || submitting ? "not-allowed" : "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
          title="Post comment (Enter)"
        >
          {submitting ? "…" : "Post"}
        </button>
      </div>
      <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
        Enter to post · Shift+Enter for new line · @name to mention
      </div>
    </div>
  );
}

// ── Private ────────────────────────────────────────────────────────────────

function CommentRow({ c, onDelete }) {
  const [hovering, setHovering] = useState(false);
  const when = useMemo(() => formatRelative(c.created_at), [c.created_at]);
  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: 6,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "var(--accent-muted)", color: "var(--accent)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
          }}
        >
          {initials(c.author_name)}
        </span>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
          {c.author_name || "User"}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>
          {when}
        </span>
        {hovering && (
          <button
            onClick={() => onDelete(c.id)}
            title="Delete comment"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--status-error)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              padding: "2px 4px",
            }}
          >
            Delete
          </button>
        )}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
        {renderBodyWithMentions(c.body)}
      </div>
    </div>
  );
}

function initials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function extractMentions(body) {
  const matches = body.match(/@[\w.-]+/g) || [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

function renderBodyWithMentions(body) {
  // Highlight @mentions visually. Not interactive routing here — keep it
  // simple: just visually distinguish them.
  const parts = String(body).split(/(@[\w.-]+)/g);
  return parts.map((part, i) => {
    if (/^@[\w.-]+$/.test(part)) {
      return (
        <span
          key={i}
          style={{
            background: "var(--accent-muted)",
            color: "var(--accent)",
            padding: "0 3px",
            borderRadius: 3,
            fontWeight: 600,
          }}
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function formatRelative(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}
