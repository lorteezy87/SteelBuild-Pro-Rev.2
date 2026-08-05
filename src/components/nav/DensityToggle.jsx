import React from "react";
import { useUserPrefs } from "@/hooks/useUserPrefs";
import { auth } from "@/api/supabaseClient";
import { toast } from "sonner";

/**
 * DensityToggle — top-utility-bar button that switches the app between compact
 * and comfortable density. One click drives BOTH density systems:
 *
 *   1. The dashboard's `dashboard_density` USER PREFERENCE — persisted via
 *      auth.updateMe (→ Supabase user_metadata). The resulting USER_UPDATED auth
 *      event refreshes AuthContext, so the Dashboard's KPI strip + section
 *      spacing re-render live. This is the signal the dashboard actually reads
 *      (useUserPrefs → DashboardHeader), so it's what makes the toggle visibly
 *      "work" on the dashboard. Same persistence path as Settings → Dashboard →
 *      Density, so the two stay in sync.
 *
 *   2. The `<html data-density>` attribute (+ `sbp-density` localStorage) — drives
 *      --density-row-height on the row-based list pages (Resources / Change
 *      Orders / RFIs). Mirrored instantly here so one control covers both.
 *
 * Not covered: the big project-dashboard panels (Schedule / Financials / Document
 * Hub) are custom-styled and not density-aware, so they don't change. Making them
 * react is separate, larger work.
 */
export default function DensityToggle() {
  const { dashboard_density } = useUserPrefs();
  const isCompact = dashboard_density === "compact";

  const handleToggle = () => {
    const next = isCompact ? "comfortable" : "compact";
    // Instant: mirror to the legacy attribute for list-page row height.
    try {
      document.documentElement.setAttribute("data-density", next);
      localStorage.setItem("sbp-density", next);
    } catch { /* ignore storage failures */ }
    // Persist the dashboard density pref; the USER_UPDATED auth event refreshes
    // AuthContext → the Dashboard re-renders at the new density.
    auth.updateMe({ dashboard_density: next }).catch(() => {
      toast.error("Couldn't save density preference");
    });
  };

  return (
    <div
      title={isCompact ? "Density: compact (click for comfortable)" : "Density: comfortable (click for compact)"}
      role="button"
      tabIndex={0}
      aria-pressed={isCompact}
      aria-label="Toggle compact density"
      className="sbd-btn-ghost"
      onClick={handleToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); } }}
      style={{
        width: 32, height: 32, borderRadius: 8,
        background: isCompact ? "var(--accent-muted)" : "var(--hover-bg)",
        border: `1px solid ${isCompact ? "var(--accent-border)" : "var(--border)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: isCompact ? "var(--accent)" : "var(--text-muted)", transition: "all 0.15s",
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-muted)"; e.currentTarget.style.color = "var(--accent)"; }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isCompact ? "var(--accent-muted)" : "var(--hover-bg)";
        e.currentTarget.style.color = isCompact ? "var(--accent)" : "var(--text-muted)";
      }}
    >
      {/* Lines sit tighter in compact mode as a subtle state cue. */}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
        {isCompact ? (
          <><line x1="2" y1="4" x2="12" y2="4" /><line x1="2" y1="7" x2="12" y2="7" /><line x1="2" y1="10" x2="12" y2="10" /></>
        ) : (
          <><line x1="2" y1="3" x2="12" y2="3" /><line x1="2" y1="7" x2="12" y2="7" /><line x1="2" y1="11" x2="12" y2="11" /></>
        )}
      </svg>
    </div>
  );
}
