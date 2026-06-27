import React from "react";
import { AlertTriangle } from "lucide-react";

export default function ErrorState({ title = "Couldn't load this", message, onRetry }) {
  return (
    <div className="desk-state" role="alert">
      <AlertTriangle size={28} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--status-error, #f0655a)" }} />
      <div className="desk-state__title">{title}</div>
      {message ? <div className="desk-state__msg">{message}</div> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} style={{ marginTop: 4, fontSize: 12, color: "var(--text-primary)", background: "var(--bg-surface)", border: "1px solid var(--border-default, var(--border))", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
