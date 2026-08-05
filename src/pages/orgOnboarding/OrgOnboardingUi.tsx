/** Presentational chrome for Org Onboarding. */
import type { ReactNode } from "react";

export function OrgOnboardingShell({
  children,
  email,
  onSignOut,
}: {
  children: ReactNode;
  email?: string | null;
  onSignOut?: () => void;
}) {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg-base, #0D1117)" }}>
      <div style={{ width: "100%", maxWidth: 460, background: "var(--bg-surface-secondary, #161B22)", border: "1px solid var(--border-default)", borderRadius: 14, padding: "32px 28px", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--accent)", fontWeight: 800 }}>
          SteelBuild Pro
        </div>
        {children}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{email || "Signed in"}</span>
          <button type="button" onClick={onSignOut} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
