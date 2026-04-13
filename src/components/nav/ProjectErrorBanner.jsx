import React from "react";
import { useProjectContext } from "@/components/shared/useProjectContext";

export default function ProjectErrorBanner() {
  const { projectLoadError } = useProjectContext();
  if (!projectLoadError) return null;
  return (
    <div style={{
      marginBottom: 16, padding: "12px 16px",
      background: "var(--warning-muted)",
      border: "1px solid var(--warning-border)",
      borderLeft: "4px solid var(--status-error)",
      borderRadius: "var(--radius-card)",
      fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--status-error)",
    }}>
      <strong>{"\u26A0"} Project data unavailable:</strong> {projectLoadError}
      <span style={{ color: "var(--text-muted)", marginLeft: 12 }}>
        &mdash; Verify the Project entity schema exists in the Base44 app admin.
      </span>
    </div>
  );
}
