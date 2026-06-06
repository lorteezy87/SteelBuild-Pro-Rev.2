import React from "react";
import * as Sentry from "@sentry/react";
import { logError } from "@/lib/telemetry";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logError(error, {
      boundary: "section",
      label: this.props.label || "section",
      componentStack: errorInfo?.componentStack,
    });
    // Report React render errors to Sentry (no-op if no DSN is configured).
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo?.componentStack } },
      tags: { boundary: "section", section: this.props.label || "section" },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="sbd-card" style={{
          padding: 24, textAlign: "center",
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 8, margin: 8
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            color: "var(--status-error)", letterSpacing: "0.10em",
            textTransform: "uppercase", marginBottom: 8
          }}>
            {this.props.label || "SECTION"} — LOAD ERROR
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
            {import.meta.env.DEV
              ? (this.state.error?.message || "Something went wrong")
              : "Something went wrong. Please retry or refresh the page."}
          </div>
          <button
            className="sbd-btn"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "6px 16px", borderRadius: 4,
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)", color: "var(--text-primary)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              cursor: "pointer", textTransform: "uppercase"
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
