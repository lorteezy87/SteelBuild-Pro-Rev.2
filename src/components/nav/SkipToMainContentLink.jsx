import React from "react";

/**
 * SkipToMainContentLink — first focusable element on the page.
 * Sighted users never see it (it's sr-only until focused), but keyboard
 * and screen-reader users can press Tab once and land on a "Skip to
 * main content" affordance that focuses #main-content.
 *
 * Extracted from Layout.jsx (see git history).
 */
export default function SkipToMainContentLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only"
      style={{
        position: "absolute",
        top: 4, left: 4,
        background: "var(--accent)",
        color: "var(--on-accent)",
        padding: "6px 12px",
        borderRadius: 6,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        textDecoration: "none",
        zIndex: 9999,
      }}
    >
      Skip to main content
    </a>
  );
}
