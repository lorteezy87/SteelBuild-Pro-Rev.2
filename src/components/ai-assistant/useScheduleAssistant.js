/**
 * React hook that drives the AI chat panel.
 *
 * Posts a conversation to the `schedule-assistant` edge function with the
 * user's current session JWT. Returns the ongoing messages list + a
 * `send()` function + loading/error state.
 *
 * State shape for each message:
 *   {
 *     role: "user" | "assistant",
 *     content: string,              // plain text / markdown
 *     provenance?: Provenance,      // only on assistant replies (derived)
 *     tool_calls?: ToolCallLog[],   // only on assistant replies (debug)
 *     iterations?: number,          // only on assistant replies
 *   }
 *
 * We keep messages the model sees separate from the rendered timeline so
 * that tool-result blocks (which the model needs but the user doesn't
 * want to read) never leak into the UI.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/schedule-assistant`;

/**
 * Extract the latest tool_call's provenance from the audit log, if any.
 * The edge function returns tool_calls[] with { tool, input, result: {ok,
 * data, error, provenance} }. We bubble up the last successful call's
 * provenance so the chat bubble can render the confidence line + any
 * staleness / gap chips without needing the full tool payload.
 */
function pickLatestProvenance(toolCalls) {
  if (!Array.isArray(toolCalls)) return null;
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const p = toolCalls[i]?.result?.provenance;
    if (p) return p;
  }
  return null;
}

export function useScheduleAssistant({ projectId }) {
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  // Abort the in-flight request if the user sends another message or
  // closes the drawer.
  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Whenever the active project changes, start a fresh thread — answers
  // are project-scoped and mixing them would be confusing.
  useEffect(() => {
    setMessages([]);
    setError(null);
    abortRef.current?.abort();
  }, [projectId]);

  const send = useCallback(async (text) => {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    if (!projectId) {
      setError("Pick a project first — answers are project-scoped.");
      return;
    }

    const userMessage = { role: "user", content: trimmed };
    // Snapshot the history WE'RE SENDING to the model: all prior messages
    // (only content + role, ignore UI-only fields) + the new user turn.
    const outbound = [...messages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setSending(true);
    setError(null);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not signed in — reload and sign in again to use the AI.");
      }

      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          project_id: projectId,
          messages: outbound,
        }),
        signal: ctrl.signal,
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body?.error || `Edge function returned ${res.status}`);
      }

      const answer = body?.answer || "(no answer)";
      const provenance = pickLatestProvenance(body?.tool_calls);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: answer,
          provenance,
          tool_calls: body?.tool_calls ?? [],
          iterations: body?.iterations ?? null,
          usage: body?.usage ?? null,
        },
      ]);
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Request failed");
    } finally {
      setSending(false);
    }
  }, [messages, projectId]);

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    abortRef.current?.abort();
  }, []);

  return { messages, sending, error, send, reset };
}
