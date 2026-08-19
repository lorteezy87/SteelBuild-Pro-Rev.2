/**
 * ModuleDisabledNotice — what a user sees when they open a page whose module
 * is switched off (see src/config/moduleGating.js).
 *
 * Replaces a silent `<Navigate to="/" />`. That redirect was indistinguishable
 * from a broken link: the page vanished, the user landed on the Dashboard with
 * no message, and nothing said the module exists but is turned off — or how to
 * turn it on. Deep links, bookmarks, and the launcher all dead-ended the same
 * way.
 *
 * Deliberately NOT an error state: nothing failed. This is a configuration
 * surface that names the module, names the flag an admin flips, and links to
 * the admin page (which enforces its own admin gate, so linking it here leaks
 * no privilege).
 */

import { Link } from "react-router-dom";
import { MODULE_GATE_LABELS } from "@/config/moduleGating";

interface ModuleDisabledNoticeProps {
  /** Page key from src/config/routes.js, e.g. "Reports". */
  page: string;
  /** The module_* flag key gating this page. */
  flagKey: string | null;
}

const wrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  padding: "64px 24px",
  minHeight: 360,
  textAlign: "center",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  padding: "2px 6px",
  borderRadius: 4,
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface-low)",
  color: "var(--text-secondary)",
};

const linkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 36,
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
};

export default function ModuleDisabledNotice({ page, flagKey }: ModuleDisabledNoticeProps) {
  const moduleLabel = flagKey ? MODULE_GATE_LABELS[flagKey as keyof typeof MODULE_GATE_LABELS] : null;

  return (
    <div className="sb-dashboard-reference-page" style={wrap} role="region" aria-label="Module turned off">
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        Module turned off
      </div>

      <h2 style={{ fontFamily: "var(--font-body)", fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        {moduleLabel || page} isn’t enabled for this workspace
      </h2>

      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12.5,
          color: "var(--text-muted)",
          margin: 0,
          maxWidth: 460,
          lineHeight: 1.65,
        }}
      >
        This page exists but its module is switched off, so it’s hidden from the
        sidebar too. Nothing is broken and no data was lost — an admin can turn
        the module on and it will reappear everywhere.
      </p>

      {flagKey && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          Feature flag: <span style={codeStyle}>{flagKey}</span>
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
        <Link to="/FeatureFlagsAdmin" style={linkStyle}>
          Manage modules
        </Link>
        <Link to="/" style={{ ...linkStyle, background: "transparent", color: "var(--text-muted)" }}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
