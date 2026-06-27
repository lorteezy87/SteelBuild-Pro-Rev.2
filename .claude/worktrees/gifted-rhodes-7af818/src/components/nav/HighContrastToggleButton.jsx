/**
 * HighContrastToggleButton — quick-access top-bar control.
 *
 * Gives field workers a one-tap way to flip high-contrast mode on/off
 * without diving into Settings > Display > Accessibility. The button
 * sits next to the existing ThemeToggleButton in the app top bar.
 *
 * When active, adds a subtle accent ring so the user knows the mode is
 * engaged. Uses the same ThemeContext.setContrast() path as the
 * Settings toggle so the preference persists to localStorage and the
 * user-prefs Supabase row.
 */

import React from "react";
import { useTheme } from "@/components/shared/ThemeContext";

export default function HighContrastToggleButton() {
  const { contrast, setContrast } = useTheme();
  const isHigh = contrast === "high";

  const toggle = () => setContrast(isHigh ? "normal" : "high");

  return (
    <button
      onClick={toggle}
      title={isHigh ? "Switch to normal contrast" : "Switch to high contrast (field mode)"}
      aria-pressed={isHigh}
      aria-label="Toggle high contrast mode"
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: isHigh ? "var(--accent-muted)" : "var(--bg-hover)",
        border: `1px solid ${isHigh ? "var(--accent-border)" : "var(--border)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: isHigh ? "var(--accent)" : "var(--text-muted)",
        transition: "all 0.15s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isHigh
          ? "var(--accent-muted)"
          : "var(--nav-hover-bg)";
        e.currentTarget.style.color = isHigh
          ? "var(--accent-light)"
          : "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isHigh
          ? "var(--accent-muted)"
          : "var(--bg-hover)";
        e.currentTarget.style.color = isHigh
          ? "var(--accent)"
          : "var(--text-muted)";
      }}
    >
      {/* Eye icon — a universal "visibility / contrast" signifier.
          When active, the pupil gets a small highlight ring. */}
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
        {isHigh && (
          <circle
            cx="12"
            cy="12"
            r="5"
            strokeWidth="1.5"
            strokeDasharray="2 2"
            opacity="0.7"
          />
        )}
      </svg>
    </button>
  );
}
