/**
 * Slide-out right-side drawer that hosts the AI chat.
 *
 * Owns the conversation state via useScheduleAssistant. Mounts inside a
 * fixed overlay so it can slide over any page. The active project (from
 * ProjectContext) scopes every answer; if no project is selected we
 * show a nudge instead of letting the user type into a dead endpoint.
 */

import React, { useEffect, useRef, useState } from "react";
import { X, Send, RotateCcw, Sparkles } from "lucide-react";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { useScheduleAssistant } from "./useScheduleAssistant";
import AiMessageBubble from "./AiMessageBubble";

const mono = { fontFamily: "var(--font-mono)" };

const STARTER_PROMPTS = [
  "Top delay risks in the next 3 weeks?",
  "Which RFIs have been open the longest?",
  "What deliveries are late for their need date?",
  "Summarize project status for leadership.",
];

export default function AiAssistantDrawer({ open, onClose }) {
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id || null;

  const { messages, sending, error, send, reset } = useScheduleAssistant({ projectId });

  const [draft, setDraft] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when messages arrive.
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending]);

  // Focus input when drawer opens; close on Escape.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open, onClose, sending]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    const text = draft.trim();
    if (!text || sending || !projectId) return;
    send(text);
    setDraft("");
  };

  const handleKeyDown = (e) => {
    // Cmd/Ctrl+Enter submits; plain Enter inserts a newline.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      role="dialog"
      aria-label="SteelBuild Pro AI"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(440px, 100vw)",
        zIndex: 520,
        background: "var(--bg-surface-low)",
        borderLeft: "1px solid var(--border-strong)",
        boxShadow: "-12px 0 32px rgba(0,0,0,0.55)",
        display: "flex",
        flexDirection: "column",
        animation: "sbp-ai-slide-in 180ms ease-out",
      }}
    >
      <style>{SLIDE_IN_KEYFRAMES}</style>

      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--divider)",
          background: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles size={16} style={{ color: "var(--accent)" }} />
          <div>
            <div
              style={{
                fontFamily: "Space Grotesk, var(--font-display)",
                fontSize: 14,
                fontWeight: 800,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              Schedule Assistant
            </div>
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
              {activeProject ? activeProject.name : "No project selected"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              title="Clear conversation"
              style={iconBtn}
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button type="button" onClick={onClose} title="Close (Esc)" style={iconBtn}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {!projectId ? (
          <EmptyState
            title="Pick a project first"
            body="The assistant answers project-scoped questions. Use the project switcher up top, then ask your question here."
          />
        ) : messages.length === 0 ? (
          <EmptyState
            title="Ask anything about this project"
            body="Tool-backed answers grounded in live data. Every reply cites evidence and declares confidence."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setDraft(p); inputRef.current?.focus(); }}
                  style={starterBtn}
                >
                  {p}
                </button>
              ))}
            </div>
          </EmptyState>
        ) : (
          messages.map((m, i) => <AiMessageBubble key={i} message={m} />)
        )}

        {sending && (
          <div
            style={{
              ...mono,
              fontSize: 10,
              color: "var(--accent)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "8px 4px",
            }}
          >
            <span className="sbp-ai-dots">Thinking</span>
          </div>
        )}

        {error && (
          <div
            style={{
              ...mono,
              fontSize: 11,
              color: "var(--status-error)",
              background: "var(--danger-muted)",
              border: "1px solid var(--danger-border, rgba(255,61,61,0.3))",
              padding: "8px 10px",
              borderRadius: 4,
            }}
          >
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: "10px 12px",
          borderTop: "1px solid var(--divider)",
          background: "var(--bg-surface)",
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <textarea
          ref={inputRef}
          id="sbp-ai-composer"
          name="sbp-ai-composer"
          aria-label="Ask the SteelBuild Pro AI"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            projectId
              ? "Ask about schedule, RFIs, deliveries…  (Ctrl+Enter to send)"
              : "Select a project to enable"
          }
          disabled={!projectId || sending}
          rows={2}
          style={{
            flex: 1,
            resize: "none",
            minHeight: 40,
            maxHeight: 140,
            padding: "8px 10px",
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            lineHeight: 1.4,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!projectId || sending || !draft.trim()}
          title="Send (Ctrl+Enter)"
          style={{
            height: 40,
            padding: "0 14px",
            background: "var(--accent)",
            color: "var(--accent-text)",
            border: "none",
            borderRadius: 6,
            cursor: !projectId || sending || !draft.trim() ? "not-allowed" : "pointer",
            opacity: !projectId || sending || !draft.trim() ? 0.5 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            ...mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          <Send size={14} /> Send
        </button>
      </form>
    </div>
  );
}

function EmptyState({ title, body, children }) {
  return (
    <div
      style={{
        margin: "auto",
        maxWidth: 340,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "24px 12px",
      }}
    >
      <Sparkles size={20} style={{ color: "var(--accent)", alignSelf: "center", opacity: 0.7 }} />
      <div
        style={{
          fontFamily: "Space Grotesk, var(--font-display)",
          fontSize: 14,
          fontWeight: 800,
          color: "var(--text-primary)",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{body}</div>
      {children}
    </div>
  );
}

const iconBtn = {
  width: 26,
  height: 26,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 4,
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: 0,
};

const starterBtn = {
  textAlign: "left",
  padding: "6px 10px",
  fontSize: 12,
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 4,
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
};

const SLIDE_IN_KEYFRAMES = `
@keyframes sbp-ai-slide-in {
  from { transform: translateX(24px); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
.sbp-ai-dots::after {
  content: "…";
  animation: sbp-ai-dots 1.2s steps(4) infinite;
}
@keyframes sbp-ai-dots {
  0%   { content: ".";   }
  25%  { content: "..";  }
  50%  { content: "..."; }
  75%  { content: "..";  }
  100% { content: ".";   }
}
`;
